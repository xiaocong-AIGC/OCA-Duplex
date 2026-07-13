import fs from "node:fs/promises";
import path from "node:path";
import { stdout as output } from "node:process";
import { discoverConfigPath, loadConfig } from "../runtime/config.js";
import { commandText, compareVersions, runLocalCommand } from "../runtime/process-info.js";
import { option } from "./args.js";

function check(label, ok, detail) {
  output.write(`${ok ? "OK" : "FAIL"}  ${label}${detail ? `：${detail}` : ""}\n`);
  return ok;
}

export async function runDoctor(args) {
  const configPath = await discoverConfigPath({ explicitPath: option(args, "--config") });
  const config = await loadConfig(configPath);
  output.write("OCA-Duplex Doctor\n\n");
  const results = [];
  results.push(check("配置", true, configPath));
  results.push(check("Vault", Boolean((await fs.stat(config.vaultRoot).catch(() => null))?.isDirectory()), config.vaultRoot));
  results.push(check("Node.js", Number(process.versions.node.split(".")[0]) >= 20, process.version));

  const codex = runLocalCommand(config.appServer.command ?? "codex", ["--version"]);
  const codexText = commandText(codex);
  const codexOk = codex.status === 0;
  results.push(check("Codex CLI", codexOk, codexText || codex.error?.message));
  if (codexOk && config.appServer.minimumCodexVersion) {
    const comparison = compareVersions(codexText, config.appServer.minimumCodexVersion);
    results.push(check("Codex 最低版本", comparison !== null && comparison >= 0, `最低 ${config.appServer.minimumCodexVersion}`));
    const tested = compareVersions(codexText, config.appServer.testedCodexVersion);
    if (tested === 1) output.write(`WARN Codex ${codexText} 高于已验证版本 ${config.appServer.testedCodexVersion}，建议先运行 dry-run。\n`);
  }

  const login = runLocalCommand(config.appServer.command ?? "codex", ["login", "status"]);
  results.push(check("Codex 登录", login.status === 0, login.status === 0 ? "已登录" : commandText(login)));

  if (config.capture.mode === "safe") {
    for (const entry of config.capture.workspaces) {
      const exists = Boolean((await fs.stat(entry.path).catch(() => null))?.isDirectory());
      results.push(check(`工作区 → ${entry.project}`, exists, entry.path));
    }
  }
  results.push(check("稳定 API", config.appServer.experimentalApi !== true, config.appServer.experimentalApi ? "当前开启实验 API" : "实验 API 已关闭"));
  if (config.capture.includeToolResults === true) output.write("WARN 工具结果保存已开启；请确认 Vault 的访问和 Git 发布范围。\n");
  else check("工具结果隐私", true, "默认不保存");

  const git = runLocalCommand("git", ["-C", config.vaultRoot, "status", "--short"]);
  if (git.status === 0) check("Git", true, commandText(git) ? "工作区有未提交变更；提交模式只处理本轮文件" : "仓库干净");
  else output.write("WARN Git 不可用或 Vault 尚未初始化；不影响 dry-run 和不提交写入。\n");

  const ok = results.every(Boolean);
  output.write(`\n结果：${ok ? "可以运行" : "存在必须修复的问题"}\n`);
  if (!ok) process.exitCode = 1;
  return { ok, configPath, config };
}
