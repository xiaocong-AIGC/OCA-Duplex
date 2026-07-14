import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultConfig } from "../runtime/config.js";
import { clearOcaGeneratedData } from "../runtime/data-reset.js";

test("history reset deletes only OCA artifacts and control history", async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oca-reset-"));
  const config = defaultConfig(vaultRoot, "zh-CN");
  const projectRoot = path.join(vaultRoot, config.userFacingPaths.projects, "项目甲");
  await fs.mkdir(projectRoot, { recursive: true });
  const generated = path.join(projectRoot, "OCA 产物.md");
  const manual = path.join(projectRoot, "人工笔记.md");
  await fs.writeFile(generated, [
    "---", "schema_version: 2", "type: conversation", "artifact_id: source:thread:turn",
    "oca_version: 1.0.0-beta.2", "oca_managed: false", "---", "", "# OCA 产物"
  ].join("\n"), "utf8");
  await fs.writeFile(manual, "# 人工笔记\n", "utf8");
  await fs.mkdir(path.join(vaultRoot, ".oca-duplex", "transactions"), { recursive: true });
  await fs.writeFile(path.join(vaultRoot, ".oca-duplex", "audit.jsonl"), "{}\n", "utf8");
  await fs.writeFile(path.join(vaultRoot, ".oca-duplex", "runtime-state.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(vaultRoot, ".oca-duplex", "transactions", "one.json"), "{}\n", "utf8");

  const result = await clearOcaGeneratedData(config);
  assert.equal(result.deleted_count, 1);
  await assert.rejects(fs.access(generated));
  await fs.access(manual);
  await assert.rejects(fs.access(path.join(vaultRoot, ".oca-duplex", "audit.jsonl")));
  await assert.rejects(fs.access(path.join(vaultRoot, ".oca-duplex", "runtime-state.json")));
  await assert.rejects(fs.access(path.join(vaultRoot, ".oca-duplex", "transactions")));
  await fs.rm(vaultRoot, { recursive: true, force: true });
});
