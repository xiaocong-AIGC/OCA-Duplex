import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { configPathForVault, defaultConfig, normalizeWorkspaceEntry, saveConfig } from "../runtime/config.js";
import { layoutProfile, normalizeLocale } from "../vault/layout-profiles.js";
import { installObsidianReadingStyle } from "../vault/obsidian-reading-style.js";
import { hasFlag, option, options } from "./args.js";

const MODE_HELP = {
  safe: "安全模式：只读取白名单项目；每个工作目录明确映射到一个 Obsidian 项目。",
  manual: "手动模式：不自动读取；使用任务 ID 指定要同步的 Codex 任务。",
  all: "全部模式：读取最近的所有 Codex 任务，再按工作目录、别名和标题路由。"
};

function parseWorkspace(value) {
  const separator = value.lastIndexOf("=");
  if (separator < 1) return normalizeWorkspaceEntry(value);
  return normalizeWorkspaceEntry({ path: value.slice(0, separator), project: value.slice(separator + 1) });
}

async function promptMode(rl) {
  output.write("\n请选择捕获模式：\n1. 安全模式（推荐）\n2. 手动模式\n3. 全部模式\n");
  const answer = (await rl.question("模式 [1]：")).trim() || "1";
  return answer === "2" ? "manual" : answer === "3" ? "all" : "safe";
}

async function promptLanguage(rl) {
  output.write("\n请选择目录与内容语言：\n1. 纯中文（推荐）\n2. English\n");
  const answer = (await rl.question("语言 [1]：")).trim() || "1";
  return answer === "2" ? "en-US" : "zh-CN";
}

async function promptWorkspace(rl, index = 1) {
  const workspacePath = (await rl.question(`项目 ${index} 的工作目录（留空结束）：`)).trim();
  if (!workspacePath) return null;
  const resolved = path.resolve(workspacePath);
  const project = (await rl.question(`写入 Obsidian 的项目名 [${path.basename(resolved)}]：`)).trim() || path.basename(resolved);
  return normalizeWorkspaceEntry({ path: resolved, project });
}

export async function runInit(args) {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const rl = interactive ? readline.createInterface({ input, output }) : null;
  try {
    const vaultArg = option(args, "--vault");
    const vaultRoot = path.resolve(vaultArg || (rl ? ((await rl.question(`Obsidian Vault 路径 [${process.cwd()}]：`)).trim() || process.cwd()) : process.cwd()));
    const stat = await fs.stat(vaultRoot).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Vault 目录不存在：${vaultRoot}`);

    const configPath = configPathForVault(vaultRoot);
    if (!hasFlag(args, "--force")) {
      const exists = await fs.access(configPath).then(() => true).catch(() => false);
      if (exists) throw new Error(`配置已经存在：${configPath}\n如需重建，请添加 --force。`);
    }

    const locale = normalizeLocale(option(args, "--language") || (rl ? await promptLanguage(rl) : "zh-CN"));
    const config = defaultConfig(vaultRoot, locale);
    config.capture.mode = option(args, "--mode") || (rl ? await promptMode(rl) : "safe");
    if (!MODE_HELP[config.capture.mode]) throw new Error(`不支持的模式：${config.capture.mode}`);

    config.capture.workspaces = options(args, "--workspace").map(parseWorkspace);
    if (config.capture.mode === "safe" && config.capture.workspaces.length === 0 && rl) {
      output.write("\n安全模式需要设置允许读取的项目目录。一个项目一条映射。\n");
      for (let index = 1; ; index += 1) {
        const entry = await promptWorkspace(rl, index);
        if (!entry) break;
        config.capture.workspaces.push(entry);
      }
    }
    if (config.capture.mode === "safe" && config.capture.workspaces.length === 0) {
      throw new Error("安全模式至少需要一个 --workspace \"目录=项目名\"。也可以先选择 --mode manual。 ");
    }

    if (config.capture.mode === "all" && !hasFlag(args, "--yes")) {
      if (!rl) throw new Error("非交互方式启用全部模式必须添加 --yes。");
      output.write("\n警告：全部模式会读取不同工作目录中的最近 Codex 任务。\n");
      const confirmed = (await rl.question("确认启用？输入 YES：")).trim();
      if (confirmed !== "YES") throw new Error("已取消初始化。");
    }

    config.capture.includeToolResults = hasFlag(args, "--include-tool-results");
    config.write.commit = hasFlag(args, "--git-commit");
    if (rl && !config.write.commit) {
      const answer = (await rl.question("监听确认写入后自动创建 Git commit？[y/N]：")).trim().toLowerCase();
      config.write.commit = answer === "y" || answer === "yes";
    }
    const controlDir = path.dirname(configPath);
    await fs.mkdir(controlDir, { recursive: true });
    await fs.writeFile(path.join(controlDir, ".gitignore"), "config.json\nruntime-state.json\naudit.jsonl\ntransactions/\nmigrations/\n*.tmp\n", "utf8");
    await fs.writeFile(path.join(controlDir, "project-aliases.json"), "{\n  \"aliases\": []\n}\n", "utf8");
    const initialDirectories = new Set([
      ...Object.values(config.userFacingPaths),
      path.posix.dirname(config.dashboard.path),
      config.daily.path
    ]);
    for (const relative of initialDirectories) {
      await fs.mkdir(path.join(vaultRoot, relative), { recursive: true });
    }
    await installObsidianReadingStyle(vaultRoot);
    await saveConfig(configPath, config);

    output.write(`\nOCA-Duplex 初始化完成。\n配置：${configPath}\n目录语言：${layoutProfile(config.locale).name}\n${MODE_HELP[config.capture.mode]}\n`);
    if (config.capture.workspaces.length) {
      output.write("\n工作区映射：\n");
      for (const entry of config.capture.workspaces) output.write(`- ${entry.path} → ${entry.project}\n`);
    }
    output.write("\n下一步：\n1. oca-duplex doctor\n2. oca-duplex watch\n");
    return { configPath, config };
  } finally {
    rl?.close();
  }
}

export { MODE_HELP, parseWorkspace };
