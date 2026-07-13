import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppServerClient } from "./app-server-client.js";
import { ConversationStream } from "./conversation-stream.js";
import { ConfirmWatchController } from "./confirm-watch.js";
import { DuplexTracker } from "./duplex-tracker.js";
import { resolveWithinVault } from "../core/writer.js";
import { loadConfig as loadUserConfig } from "./config.js";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function usage() {
  return `OCA-Duplex MVP

Usage:
  node index.js [--once|--watch] [--dry-run|--write [--commit]] [--confirm]
                [--thread <id>] [--turn-limit <n>] [--config <path>]

Safety defaults:
  --once --dry-run --turn-limit 1
`;
}

export function parseArgs(argv) {
  const result = {
    watch: false,
    confirm: false,
    write: false,
    commit: false,
    threadIds: [],
    turnIds: [],
    turnLimit: null,
    configPath: path.join(projectRoot, "config.json")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--watch") result.watch = true;
    else if (arg === "--once") result.watch = false;
    else if (arg === "--confirm") result.confirm = true;
    else if (arg === "--dry-run") result.write = false;
    else if (arg === "--write") result.write = true;
    else if (arg === "--commit") result.commit = true;
    else if (arg === "--thread") result.threadIds.push(argv[++index]);
    else if (arg === "--turn") result.turnIds.push(argv[++index]);
    else if (arg === "--turn-limit") result.turnLimit = Number.parseInt(argv[++index], 10);
    else if (arg === "--config") result.configPath = path.resolve(argv[++index]);
    else if (arg === "--help" || arg === "-h") result.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (result.commit && !result.write) throw new Error("--commit requires --write");
  if (result.confirm && !result.watch) throw new Error("--confirm requires --watch");
  if (result.confirm && (result.write || result.commit)) throw new Error("--confirm controls write and commit after approval; do not combine it with --write or --commit");
  if (result.turnLimit !== null && (!Number.isInteger(result.turnLimit) || result.turnLimit < 1)) {
    throw new Error("--turn-limit must be a positive integer");
  }
  return result;
}

export async function loadConfig(configPath) {
  const config = await loadUserConfig(configPath);
  for (const relativePath of [
    ...Object.values(config.classification.paths),
    config.write.conversationSourceFolder,
    config.state.path,
    config.projectRouting.root,
    config.projectRouting.unsorted,
    config.projectAliases.path,
    config.dashboard.path
  ]) {
    resolveWithinVault(config.vaultRoot, relativePath);
  }
  return config;
}

function print(value, output) {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  const args = parseArgs(argv);
  if (args.help) {
    output.write(usage());
    return;
  }
  const config = await loadConfig(args.configPath);
  const mode = { write: args.write, commit: args.commit };
  const client = new AppServerClient(config.appServer);
  const stream = new ConversationStream(client, config);
  const tracker = new DuplexTracker(config, mode);
  const controller = new AbortController();
  const turnLimit = args.turnLimit ?? config.capture.maxTurnsPerCycle ?? 1;
  let confirmController = null;

  const requestStop = () => {
    if (!controller.signal.aborted) controller.abort();
    confirmController?.stop();
    client.stop().catch(() => {});
  };
  confirmController = args.confirm
    ? new ConfirmWatchController({
      tracker,
      input,
      writeOutput: (text) => output.write(text),
      heartbeatMs: config.capture.heartbeatMs ?? 60000,
      onQuit: () => {
        requestStop();
        setTimeout(() => process.exit(0), 100);
      }
    })
    : null;

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  await tracker.initialize();
  await client.start();
  confirmController?.start();

  const processSnapshots = async (snapshots) => {
    confirmController?.scanning();
    const requestedTurns = new Set(args.turnIds.filter(Boolean));
    const eligible = requestedTurns.size
      ? snapshots.filter((snapshot) => requestedTurns.has(snapshot.turn.id))
      : snapshots;
    const selected = tracker.selectSnapshots(eligible, turnLimit);
    if (selected.length === 0) {
      if (confirmController) confirmController.notifyNoUpdates();
      else if (!args.watch) {
        print({
          status: "idle",
          execution_mode: mode.write ? (mode.commit ? "write-and-commit" : "write-no-commit") : "dry-run",
          message: "No new completed turns were found."
        }, output);
      }
      return;
    }
    for (const snapshot of selected) {
      if (tracker.context.hasProcessed(snapshot.turn.id)) continue;
      if (confirmController) {
        const decision = await confirmController.handle(snapshot);
        if (decision.action === "quit") {
          requestStop();
          return;
        }
      } else {
        print(await tracker.process(snapshot), output);
      }
    }
  };

  try {
    if (args.watch) {
      await stream.watch(processSnapshots, { threadIds: args.threadIds, signal: controller.signal });
    } else {
      await processSnapshots(await stream.fetchSnapshots(args.threadIds));
    }
  } finally {
    confirmController?.stop();
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
    await client.stop();
  }
}
