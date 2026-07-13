import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeWritePlan } from "../core/writer.js";
import { desktopOverview, handleDesktopRequest, listDesktopActivity, listDesktopArtifacts, listDesktopProjects } from "../runtime/desktop-data.js";
import { defaultConfig } from "../runtime/config.js";
import { ContextBuffer } from "../runtime/context-buffer.js";

async function tempConfig() {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oca-desktop-data-"));
  const config = defaultConfig(vaultRoot, "zh-CN");
  config.capture.mode = "manual";
  return config;
}

test("write transaction rolls back earlier files when a later operation fails", async () => {
  const config = await tempConfig();
  const firstTarget = "项目/测试/知识库/应被回滚.md";
  const plan = [
    { operation: "create_if_absent", type: "knowledge", target: firstTarget, project_root: null, content: "# 临时内容\n" },
    { operation: "upsert_knowledge", type: "knowledge", target: "项目/测试/知识库/不存在.md", project_root: null, source_turn_id: "turn-fail", knowledge_operation: "update", knowledge_evidence: "evidence", content: "" }
  ];
  await assert.rejects(() => executeWritePlan(plan, config), /完整回滚/);
  await assert.rejects(() => fs.access(path.join(config.vaultRoot, firstTarget)));
  await fs.rm(config.vaultRoot, { recursive: true, force: true });
});

test("desktop data API reports projects, artifacts, mappings, and audit activity", async () => {
  const config = await tempConfig();
  config.capture.workspaces = [{ path: "D:\\Project", project: "测试" }];
  const target = "项目/测试/知识库/事务与审计.md";
  const content = [
    "---", "schema_version: 2", "type: knowledge", "status: candidate", "project: 测试",
    "source_thread_id: thread-api", "source_turn_id: turn-api", "oca_managed: true", "---",
    "", "# 事务与审计", ""
  ].join("\n");
  await executeWritePlan([{ operation: "create_if_absent", type: "knowledge", target, project_root: "项目/测试", source_thread_id: "thread-api", source_turn_id: "turn-api", content }], config);

  const [projects, artifacts, activity, overview] = await Promise.all([
    listDesktopProjects(config),
    listDesktopArtifacts(config, { project: "测试" }),
    listDesktopActivity(config),
    desktopOverview(config)
  ]);
  assert.equal(projects[0].name, "测试");
  assert.equal(artifacts[0].type, "knowledge");
  assert.equal(activity[0].target, target);
  assert.equal(overview.workspace_mappings[0].project, "测试");
  const response = await handleDesktopRequest(config, { method: "artifacts.list", params: { project: "测试" } });
  assert.equal(response[0].source_thread_id, "thread-api");
  await fs.rm(config.vaultRoot, { recursive: true, force: true });
});

test("runtime selection deduplicates repeated thread and turn snapshots", async () => {
  const config = await tempConfig();
  const context = new ContextBuffer(config);
  await context.load();
  const snapshot = { thread: { id: "thread-duplicate" }, turn: { id: "turn-duplicate", completed_at: "2026-07-13T01:00:00.000Z" } };
  assert.equal(context.select([snapshot, snapshot], 5).length, 1);
  context.record({ threadId: "thread-duplicate", turnId: "turn-duplicate", mode: "write" });
  assert.equal(context.select([snapshot], 5).length, 0);
  await fs.rm(config.vaultRoot, { recursive: true, force: true });
});

test("desktop knowledge review validates a managed candidate and records audit metadata", async () => {
  const config = await tempConfig();
  const target = "项目/审核测试/知识库/候选规则.md";
  const content = [
    "---", "schema_version: 2", "type: knowledge", "status: candidate", "project: 审核测试",
    "source_thread_id: thread-review", "source_turn_id: turn-review", "oca_managed: true", "---",
    "", "# 候选规则", ""
  ].join("\n");
  await executeWritePlan([{ operation: "create_if_absent", type: "knowledge", target, project_root: "项目/审核测试", source_thread_id: "thread-review", source_turn_id: "turn-review", content }], config);
  const before = (await listDesktopArtifacts(config, { project: "审核测试" }))[0];
  const result = await handleDesktopRequest(config, { method: "knowledge.review", params: { path: target, action: "validate", expectedUpdatedAt: before.updated_at } });
  assert.equal(result.outcome, "validated");
  const updated = await fs.readFile(path.join(config.vaultRoot, target), "utf8");
  assert.match(updated, /^status: validated$/m);
  assert.match(updated, /^reviewed_at: /m);
  const activity = await listDesktopActivity(config);
  assert.equal(activity[0].operation, "knowledge_validate");
  assert.equal(activity[0].outcome, "validated");
  await fs.rm(config.vaultRoot, { recursive: true, force: true });
});
