import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { discoverConfigPath, loadConfig, normalizeWorkspaceEntry, saveConfig } from "../runtime/config.js";
import { hasFlag, option } from "./args.js";
import { MODE_HELP, parseWorkspace } from "./init.js";

async function openConfig(args) {
  const configPath = await discoverConfigPath({ explicitPath: option(args, "--config") });
  return { configPath, config: await loadConfig(configPath, { allowEmptySafeMode: true }) };
}

async function confirmAllMode(args, rl) {
  if (hasFlag(args, "--yes")) return;
  if (!rl) throw new Error("启用全部模式必须添加 --yes，或在交互终端中确认。");
  output.write("全部模式会检查所有最近 Codex 任务，并读取其中尚未处理的完整对话。\n");
  if ((await rl.question("确认切换？输入 YES：")).trim() !== "YES") throw new Error("已取消切换。");
}

export async function runMode(args) {
  const { configPath, config } = await openConfig(args);
  const requested = args.find((value) => ["safe", "manual", "all"].includes(value));
  if (!requested) {
    output.write(`当前模式：${config.capture.mode}\n${MODE_HELP[config.capture.mode]}\n`);
    return config.capture.mode;
  }
  const rl = process.stdin.isTTY ? readline.createInterface({ input, output }) : null;
  try {
    if (requested === "safe" && config.capture.workspaces.length === 0) {
      throw new Error("没有工作区映射。请先运行 oca-duplex workspace add。");
    }
    if (requested === "all") await confirmAllMode(args, rl);
    config.capture.mode = requested;
    await saveConfig(configPath, config);
    output.write(`已切换到：${requested}\n${MODE_HELP[requested]}\n`);
    return requested;
  } finally {
    rl?.close();
  }
}

export async function runWorkspace(args) {
  const action = args.find((value) => ["list", "add", "remove"].includes(value)) ?? "list";
  const { configPath, config } = await openConfig(args);
  if (action === "list") {
    if (config.capture.workspaces.length === 0) output.write("尚未配置工作区映射。\n");
    config.capture.workspaces.forEach((entry, index) => output.write(`${index + 1}. ${entry.path} → ${entry.project}\n`));
    return config.capture.workspaces;
  }

  const rl = process.stdin.isTTY ? readline.createInterface({ input, output }) : null;
  try {
    if (action === "add") {
      const compact = option(args, "--workspace");
      let entry;
      if (compact) entry = parseWorkspace(compact);
      else {
        let workspacePath = option(args, "--path");
        if (!workspacePath && rl) workspacePath = (await rl.question("项目工作目录：")).trim();
        if (!workspacePath) throw new Error("请提供 --path 或 --workspace \"目录=项目名\"。");
        const resolved = path.resolve(workspacePath);
        let project = option(args, "--project");
        if (!project && rl) project = (await rl.question(`Obsidian 项目名 [${path.basename(resolved)}]：`)).trim();
        entry = normalizeWorkspaceEntry({ path: resolved, project: project || path.basename(resolved) });
      }
      const stat = await fs.stat(entry.path).catch(() => null);
      if (!stat?.isDirectory()) throw new Error(`工作目录不存在：${entry.path}`);
      const duplicate = config.capture.workspaces.find((item) => path.resolve(item.path).toLowerCase() === path.resolve(entry.path).toLowerCase());
      if (duplicate) throw new Error(`该目录已经映射到“${duplicate.project}”。请先删除旧映射。`);
      config.capture.workspaces.push(entry);
      await saveConfig(configPath, config);
      output.write(`已添加：${entry.path} → ${entry.project}\n`);
      return entry;
    }

    let target = option(args, "--path") || args.find((value) => /^\d+$/.test(value));
    if (!target && rl) target = (await rl.question("输入要删除的序号或完整目录：")).trim();
    if (!target) throw new Error("请提供要删除的序号或 --path。");
    const index = /^\d+$/.test(target)
      ? Number(target) - 1
      : config.capture.workspaces.findIndex((entry) => path.resolve(entry.path).toLowerCase() === path.resolve(target).toLowerCase());
    if (index < 0 || index >= config.capture.workspaces.length) throw new Error("没有找到该工作区映射。");
    const [removed] = config.capture.workspaces.splice(index, 1);
    if (config.capture.mode === "safe" && config.capture.workspaces.length === 0) {
      config.capture.mode = "manual";
      output.write("安全模式已没有工作区，系统自动切换为手动模式。\n");
    }
    await saveConfig(configPath, config);
    output.write(`已删除：${removed.path} → ${removed.project}\n`);
    return removed;
  } finally {
    rl?.close();
  }
}

export async function showConfig(args) {
  const { configPath, config } = await openConfig(args);
  output.write(`${configPath}\n${JSON.stringify(config, null, 2)}\n`);
  return config;
}

