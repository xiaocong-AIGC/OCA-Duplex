import fs from "node:fs/promises";
import path from "node:path";
import { userFacingPaths } from "../vault/path-map.js";
import { resolveWithinVault } from "../core/writer.js";

async function walkFiles(directory) {
  const files = [];
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function isOcaArtifact(content) {
  const text = String(content).slice(0, 12000);
  return /^---\s*\r?\n/m.test(text)
    && /^schema_version:\s*\d+/m.test(text)
    && /^artifact_id:\s*/m.test(text)
    && (/^oca_version:\s*/m.test(text) || /^oca_managed:\s*(?:true|false)\s*$/m.test(text));
}

async function pruneEmptyDirectories(directory, boundary) {
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries.filter((item) => item.isDirectory())) {
    await pruneEmptyDirectories(path.join(directory, entry.name), boundary);
  }
  if (path.resolve(directory) === path.resolve(boundary)) return;
  if ((await fs.readdir(directory)).length === 0) await fs.rmdir(directory);
}

export async function clearOcaGeneratedData(config) {
  const roots = [...new Set(Object.values(userFacingPaths(config)).filter(Boolean))];
  const deleted = [];
  for (const relativeRoot of roots) {
    const absoluteRoot = resolveWithinVault(config.vaultRoot, relativeRoot);
    for (const filePath of await walkFiles(absoluteRoot)) {
      if (!filePath.toLowerCase().endsWith(".md")) continue;
      const content = await fs.readFile(filePath, "utf8");
      if (!isOcaArtifact(content)) continue;
      await fs.rm(filePath, { force: true });
      deleted.push(path.relative(config.vaultRoot, filePath).replace(/\\/g, "/"));
    }
    await pruneEmptyDirectories(absoluteRoot, absoluteRoot);
  }

  const controlFiles = ["audit.jsonl", "runtime-state.json"];
  const controlDirectories = ["transactions", "migrations"];
  for (const name of controlFiles) await fs.rm(resolveWithinVault(config.vaultRoot, `.oca-duplex/${name}`), { force: true });
  for (const name of controlDirectories) await fs.rm(resolveWithinVault(config.vaultRoot, `.oca-duplex/${name}`), { recursive: true, force: true });
  return { deleted_files: deleted, deleted_count: deleted.length };
}
