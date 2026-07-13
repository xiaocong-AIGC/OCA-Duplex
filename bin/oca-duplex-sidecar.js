#!/usr/bin/env node
import readline from "node:readline";
import { stdin, stdout, stderr } from "node:process";
import { discoverConfigPath, loadConfig } from "../runtime/config.js";
import { handleDesktopRequest } from "../runtime/desktop-data.js";
import { runCli } from "../runtime/cli-runner.js";
import { AppServerClient } from "../runtime/app-server-client.js";
import { ConversationStream } from "../runtime/conversation-stream.js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function execute(request, explicitPath) {
  if (request.method === "system.initialize") return handleDesktopRequest(null, request);
  const configPath = await discoverConfigPath({ explicitPath });
  if (request.method === "threads.list") {
    const config = await loadConfig(configPath, { allowEmptySafeMode: true });
    const client = new AppServerClient(config.appServer);
    try {
      await client.start();
      const stream = new ConversationStream(client, config);
      const threads = await stream.listThreads({ unfiltered: true, limit: request.params?.limit ?? 50 });
      return threads.map((thread) => ({
        id: thread.id,
        name: thread.name ?? thread.preview ?? "",
        preview: thread.preview ?? "",
        cwd: thread.cwd ?? "",
        updated_at: thread.updatedAt ?? thread.updated_at ?? thread.createdAt ?? thread.created_at ?? null
      }));
    } finally {
      await client.stop();
    }
  }
  if (["sync.preview", "sync.write"].includes(request.method)) {
    let text = "";
    const cliArgs = ["--once", request.method === "sync.write" ? "--write" : "--dry-run", "--turn-limit", String(request.params?.limit ?? 5), "--config", configPath];
    for (const threadId of request.params?.threadIds ?? []) cliArgs.push("--thread", threadId);
    await runCli(cliArgs, {
      output: { write(value) { text += String(value); return true; } }
    });
    const reports = text.trim() ? text.trim().split(/\n(?=\{)/).map((part) => JSON.parse(part)) : [];
    return { mode: request.method === "sync.write" ? "write" : "dry-run", reports };
  }
  const config = await loadConfig(configPath, { allowEmptySafeMode: true });
  return handleDesktopRequest(config, request);
}

async function main() {
  const explicitPath = option("--config");
  const oneShot = option("--request");
  if (oneShot) {
    const request = JSON.parse(oneShot);
    try {
      const result = await execute(request, explicitPath);
      stdout.write(`${JSON.stringify({ id: request.id ?? null, ok: true, result })}\n`);
    } catch (error) {
      stdout.write(`${JSON.stringify({ id: request.id ?? null, ok: false, error: { message: error.message } })}\n`);
    }
    return;
  }
  const lines = readline.createInterface({ input: stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await execute(request, explicitPath);
      stdout.write(`${JSON.stringify({ id: request.id ?? null, ok: true, result })}\n`);
    } catch (error) {
      stdout.write(`${JSON.stringify({ id: request?.id ?? null, ok: false, error: { message: error.message } })}\n`);
    }
  }
  lines.on("error", (error) => stderr.write(`${error.stack ?? error.message}\n`));
}

main().catch((error) => {
  stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
