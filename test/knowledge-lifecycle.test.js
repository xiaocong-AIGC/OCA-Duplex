import test from "node:test";
import assert from "node:assert/strict";
import { planKnowledgeOperation } from "../core/knowledge-lifecycle.js";

function unit(patch = {}) {
  return {
    type: "knowledge",
    title: "项目目录语言规则",
    text: "项目目录必须保持单一语言，并在迁移前检查路径冲突。",
    tags: ["知识管理", "项目管理", "codex"],
    source_thread_id: "thread-new",
    ...patch
  };
}

function note(patch = {}) {
  return {
    path: "项目/OCA-Duplex/知识库/项目目录语言规则.md",
    title: "项目目录语言规则",
    type: "knowledge",
    status: "candidate",
    tags: ["知识管理", "项目管理", "codex"],
    source_thread_id: "thread-old",
    oca_managed: true,
    excerpt: "目录语言保持一致。",
    ...patch
  };
}

test("knowledge lifecycle distinguishes add, update, merge, conflict, and supersede", () => {
  assert.equal(planKnowledgeOperation(unit(), []).operation, "add");
  assert.equal(planKnowledgeOperation(unit({ source_thread_id: "thread-old" }), [note()]).operation, "update");
  assert.equal(planKnowledgeOperation(unit({ title: "Vault 语言与迁移规范" }), [note()]).operation, "merge");
  assert.equal(planKnowledgeOperation(unit({ title: "Vault 语言与迁移规范", text: "新规则与旧规则冲突，不能直接迁移。" }), [note()]).operation, "conflict");
  assert.equal(planKnowledgeOperation(unit({ text: "这条规则替代旧方案，今后以新目录模型为准。" }), [note()]).operation, "supersede");
});

test("knowledge lifecycle keeps validation state and ownership information", () => {
  const result = planKnowledgeOperation(unit({ source_thread_id: "thread-old" }), [note({ status: "validated", oca_managed: false })]);
  assert.equal(result.operation, "update");
  assert.equal(result.state, "validated");
  assert.equal(result.existing_managed, false);
  assert.equal(result.existing_target, "项目/OCA-Duplex/知识库/项目目录语言规则.md");
});
