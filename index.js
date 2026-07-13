#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./runtime/cli-runner.js";

export { parseArgs } from "./runtime/cli-runner.js";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

