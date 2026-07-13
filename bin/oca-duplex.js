#!/usr/bin/env node
import { stdout as output, stderr } from "node:process";
import { runCli } from "../runtime/cli-runner.js";
import { discoverConfigPath, loadConfig } from "../runtime/config.js";
import { option, options, hasFlag } from "../commands/args.js";
import { runInit } from "../commands/init.js";
import { runMode, runWorkspace, showConfig } from "../commands/configure.js";
import { runLayout } from "../commands/layout.js";
import { runDoctor } from "../commands/doctor.js";
import { runThreads } from "../commands/threads.js";
import { listAliases, addAlias, removeAlias } from "../scripts/alias-tools.js";
import { listRecentRecords, buildProjectMovePlan, applyProjectMovePlan, runProjectCorrect } from "../scripts/project-tools.js";
import { writeToday } from "../scripts/today.js";
import { buildBackfillDigestPlan, applyBackfillDigestPlan } from "../scripts/backfill-digests.js";

function help() {
  return `OCA-Duplex

把多个项目中的本地 Codex 对话，按项目分别写入一个个人 Obsidian Vault。

首次安装：
  oca-duplex init
  oca-duplex doctor

日常使用：
  oca-duplex watch                         持续监听，逐条确认后写入
  oca-duplex sync                          预览尚未处理的任务（dry-run）
  oca-duplex sync --write                  写入但不提交 Git
  oca-duplex sync --write --commit         写入并精确提交本轮文件
  oca-duplex threads [--all] [--pick]      查看或选择 Codex 任务
  oca-duplex alias list|add|remove          管理项目别名
  oca-duplex project recent|correct|move    查看或纠正项目路由
  oca-duplex today                          生成今日同步报告
  oca-duplex backfill [--apply]             回填旧 Source 的整理和输出

捕获模式：
  oca-duplex mode                          查看当前模式
  oca-duplex mode safe                     安全模式（需要工作区映射）
  oca-duplex mode manual                   手动模式
  oca-duplex mode all --yes                全部模式

工作区映射：
  oca-duplex workspace list
  oca-duplex workspace add --path "D:\\Project" --project "项目名"
  oca-duplex workspace remove 1

目录语言：
  oca-duplex init --language zh-CN|en-US
  oca-duplex layout                       查看当前目录体系
  oca-duplex layout --language en-US      预览语言切换与冲突
  oca-duplex layout --language en-US --apply --yes

通用选项：
  --config <path>  指定配置文件
  --thread <id>    指定一个任务；可以重复
`;
}

async function runtimeArgs(args, command) {
  const configPath = await discoverConfigPath({ explicitPath: option(args, "--config") });
  const config = await loadConfig(configPath);
  output.write(`模式：${config.capture.mode} | Vault：${config.vaultRoot}\n`);
  if (config.capture.mode === "safe") {
    for (const entry of config.capture.workspaces) output.write(`允许：${entry.path} → ${entry.project}\n`);
  } else if (config.capture.mode === "all") {
    output.write("警告：全部模式会检查所有最近的 Codex 项目。\n");
  }

  const forwarded = [command === "watch" ? "--watch" : "--once", "--config", configPath];
  if (command === "watch") forwarded.push("--confirm");
  else if (hasFlag(args, "--write")) forwarded.push("--write");
  else forwarded.push("--dry-run");
  if (hasFlag(args, "--commit")) forwarded.push("--commit");
  for (const threadId of options(args, "--thread")) forwarded.push("--thread", threadId);
  const limit = option(args, "--turn-limit");
  if (limit) forwarded.push("--turn-limit", limit);
  return forwarded;
}

async function openedConfig(args) {
  const configPath = await discoverConfigPath({ explicitPath: option(args, "--config") });
  return { configPath, config: await loadConfig(configPath) };
}

async function aliasCommand(args) {
  const action = args.find((value) => ["list", "add", "remove"].includes(value)) ?? "list";
  const { config } = await openedConfig(args);
  if (action === "list") return output.write(await listAliases(config));
  const project = option(args, "--project");
  const alias = option(args, "--alias");
  if (!project || !alias) throw new Error("alias add/remove 需要 --project 和 --alias。");
  const result = action === "add"
    ? await addAlias(config, project, alias, { commit: hasFlag(args, "--commit") })
    : await removeAlias(config, project, alias, { commit: hasFlag(args, "--commit") });
  output.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function projectCommand(args) {
  const action = args.find((value) => ["recent", "correct", "move"].includes(value)) ?? "recent";
  const { config } = await openedConfig(args);
  if (action === "recent") return output.write(`${JSON.stringify(await listRecentRecords(config), null, 2)}\n`);
  if (action === "correct") return output.write(`${JSON.stringify(await runProjectCorrect(config), null, 2)}\n`);
  const plan = await buildProjectMovePlan(config, {
    from: option(args, "--from"),
    to: option(args, "--to"),
    thread: option(args, "--thread")
  });
  const result = hasFlag(args, "--apply") ? await applyProjectMovePlan(config, plan) : plan;
  output.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function todayCommand(args) {
  const { config } = await openedConfig(args);
  output.write(`${JSON.stringify(await writeToday(config, { date: option(args, "--date") || undefined }), null, 2)}\n`);
}

async function backfillCommand(args) {
  const { config } = await openedConfig(args);
  const plan = await buildBackfillDigestPlan(config);
  const result = hasFlag(args, "--apply") ? await applyBackfillDigestPlan(config, plan) : plan;
  const publicResult = { ...result, home_updates: (result.home_updates ?? []).map(({ content, ...entry }) => entry) };
  output.write(`${JSON.stringify(publicResult, null, 2)}\n`);
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) return output.write(help());
  if (["--version", "version"].includes(command)) return output.write("1.0.0-beta.1\n");
  if (command === "init") return runInit(args);
  if (command === "mode") return runMode(args);
  if (command === "workspace") return runWorkspace(args);
  if (command === "config") return showConfig(args);
  if (command === "layout") return runLayout(args);
  if (command === "doctor") return runDoctor(args);
  if (command === "threads") return runThreads(args);
  if (command === "alias") return aliasCommand(args);
  if (command === "project") return projectCommand(args);
  if (command === "today") return todayCommand(args);
  if (command === "backfill") return backfillCommand(args);
  if (command === "watch" || command === "sync") return runCli(await runtimeArgs(args, command));
  throw new Error(`未知命令：${command}\n\n${help()}`);
}

main().catch((error) => {
  stderr.write(`错误：${error.message}\n`);
  process.exitCode = 1;
});
