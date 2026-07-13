import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appServerExitError, appServerSpawnError, findUserCodexExecutable, resolveAppServerCommand } from "../runtime/app-server-client.js";

test("non-Windows app-server commands are preserved", () => {
  assert.equal(resolveAppServerCommand("codex", "linux"), "codex");
  assert.equal(resolveAppServerCommand("custom-codex", "win32"), "custom-codex");
});

test("unified ChatGPT user runtime discovery prefers the newest extracted Codex", () => {
  const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), "oca-chatgpt-runtime-"));
  const older = path.join(localAppData, "OpenAI", "Codex", "bin", "older", "codex.exe");
  const newer = path.join(localAppData, "OpenAI", "Codex", "bin", "newer", "codex.exe");
  fs.mkdirSync(path.dirname(older), { recursive: true });
  fs.mkdirSync(path.dirname(newer), { recursive: true });
  fs.writeFileSync(older, "older");
  fs.writeFileSync(newer, "newer");
  fs.utimesSync(older, new Date(1_000), new Date(1_000));
  fs.utimesSync(newer, new Date(2_000), new Date(2_000));
  assert.equal(findUserCodexExecutable(localAppData), newer);
  fs.rmSync(localAppData, { recursive: true, force: true });
});

test("Codex state permission failures receive an actionable desktop explanation", () => {
  const error = appServerExitError(1, "failed to initialize sqlite state runtime under C:\\Users\\demo\\.codex: 拒绝访问。");
  assert.match(error.message, /Codex 数据目录不可写/);
  assert.match(error.message, /Windows 开始菜单/);
  assert.match(error.message, /技术详情/);
});

test("ordinary app-server failures retain their original detail", () => {
  assert.equal(appServerExitError(7, "unexpected failure").message, "app-server exited with code 7: unexpected failure");
});

test("sandboxed process launch failures explain how to reopen the desktop app", () => {
  const source = Object.assign(new Error("spawn EPERM"), { code: "EPERM" });
  const error = appServerSpawnError(source);
  assert.match(error.message, /当前启动环境不允许/);
  assert.match(error.message, /不要从 Codex 内/);
  assert.match(error.message, /spawn EPERM/);
});

test("missing Codex executable explains the dependency", () => {
  const source = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
  assert.match(appServerSpawnError(source).message, /ChatGPT.*Codex/);
});
