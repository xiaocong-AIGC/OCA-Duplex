#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { commitPaths } from "../core/git.js";
import { resolveWithinVault } from "../core/writer.js";

const codeRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function loadConfig(configPath = path.join(codeRoot, "config.json")) {
  return JSON.parse(await fs.readFile(configPath, "utf8"));
}

export function aliasFilePath(config) {
  return resolveWithinVault(config.vaultRoot, config.projectAliases?.path ?? ".oca-duplex/project-aliases.json");
}

export async function loadAliases(config) {
  try {
    const parsed = JSON.parse(await fs.readFile(aliasFilePath(config), "utf8"));
    return { aliases: Array.isArray(parsed.aliases) ? parsed.aliases : [] };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { aliases: [] };
  }
}

async function saveAliases(config, data) {
  const target = aliasFilePath(config);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return target;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

export function formatAliasList(data) {
  const lines = ["项目："];
  for (const entry of data.aliases ?? []) {
    lines.push(`- ${entry.project_name}`, "  aliases:");
    for (const alias of entry.aliases ?? []) lines.push(`  - ${alias}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function listAliases(config) {
  return formatAliasList(await loadAliases(config));
}

export async function addAlias(config, projectName, aliasValue, { commit = true } = {}) {
  if (!projectName || !aliasValue) throw new Error("projectName and aliasValue are required");
  const data = await loadAliases(config);
  let entry = data.aliases.find((item) => normalize(item.project_name) === normalize(projectName));
  if (!entry) {
    entry = { project_name: projectName, aliases: [projectName], default_categories: [] };
    data.aliases.push(entry);
  }
  entry.aliases = [...new Set([...(entry.aliases ?? []), projectName, aliasValue].filter(Boolean))];
  const before = await fs.readFile(aliasFilePath(config), "utf8").catch(() => "");
  const target = await saveAliases(config, data);
  const after = await fs.readFile(target, "utf8");
  const changed = before !== after;
  const git = changed && commit ? await commitPaths([target], config, "chore: update project aliases") : { committed: false, files: [path.relative(config.vaultRoot, target).replace(/\\/g, "/")] };
  return { changed, project_name: projectName, alias: aliasValue, target: path.relative(config.vaultRoot, target).replace(/\\/g, "/"), git };
}

export async function removeAlias(config, projectName, aliasValue, { commit = true } = {}) {
  if (!projectName || !aliasValue) throw new Error("projectName and aliasValue are required");
  const data = await loadAliases(config);
  const entry = data.aliases.find((item) => normalize(item.project_name) === normalize(projectName));
  if (!entry) return { changed: false, project_name: projectName, alias: aliasValue, reason: "project_not_found" };
  const beforeAliases = entry.aliases ?? [];
  entry.aliases = beforeAliases.filter((item) => normalize(item) !== normalize(aliasValue));
  const changed = entry.aliases.length !== beforeAliases.length;
  if (!changed) return { changed: false, project_name: projectName, alias: aliasValue, reason: "alias_not_found" };
  const target = await saveAliases(config, data);
  const git = commit ? await commitPaths([target], config, "chore: update project aliases") : { committed: false };
  return { changed, project_name: projectName, alias: aliasValue, target: path.relative(config.vaultRoot, target).replace(/\\/g, "/"), git };
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

async function askForProjectAndAlias(promptAlias = true) {
  const rl = readline.createInterface({ input, output });
  try {
    const projectName = await rl.question("请输入项目名：");
    const aliasValue = promptAlias ? await rl.question("请输入 alias：") : null;
    return { projectName: projectName.trim(), aliasValue: aliasValue?.trim() };
  } finally {
    rl.close();
  }
}

async function main() {
  const command = process.argv[2] ?? "list";
  const config = await loadConfig();
  if (command === "list") {
    process.stdout.write(await listAliases(config));
    return;
  }
  if (command === "add") {
    const project = argValue(process.argv, "--project");
    const alias = argValue(process.argv, "--alias");
    const answers = project && alias ? { projectName: project, aliasValue: alias } : await askForProjectAndAlias(true);
    process.stdout.write(`${JSON.stringify(await addAlias(config, answers.projectName, answers.aliasValue), null, 2)}\n`);
    return;
  }
  if (command === "remove") {
    const project = argValue(process.argv, "--project");
    const alias = argValue(process.argv, "--alias");
    const answers = project && alias ? { projectName: project, aliasValue: alias } : await askForProjectAndAlias(true);
    process.stdout.write(`${JSON.stringify(await removeAlias(config, answers.projectName, answers.aliasValue), null, 2)}\n`);
    return;
  }
  throw new Error(`Unknown alias command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
