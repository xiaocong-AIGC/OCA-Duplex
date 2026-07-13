import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyUnit } from "../core/classifier.js";
import { ConfirmWatchController, WatchInputStateMachine, formatConfirmPrompt } from "../runtime/confirm-watch.js";
import { ContextBuffer } from "../runtime/context-buffer.js";
import { parseArgs } from "../index.js";

function makeConfig(vaultRoot) {
  return {
    vaultRoot,
    classification: {
      minimumWriteConfidence: 0.72,
      paths: { inbox: "00_收件箱", knowledge: "30_知识库", prompt: "50_提示词", project: "10_项目", source: "30_来源" }
    },
    projectRouting: { root: "10_项目", unsorted: "00_收件箱/未归类Codex捕获", minimumConfidence: 0.75 },
    dashboard: { path: "90_系统/oca-duplex/系统看板.md" },
    state: { path: "90_System/oca-duplex/runtime-state.json" }
  };
}

function previewReport() {
  return {
    project_resolution: {
      project_name: "Obsidian自动知识系统",
      project_slug: "obsidian自动知识系统",
      category: "交互修复 / 运行流程",
      confidence: 0.96,
      reason: "识别到显式项目词：OCA-Duplex",
      source: "thread_title"
    },
    source: { thread_id: "thread-confirm", turn_id: "turn-confirm", turn_status: "completed" },
    human_summary: {
      captured_messages: 3,
      source_notes_to_create: 1,
      project_home_to_create: 1,
      content_digests_to_create: 1,
      project_outputs_to_create: 1,
      project_knowledge_to_create: 1,
      project_prompt_to_create: 1,
      global_knowledge_to_create: 0,
      global_prompt_to_create: 0,
      unsorted_captures: 0,
      skipped_fragments: 7,
      reason: "test"
    },
    obsidian_write_plan: [
      { type: "project_home", target: "10_项目/Obsidian自动知识系统/Obsidian自动知识系统.md" },
      { type: "source", target: "10_项目/Obsidian自动知识系统/01_原始记录/example.md" },
      { type: "digest", scope: "project", target: "10_项目/Obsidian自动知识系统/02_知识整理/digest.md" },
      { type: "knowledge", scope: "project", target: "10_项目/Obsidian自动知识系统/02_知识整理/example.md" },
      { type: "output", scope: "project", target: "10_项目/Obsidian自动知识系统/04_输出成果/output.md" },
      { type: "prompt", scope: "project", target: "10_项目/Obsidian自动知识系统/03_提示词/example.md" }
    ]
  };
}
function snapshot() {
  return { thread: { id: "thread-confirm" }, turn: { id: "turn-confirm" } };
}

test("prompt classification routes to 50_提示词 without affecting other type folders", () => {
  const reusableText = "A reusable prompt workflow defines explicit inputs, output contracts, safety constraints, approval rules, failure handling, versioning, audit evidence, and repeatable execution steps. It also explains how a Codex skill should preserve source context, avoid overwriting existing notes, stage only affected files, request confirmation before writes, and keep every accepted change reversible through Git history.";
  const base = {
    unit_id: "KU-routing",
    title: "Codex Prompt 与 Skill 规则",
    text: reusableText,
    tags: ["codex", "prompt", "skill"],
    source_thread_id: "thread-routing",
    source_turn_id: "turn-routing",
    reusable_value: true
  };
  const config = makeConfig("D:\\ObsidianVault");
  assert.match(classifyUnit({ ...base, type_hint: "prompt" }, config).recommended_target, /^50_提示词\//);
  assert.match(classifyUnit({ ...base, type_hint: "knowledge" }, config).recommended_target, /^30_知识库\//);
  assert.match(classifyUnit({ ...base, type_hint: "project" }, config).recommended_target, /^10_项目\//);
});

test("confirmation prompt includes summary, counts, file list, and choices", () => {
  const text = formatConfirmPrompt(previewReport());
  assert.match(text, /OCA-Duplex 检测到新的 Codex 对话更新/);
  assert.match(text, /项目：Obsidian自动知识系统/);
  assert.match(text, /置信度：0\.96/);
  assert.match(text, /内容整理：1 篇/);
  assert.match(text, /输出成果：1 篇/);
  assert.match(text, /项目提示词：1 篇/);
  assert.match(text, /10_项目\/Obsidian自动知识系统\/03_提示词\/example\.md/);
  assert.match(text, /\[y\] 写入并提交/);
  assert.match(text, /\[n\] 跳过本次/);
  assert.match(text, /\[q\] 退出监听/);
});

test("y invokes the write and commit path", async () => {
  let executeOptions = null;
  const tracker = {
    preview: async () => previewReport(),
    execute: async (_snapshot, options) => {
      executeOptions = options;
      return { execution: { committed: true, commit_hash: "abc123" } };
    }
  };
  const output = [];
  const controller = new ConfirmWatchController({ tracker, askChoice: async () => "y", writeOutput: (text) => output.push(text) });
  const result = await controller.handle(snapshot());
  assert.equal(result.action, "committed");
  assert.deepEqual(executeOptions, { commit: true, userChoice: "y" });
  assert.match(output.join(""), /abc123/);
});

test("n records a skipped decision", async () => {
  let skipOptions = null;
  const tracker = {
    preview: async () => previewReport(),
    skip: async (_snapshot, options) => {
      skipOptions = options;
      return { status: "skipped" };
    }
  };
  const controller = new ConfirmWatchController({ tracker, askChoice: async () => "n", writeOutput: () => {} });
  const result = await controller.handle(snapshot());
  assert.equal(result.action, "skipped");
  assert.deepEqual(skipOptions, { userChoice: "n" });
});

test("q exits without writing or skipping", async () => {
  let mutated = false;
  const tracker = {
    preview: async () => previewReport(),
    execute: async () => { mutated = true; },
    skip: async () => { mutated = true; }
  };
  const controller = new ConfirmWatchController({ tracker, askChoice: async () => "q", writeOutput: () => {} });
  const result = await controller.handle(snapshot());
  assert.equal(result.action, "quit");
  assert.equal(mutated, false);
});


test("idle state accepts q and cleans up the global watch input", () => {
  const output = [];
  let quitCalled = 0;
  const input = new WatchInputStateMachine({
    writeOutput: (text) => output.push(text),
    heartbeatMs: 0,
    onQuit: () => { quitCalled += 1; }
  });
  input.start();
  assert.equal(input.state, "idle");
  input.receive("other");
  assert.match(output.join(""), /当前正在监听中/);
  input.receive("q");
  assert.equal(input.state, "exiting");
  assert.equal(quitCalled, 1);
});

test("after y commit the controller returns to idle and q still exits", async () => {
  const output = [];
  let quitCalled = 0;
  const input = new WatchInputStateMachine({ writeOutput: (text) => output.push(text), heartbeatMs: 0, onQuit: () => { quitCalled += 1; } });
  const tracker = {
    preview: async () => previewReport(),
    execute: async () => ({ execution: { commit_hash: "commit-y" } })
  };
  const controller = new ConfirmWatchController({ tracker, inputController: input, writeOutput: (text) => output.push(text) });
  controller.start();
  const pending = controller.handle(snapshot());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.state, "awaiting_confirmation");
  input.receive("y");
  const result = await pending;
  assert.equal(result.action, "committed");
  assert.equal(controller.state, "idle");
  input.receive("q");
  assert.equal(controller.state, "exiting");
  assert.equal(quitCalled, 1);
  assert.match(output.join(""), /继续监听新的 Codex 对话更新/);
});

test("after n skip the controller returns to idle and q still exits", async () => {
  let quitCalled = 0;
  const input = new WatchInputStateMachine({ writeOutput: () => {}, heartbeatMs: 0, onQuit: () => { quitCalled += 1; } });
  const tracker = {
    preview: async () => previewReport(),
    skip: async () => ({ status: "skipped" })
  };
  const controller = new ConfirmWatchController({ tracker, inputController: input, writeOutput: () => {} });
  controller.start();
  const pending = controller.handle(snapshot());
  await new Promise((resolve) => setImmediate(resolve));
  input.receive("n");
  const result = await pending;
  assert.equal(result.action, "skipped");
  assert.equal(controller.state, "idle");
  input.receive("q");
  assert.equal(controller.state, "exiting");
  assert.equal(quitCalled, 1);
});
test("runtime state v2 records skipped turns and prevents repeated prompts", async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oca-context-v2-"));
  const config = makeConfig(vaultRoot);
  const first = new ContextBuffer(config);
  await first.load();
  first.record({
    threadId: "thread-confirm",
    turnId: "turn-confirm",
    mode: "skipped",
    files: [],
    commitHash: null,
    userChoice: "n",
    processedAt: "2026-06-23T10:00:00.000Z"
  });
  await first.save();

  const second = new ContextBuffer(config);
  await second.load();
  assert.equal(second.hasProcessed("turn-confirm"), true);
  assert.equal(second.select([{ thread: { id: "thread-confirm" }, turn: { id: "turn-confirm", completed_at: "2026-06-23T10:00:00.000Z" } }]).length, 0);
  const state = JSON.parse(await fs.readFile(path.join(vaultRoot, config.state.path), "utf8"));
  assert.equal(state.version, 2);
  assert.deepEqual(state.processed_thread_ids, ["thread-confirm"]);
  assert.equal(state.records[0].mode, "skipped");
  assert.equal(state.records[0].user_choice, "n");
  assert.deepEqual(state.records[0].files, []);
  assert.equal(state.records[0].commit_hash, null);
  await fs.rm(vaultRoot, { recursive: true, force: true });
});

test("CLI accepts watch confirm and rejects unsafe combinations", () => {
  const args = parseArgs(["--watch", "--confirm"]);
  assert.equal(args.watch, true);
  assert.equal(args.confirm, true);
  assert.throws(() => parseArgs(["--confirm"]), /requires --watch/);
  assert.throws(() => parseArgs(["--watch", "--confirm", "--write"]), /controls write and commit/);
});

test("CLI accepts exact turn filters for two-phase desktop confirmation", () => {
  const args = parseArgs(["--once", "--thread", "thread-1", "--turn", "turn-1", "--turn", "turn-2"]);
  assert.deepEqual(args.threadIds, ["thread-1"]);
  assert.deepEqual(args.turnIds, ["turn-1", "turn-2"]);
});
