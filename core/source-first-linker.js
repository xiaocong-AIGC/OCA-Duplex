import fs from "node:fs/promises";
import path from "node:path";
import { semanticTags } from "./quality.js";

const DISTINCTIVE_TAGS = new Set(["自动知识库", "知识管理", "项目管理", "inbox", "prompt", "skill", "mvp", "git"]);

async function walkMarkdown(root) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(fullPath);
    }
  }
  await visit(root);
  return files;
}

function sharedTags(left, right) {
  const rightSet = new Set(right);
  return left.filter((tag) => rightSet.has(tag));
}

async function readPrefix(filePath, maximumBytes = 32768) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maximumBytes);
    const { bytesRead } = await handle.read(buffer, 0, maximumBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function frontmatterValue(content, key) {
  const match = String(content).match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match) return null;
  return match[1].replace(/^['"]|['"]$/g, "").trim();
}

export async function buildNoteIndex(config) {
  const vaultRoot = path.resolve(config.vaultRoot);
  const folders = [...new Set(Object.values(config.classification.paths))];
  const files = [];
  for (const folder of folders) files.push(...await walkMarkdown(path.resolve(vaultRoot, folder)));
  const notes = [];
  for (const filePath of [...new Set(files)]) {
    const content = await readPrefix(filePath);
    const artifactId = frontmatterValue(content, "artifact_id");
    const ocaVersion = frontmatterValue(content, "oca_version");
    const ocaManaged = frontmatterValue(content, "oca_managed");
    if (ocaManaged !== "true" && !(artifactId && ocaVersion)) continue;
    notes.push({
      path: path.relative(vaultRoot, filePath).replace(/\\/g, "/"),
      title: path.basename(filePath, path.extname(filePath)),
      tags: semanticTags(`${path.basename(filePath)}\n${content.slice(0, 20000)}`),
      type: frontmatterValue(content, "type"),
      status: frontmatterValue(content, "status"),
      source_thread_id: frontmatterValue(content, "source_thread_id"),
      oca_managed: ocaManaged === "true",
      excerpt: content.replace(/^---[\s\S]*?---\s*/m, "").slice(0, 12000)
    });
  }
  return notes;
}

export function suggestLinks(units, existingNotes, config) {
  const minimumShared = config.linking.minimumSharedTokens ?? 2;
  const maximumLinks = config.linking.maximumLinksPerNote ?? 3;
  const candidates = [
    ...existingNotes,
    ...units.map((unit) => ({
      path: unit.recommended_target,
      title: unit.title,
      tags: unit.tags,
      unit_id: unit.unit_id
    }))
  ];
  return units.map((unit) => {
    const unitTags = unit.tags ?? semanticTags(`${unit.title}\n${unit.text}`);
    const links = candidates
      .filter((candidate) => candidate.unit_id !== unit.unit_id && candidate.path !== unit.recommended_target)
      .map((candidate) => ({
        target: candidate.path.replace(/\.md$/i, ""),
        title: candidate.title,
        relationship: "shared_semantic_topics",
        evidence: sharedTags(unitTags, candidate.tags ?? candidate.tokens ?? [])
      }))
      .filter((candidate) =>
        candidate.evidence.length >= minimumShared
        && candidate.evidence.some((tag) => DISTINCTIVE_TAGS.has(tag))
      )
      .sort((left, right) => right.evidence.length - left.evidence.length || left.target.localeCompare(right.target))
      .slice(0, maximumLinks);
    return { unit_id: unit.unit_id, links };
  });
}

export function flattenCrossSessionLinks(linkSets, existingNotes) {
  const existing = new Set(existingNotes.map((note) => note.path.replace(/\.md$/i, "")));
  return linkSets.flatMap((set) => set.links
    .filter((link) => existing.has(link.target))
    .map((link) => ({ source_unit_id: set.unit_id, ...link })));
}
