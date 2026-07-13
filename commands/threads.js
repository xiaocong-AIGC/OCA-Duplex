import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { AppServerClient } from "../runtime/app-server-client.js";
import { ConversationStream } from "../runtime/conversation-stream.js";
import { discoverConfigPath, loadConfig } from "../runtime/config.js";
import { hasFlag, option } from "./args.js";

function short(value, length = 42) {
  const text = String(value ?? "").replace(/\s+/g, " ");
  return Array.from(text).slice(0, length).join("");
}

export async function runThreads(args) {
  const configPath = await discoverConfigPath({ explicitPath: option(args, "--config") });
  const config = await loadConfig(configPath);
  const client = new AppServerClient(config.appServer);
  try {
    await client.start();
    const stream = new ConversationStream(client, config);
    const unfiltered = hasFlag(args, "--all") || config.capture.mode === "manual";
    const threads = await stream.listThreads({ unfiltered, limit: Number(option(args, "--limit", 50)) });
    if (threads.length === 0) {
      output.write("没有找到符合当前模式的 Codex 任务。\n");
      return [];
    }
    threads.forEach((thread, index) => {
      output.write(`\n${index + 1}. ${short(thread.name || thread.preview || "未命名任务")}\n`);
      output.write(`   ID: ${thread.id}\n   目录: ${thread.cwd || "未知"}\n`);
    });

    if (hasFlag(args, "--pick")) {
      if (!process.stdin.isTTY) throw new Error("--pick 需要交互终端。");
      const rl = readline.createInterface({ input, output });
      try {
        const selected = Number((await rl.question("\n选择要同步的序号：")).trim()) - 1;
        if (!threads[selected]) throw new Error("选择无效。");
        output.write(`\n先预览：\noca-duplex sync --thread ${threads[selected].id}\n`);
        output.write(`确认写入并提交：\noca-duplex sync --thread ${threads[selected].id} --write --commit\n`);
        return threads[selected];
      } finally {
        rl.close();
      }
    }
    return threads;
  } finally {
    await client.stop();
  }
}

