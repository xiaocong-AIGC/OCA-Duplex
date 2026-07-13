import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeTurn, redactSecrets } from "../core/capture.js";
import { parseConversation } from "../core/parser.js";
import { classifyUnits } from "../core/classifier.js";
import { suggestLinks } from "../core/linker.js";
import { buildWritePlan, executeWritePlan, resolveWithinVault } from "../core/writer.js";
import { JsonLineRouter } from "../runtime/json-line-router.js";
import { parseArgs } from "../index.js";

function config(vaultRoot) {
  return {
    vaultRoot,
    capture: { includeToolResults: true, maxToolOutputChars: 2000, completedTurnsOnly: true },
    classification: {
      minimumWriteConfidence: 0.72,
      paths: { inbox: "00_收件箱", knowledge: "30_知识库", prompt: "50_提示词", project: "10_项目", source: "30_来源" }
    },
    linking: { minimumSharedTokens: 2, maximumLinksPerNote: 3 },
    write: { maxDerivedNotesPerTurn: 3, conversationSourceFolder: "30_来源/Codex Conversations", commitMessage: "test" },
    state: { path: "90_System/OCA-Duplex/runtime-state.json" }
  };
}

function snapshotFixture() {
  return normalizeTurn(
    { id: "thread-12345678", preview: "知识流测试", cwd: "D:\\ObsidianVault", source: "vscode" },
    {
      id: "turn-12345678",
      status: "completed",
      startedAt: 1700000000,
      completedAt: 1700000060,
      itemsView: "full",
      items: [
        { id: "u1", type: "userMessage", content: [{ type: "text", text: "请设计 Inbox 分类流程，并输出执行步骤。" }] },
        { id: "r1", type: "reasoning", summary: ["先提取任务，再形成分类方法。"], content: ["not captured"] },
        { id: "a1", type: "agentMessage", phase: "final_answer", text: "A reusable Inbox workflow should classify each capture by intent, preserve the original source, propose a deterministic target path, require human review for uncertain cases, and record every accepted change. The method also defines naming rules, safe Git staging, rollback behavior, semantic links, quality gates, and a repeatable review process so the knowledge system remains useful across future projects and conversations." }
      ]
    },
    { includeToolResults: true }
  );
}

test("capture keeps visible summaries but not hidden reasoning content", () => {
  const snapshot = snapshotFixture();
  assert.equal(snapshot.conversation_nodes.length, 3);
  assert.match(snapshot.conversation_nodes[1].text, /先提取任务/);
  assert.doesNotMatch(JSON.stringify(snapshot), /not captured/);
});

test("secret redaction removes common credentials", () => {
  assert.equal(redactSecrets("token sk-abcdefghijklmnopqrstuvwxyz"), "token [REDACTED]");
  assert.equal(redactSecrets("Bearer abcdefghijklmnopqrstuvwxyz"), "Bearer [REDACTED]");
});

test("parser and classifier produce deterministic structured units", () => {
  const snapshot = snapshotFixture();
  const first = parseConversation(snapshot);
  const second = parseConversation(snapshot);
  assert.deepEqual(first, second);
  assert.doesNotMatch(JSON.stringify(first.knowledge_units), /先提取任务|正在做结构扫描/);
  const units = classifyUnits(first.knowledge_units, config("D:\\ObsidianVault"));
  assert.ok(units.length > 0);
  assert.ok(units.every((unit) => unit.unit_id.startsWith("KU-") && unit.recommended_target.endsWith(".md")));
  assert.ok(units.some((unit) => ["prompt", "project", "knowledge"].includes(unit.type)));
});

test("link suggestions require shared textual evidence", () => {
  const units = [{
    unit_id: "KU-1",
    tags: ["inbox", "prompt"],
    title: "Inbox 分类流程",
    text: "Inbox 分类流程需要人工确认",
    recommended_target: "30_知识库/Inbox 分类流程.md"
  }];
  const links = suggestLinks(units, [
    { path: "30_知识库/Inbox workflow.md", title: "Inbox workflow", tags: ["inbox", "prompt"] },
    { path: "30_知识库/Git.md", title: "Git", tags: ["git"] }
  ], config("D:\\ObsidianVault"));
  assert.equal(links[0].links.length, 1);
  assert.match(links[0].links[0].target, /Inbox workflow/);
});

test("writer rejects traversal and creates files only inside the Vault", async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oca-duplex-"));
  assert.throws(() => resolveWithinVault(vaultRoot, "../escape.md"), /outside Vault/);
  const snapshot = snapshotFixture();
  const parsed = parseConversation(snapshot);
  const units = classifyUnits(parsed.knowledge_units, config(vaultRoot));
  const linkSets = units.map((unit) => ({ unit_id: unit.unit_id, links: [] }));
  const plan = buildWritePlan({ snapshot, title: parsed.title, units, linkSets, config: config(vaultRoot) });
  const results = await executeWritePlan(plan.slice(0, 2), config(vaultRoot));
  assert.ok(results.every((result) => result.outcome === "created"));
  assert.ok(results.every((result) => result.absolute_path.startsWith(vaultRoot)));
  const firstContent = await fs.readFile(results[0].absolute_path, "utf8");
  const repeated = await executeWritePlan(plan.slice(0, 2), config(vaultRoot));
  assert.ok(repeated.every((result) => result.outcome === "skipped_existing"));
  assert.equal(await fs.readFile(results[0].absolute_path, "utf8"), firstContent);
  await fs.rm(vaultRoot, { recursive: true, force: true });
});

test("JSONL router separates interleaved notifications and responses", () => {
  const router = new JsonLineRouter();
  const seen = [];
  router.on("notification", (message) => seen.push(`n:${message.method}`));
  router.on("response", (message) => seen.push(`r:${message.id}`));
  router.ingest('{"method":"remoteControl/status/changed","params":{"status":"disabled"}}');
  router.ingest('{"id":2,"result":{"data":[]}}');
  assert.deepEqual(seen, ["n:remoteControl/status/changed", "r:2"]);
});

test("CLI defaults to dry-run and commit requires write", () => {
  assert.equal(parseArgs([]).write, false);
  assert.throws(() => parseArgs(["--commit"]), /requires --write/);
  assert.deepEqual(parseArgs(["--write", "--commit"]).commit, true);
});
