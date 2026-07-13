import { createInterface } from "node:readline";
import { localizeProjectName, localizeVisiblePath } from "../vault/path-map.js";

export const WATCH_STATES = Object.freeze([
  "idle",
  "scanning",
  "planning",
  "awaiting_confirmation",
  "writing",
  "skipped",
  "exiting"
]);

function destinationLabel(entry) {
  if (entry.type === "source") return "原始记录";
  if (entry.type === "digest") return "内容整理";
  if (entry.type === "output") return "输出成果";
  if (entry.type === "knowledge" && entry.scope === "global") return "全局知识整理";
  if (entry.type === "knowledge") return "知识整理";
  if (entry.type === "prompt" && entry.scope === "global") return "全局提示词";
  if (entry.type === "prompt") return "项目提示词";
  if (entry.type === "project_home") return "项目首页";
  return entry.type;
}

export function formatConfirmPrompt(report) {
  const resolution = report.project_resolution ?? {
    project_name: "未归类Codex捕获",
    category: "需要人工归类",
    confidence: 0,
    source: "heuristic",
    reason: "无项目识别结果",
    needs_confirmation: true
  };
  const summary = report.human_summary;
  const contentEntries = report.obsidian_write_plan.filter((entry) => ["source", "digest", "knowledge", "output", "prompt"].includes(entry.type));
  const files = contentEntries.map((entry, index) => `${index + 1}. ${destinationLabel(entry)}：${localizeVisiblePath(entry.target)}`).join("\n");
  const confirmationNotice = resolution.needs_confirmation || resolution.confidence < 0.75
    ? "* 项目归属：需要确认项目归属"
    : null;
  const noDerived = (summary.content_digests_to_create ?? 0) === 0
    && (summary.project_outputs_to_create ?? 0) === 0
    && (summary.project_knowledge_to_create ?? 0) === 0
    && (summary.project_prompt_to_create ?? 0) === 0
    && (summary.global_knowledge_to_create ?? 0) === 0
    && (summary.global_prompt_to_create ?? 0) === 0;
  const sourceOnlyReason = noDerived ? `\n${summary.reason ?? "本轮只写入原始对话，因为没有检测到可复用内容、可执行方案或明确结论。"}` : "";
  return [
    "OCA-Duplex 检测到新的 Codex 对话更新",
    "",
    "识别结果：",
    "",
    `* 项目：${localizeProjectName(resolution.project_name)}`,
    `* 分类：${resolution.category ?? "项目知识"}`,
    `* 置信度：${Number(resolution.confidence ?? 0).toFixed(2)}`,
    `* 依据：${resolution.reason}`,
    confirmationNotice,
    "",
    "计划写入：",
    "",
    `* 原始记录：${summary.source_notes_to_create ?? 0} 篇`,
    `* 内容整理：${summary.content_digests_to_create ?? 0} 篇`,
    `* 知识整理：${summary.project_knowledge_to_create ?? 0} 篇`,
    `* 输出成果：${summary.project_outputs_to_create ?? 0} 篇`,
    `* 项目提示词：${summary.project_prompt_to_create ?? 0} 篇`,
    `* 未归类：${summary.unsorted_captures ?? 0} 篇`,
    sourceOnlyReason,
    "",
    "写入位置：",
    "",
    files || "（本轮没有内容文件）",
    "",
    "请输入：",
    "[y] 写入并提交",
    "[n] 跳过本次",
    "[q] 退出监听",
    ""
  ].filter((line) => line !== null).join("\n");
}

export class WatchInputStateMachine {
  constructor({ input = null, writeOutput = (text) => process.stdout.write(text), heartbeatMs = 60000, now = () => new Date(), onQuit = null } = {}) {
    this.input = input;
    this.writeOutput = writeOutput;
    this.heartbeatMs = heartbeatMs;
    this.now = now;
    this.onQuit = onQuit;
    this.state = "idle";
    this.readline = null;
    this.heartbeat = null;
    this.pendingDecision = null;
    this.started = false;
    this.lastIdleNoticeAt = 0;
    this.rawModeEnabled = false;
    this.onData = null;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.state = "idle";
    if (this.input) {
      if (this.input.isTTY && typeof this.input.setRawMode === "function") {
        this.input.setEncoding?.("utf8");
        this.input.setRawMode(true);
        this.rawModeEnabled = true;
        this.onData = (chunk) => this.receiveChunk(chunk);
        this.input.on("data", this.onData);
        this.input.resume?.();
      } else {
        this.readline = createInterface({ input: this.input, terminal: false });
        this.readline.on("line", (line) => this.receive(line));
      }
    }
    if (this.heartbeatMs > 0) {
      this.heartbeat = setInterval(() => {
        if (this.state === "exiting") return;
        const time = this.now().toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        this.writeOutput(`OCA-Duplex 正在监听中，最近检查时间：${time}\n`);
      }, this.heartbeatMs);
    }
    this.writeOutput("OCA-Duplex watch:confirm 已启动\n正在监听 Codex 对话更新\n输入 q 可随时退出\n");
  }

  receiveChunk(chunk) {
    for (const char of String(chunk ?? "")) {
      if (char === "\u0003") {
        this.requestQuit();
        return;
      }
      const choice = char.trim().toLowerCase();
      if (!choice) continue;
      this.receive(choice);
    }
  }

  transition(next) {
    if (!WATCH_STATES.includes(next)) throw new Error(`Unknown watch state: ${next}`);
    if (this.state === "exiting" && next !== "exiting") return;
    this.state = next;
  }

  waitForDecision() {
    if (this.state === "exiting") return Promise.resolve("q");
    if (this.pendingDecision) throw new Error("A confirmation decision is already pending.");
    this.transition("awaiting_confirmation");
    return new Promise((resolve) => {
      this.pendingDecision = { resolve };
    });
  }

  receive(value) {
    const choice = String(value ?? "").trim().toLowerCase();
    if (!choice) return { accepted: false, reason: "empty" };
    if (choice === "q") {
      this.requestQuit();
      return { accepted: true, action: "quit" };
    }
    if (this.state === "awaiting_confirmation" && ["y", "n"].includes(choice)) {
      const pending = this.pendingDecision;
      this.pendingDecision = null;
      pending?.resolve(choice);
      return { accepted: true, action: choice };
    }
    if (this.state === "awaiting_confirmation") {
      this.writeOutput("请输入 y、n 或 q。\n");
      return { accepted: false, reason: "invalid_confirmation" };
    }
    this.writeOutput("当前正在监听中，输入 q 可退出。\n");
    return { accepted: false, reason: "not_awaiting_confirmation" };
  }

  notifyNoUpdates({ force = false } = {}) {
    if (this.state === "exiting") return;
    this.transition("idle");
    const now = Date.now();
    if (force || now - this.lastIdleNoticeAt >= 60000) {
      this.writeOutput("当前没有新的 Codex 对话更新，继续监听中\n");
      this.lastIdleNoticeAt = now;
    }
  }

  requestQuit() {
    if (this.state === "exiting") return;
    this.state = "exiting";
    const pending = this.pendingDecision;
    this.pendingDecision = null;
    pending?.resolve("q");
    this.writeOutput("正在退出 OCA-Duplex watch:confirm。\n");
    this.cleanup();
    Promise.resolve(this.onQuit?.()).catch((error) => this.writeOutput(`退出清理失败：${error.message}\n`));
  }

  cleanup() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.onData && this.input) this.input.removeListener("data", this.onData);
    this.onData = null;
    if (this.rawModeEnabled && this.input && typeof this.input.setRawMode === "function") {
      try { this.input.setRawMode(false); } catch (_) { /* noop */ }
    }
    this.rawModeEnabled = false;
    if (this.readline) {
      this.readline.removeAllListeners("line");
      this.readline.close();
    }
    this.readline = null;
  }

  stop() {
    this.state = "exiting";
    const pending = this.pendingDecision;
    this.pendingDecision = null;
    pending?.resolve("q");
    this.cleanup();
  }
}

class LegacyDecisionAdapter {
  constructor(askChoice) {
    this.askChoice = askChoice;
    this.state = "idle";
  }
  start() {}
  stop() { this.state = "exiting"; }
  transition(next) { this.state = next; }
  notifyNoUpdates() { this.state = "idle"; }
  async waitForDecision() { this.state = "awaiting_confirmation"; return String(await this.askChoice()).trim().toLowerCase(); }
}

export class ConfirmWatchController {
  constructor({ tracker, inputController = null, askChoice = null, input = null, writeOutput = (text) => process.stdout.write(text), heartbeatMs = 60000, onQuit = null }) {
    this.tracker = tracker;
    this.writeOutput = writeOutput;
    this.inputController = inputController ?? (askChoice
      ? new LegacyDecisionAdapter(askChoice)
      : new WatchInputStateMachine({ input, writeOutput, heartbeatMs, onQuit }));
  }

  get state() {
    return this.inputController.state;
  }

  start() {
    this.inputController.start();
  }

  stop() {
    this.inputController.stop();
  }

  scanning() {
    this.inputController.transition("scanning");
  }

  notifyNoUpdates(options) {
    this.inputController.notifyNoUpdates(options);
  }

  async handle(snapshot) {
    if (this.state === "exiting") return { action: "quit" };
    this.inputController.transition("planning");
    const preview = await this.tracker.preview(snapshot);
    if (this.state === "exiting") return { action: "quit", preview };
    const shouldCommit = this.tracker.config?.write?.commit !== false;
    const prompt = shouldCommit
      ? formatConfirmPrompt(preview)
      : formatConfirmPrompt(preview).replace("[y] 写入并提交", "[y] 写入（不提交 Git）");
    this.writeOutput(`${prompt}\n`);

    while (true) {
      const choice = await this.inputController.waitForDecision();
      if (choice === "q") return { action: "quit", preview };
      if (choice === "y") {
        this.inputController.transition("writing");
        const report = await this.tracker.execute(snapshot, { commit: shouldCommit, userChoice: "y" });
        this.writeOutput(shouldCommit
          ? `写入并提交完成：${report.execution.commit_hash ?? "no-commit"}\n继续监听新的 Codex 对话更新\n输入 q 可退出监听\n`
          : "写入完成（未提交 Git）\n继续监听新的 Codex 对话更新\n输入 q 可退出监听\n");
        if (this.state !== "exiting") this.inputController.transition("idle");
        return { action: shouldCommit ? "committed" : "written", report };
      }
      if (choice === "n") {
        this.inputController.transition("skipped");
        const result = await this.tracker.skip(snapshot, { userChoice: "n" });
        this.writeOutput("已跳过并记录，本轮不会再次提示\n继续监听新的 Codex 对话更新\n输入 q 可退出监听\n");
        if (this.state !== "exiting") this.inputController.transition("idle");
        return { action: "skipped", result, preview };
      }
      this.writeOutput("请输入 y、n 或 q。\n");
    }
  }
}
