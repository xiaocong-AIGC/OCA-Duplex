import { EventEmitter } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { JsonLineRouter } from "./json-line-router.js";

function findWindowsExecutable(filename) {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const where = path.join(systemRoot, "System32", "where.exe");
  const result = spawnSync(where, [filename], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return null;
  return String(result.stdout).split(/\r?\n/).map((value) => value.trim()).find(Boolean) ?? null;
}

export function findUserCodexExecutable(localAppData = process.env.LOCALAPPDATA) {
  if (!localAppData) return null;
  const root = path.join(localAppData, "OpenAI", "Codex", "bin");
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, "codex.exe"))
      .filter((candidate) => existsSync(candidate))
      .map((candidate) => ({ candidate, modified: statSync(candidate).mtimeMs }))
      .sort((left, right) => right.modified - left.modified)[0]?.candidate ?? null;
  } catch {
    return null;
  }
}

export function resolveAppServerCommand(command, platform = process.platform) {
  if (platform !== "win32" || !/^codex(?:\.exe)?$/i.test(command)) return command;
  // The unified ChatGPT app extracts a user-scoped Codex runtime. Prefer it over
  // the protected WindowsApps copy because ordinary Win32 integrations can
  // launch it without package execution restrictions.
  return findUserCodexExecutable() ?? findWindowsExecutable("codex.exe") ?? command;
}

export function appServerExitError(code, detail = "") {
  const technical = String(detail).trim();
  const permissionFailure = /failed to initialize (?:sqlite )?state runtime|failed to clean up stale arg0|access (?:is )?denied|拒绝访问/i.test(technical);
  if (permissionFailure) {
    return new Error([
      "Codex 数据目录不可写，OCA-Duplex 无法读取任务。",
      "如果应用是从 Codex 内的文件链接启动，请完全退出后，从 Windows 开始菜单或桌面快捷方式重新打开 OCA-Duplex。",
      "如果刚刚才打开或更新 ChatGPT，也需要完全退出并重新启动 OCA-Duplex。",
      "如果仍然失败，请检查当前 Windows 账户是否对用户目录下的 .codex 文件夹拥有写入权限。",
      technical ? `技术详情：${technical}` : `app-server 退出代码：${code}`
    ].join("\n"));
  }
  return new Error(`app-server exited with code ${code}${technical ? `: ${technical}` : ""}`);
}

export function appServerSpawnError(error) {
  if (["EPERM", "EACCES"].includes(error?.code)) {
    return new Error([
      "当前启动环境不允许 OCA-Duplex 启动 Codex 进程。",
      "请完全退出 OCA-Duplex，然后从 Windows 开始菜单或桌面快捷方式重新打开；不要从 Codex 内的文件链接直接启动应用。",
      "如果刚刚才打开或更新 ChatGPT，也需要完全退出并重新启动 OCA-Duplex。",
      `技术详情：${error.message}`
    ].join("\n"));
  }
  if (error?.code === "ENOENT") {
    return new Error("没有找到 codex.exe。请先安装或更新新版 ChatGPT 桌面应用，并确认其中的 Codex 可以正常打开。\n技术详情：" + error.message);
  }
  return error;
}

function spawnAppServer(command, args) {
  const options = { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] };
  if (process.platform !== "win32") return spawn(command, args, options);
  const resolved = resolveAppServerCommand(command);
  if (/\.exe$/i.test(resolved)) return spawn(resolved, args, options);
  const quote = (value) => {
    const text = String(value);
    if (/[\r\n&|<>^%]/.test(text)) throw new Error(`Unsafe app-server argument: ${text}`);
    if (/\s/.test(text)) throw new Error(`Whitespace is not supported in Windows app-server arguments: ${text}`);
    return text;
  };
  const commandLine = [resolved, ...args].map(quote).join(" ");
  return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], options);
}

export class AppServerClient extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.router = new JsonLineRouter();
    this.stderrTail = "";
    this.router.on("response", (message) => this.#handleResponse(message));
    this.router.on("notification", (message) => this.emit("notification", message));
    this.router.on("protocolError", (error, line) => this.emit("protocolError", error, line));
  }

  async start() {
    if (this.child) return;
    const { command, args = [] } = this.options;
    try {
      this.child = spawnAppServer(command, args);
    } catch (error) {
      throw appServerSpawnError(error);
    }
    const lines = readline.createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.router.ingest(line));
    this.child.stderr.on("data", (chunk) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-8000);
      this.emit("stderr", String(chunk));
    });
    this.child.on("error", (error) => this.#failAll(appServerSpawnError(error)));
    this.child.on("close", (code) => {
      const detail = this.stderrTail.trim();
      this.#failAll(appServerExitError(code, detail));
      this.child = null;
      this.emit("close", code);
    });

    const capabilities = this.options.experimentalApi ? { experimentalApi: true } : undefined;
    try {
      await this.request("initialize", {
        clientInfo: { name: "oca-duplex", title: "OCA-Duplex", version: "1.0.0-beta.1" },
        ...(capabilities ? { capabilities } : {})
      });
    } catch (error) {
      throw appServerSpawnError(error);
    }
    this.notify("initialized");
  }

  request(method, params = {}) {
    if (!this.child?.stdin?.writable) throw new Error("app-server is not running");
    const id = this.nextId++;
    const timeoutMs = this.options.requestTimeoutMs ?? 45000;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`app-server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(String(id), { resolve, reject, timeout, method });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  notify(method, params) {
    if (!this.child?.stdin?.writable) throw new Error("app-server is not running");
    const message = params === undefined ? { method } : { method, params };
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async stop() {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    child.stdin.end();
    if (!child.killed) child.kill();
  }

  #handleResponse(message) {
    const pending = this.pending.get(String(message.id));
    if (!pending) {
      this.emit("orphanResponse", message);
      return;
    }
    this.pending.delete(String(message.id));
    clearTimeout(pending.timeout);
    if (message.error) {
      const error = new Error(`${pending.method}: ${message.error.message ?? "app-server error"}`);
      error.code = message.error.code;
      error.data = message.error.data;
      pending.reject(error);
    } else {
      pending.resolve(message.result);
    }
  }

  #failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
