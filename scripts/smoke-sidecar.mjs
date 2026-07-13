import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const executable = path.join(root, "desktop", "src-tauri", "binaries", "oca-duplex-sidecar-x86_64-pc-windows-msvc.exe");
const vaultRoot = await fs.mkdtemp(path.join(root, ".sidecar-smoke-"));
const initialize = JSON.stringify({ id: 1, method: "system.initialize", params: { vaultRoot, locale: "zh-CN", mode: "manual", workspaces: [] } });
try {
  const initialized = JSON.parse((await exec(executable, ["--request", initialize])).stdout);
  if (!initialized.ok) throw new Error(initialized.error?.message ?? "initialize failed");
  const configPath = path.join(vaultRoot, ".oca-duplex", "config.json");
  const overview = JSON.parse((await exec(executable, ["--config", configPath, "--request", JSON.stringify({ id: 2, method: "system.overview" })])).stdout);
  if (!overview.ok || overview.result.locale !== "zh-CN") throw new Error("overview failed");
  process.stdout.write(`${JSON.stringify({ ok: true, configPath, overview: overview.result }, null, 2)}\n`);
} finally {
  const resolved = path.resolve(vaultRoot);
  if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith(".sidecar-smoke-")) throw new Error(`Unsafe smoke cleanup target: ${resolved}`);
  await fs.rm(resolved, { recursive: true, force: true });
}
