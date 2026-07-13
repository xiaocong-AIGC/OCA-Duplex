import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInit } from "../commands/init.js";
import { configPathForVault, defaultConfig, loadConfig, saveConfig } from "../runtime/config.js";
import { applyLayoutMigrationPlan, buildLayoutMigrationPlan } from "../vault/layout-migration.js";

const temporaryRoots = new Set();

test.after(async () => {
  await Promise.all([...temporaryRoots].map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function tempVault() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "oca-layout-"));
  temporaryRoots.add(root);
  const vault = path.join(root, "vault");
  await fs.mkdir(vault, { recursive: true });
  return vault;
}

test("English installation creates a purely English public layout", async () => {
  const vault = await tempVault();
  await runInit(["--vault", vault, "--mode", "manual", "--language", "en-US"]);
  const config = await loadConfig(configPathForVault(vault));
  assert.equal(config.locale, "en-US");
  assert.equal(config.userFacingPaths.projects, "Projects");
  assert.equal(config.projectSubdirs.sources, "Conversations");
  await Promise.all(["Inbox", "Projects", "Global Knowledge", "Global Sources", "Global Prompts", "System"]
    .map((name) => fs.access(path.join(vault, name))));
});

test("layout migration previews and atomically switches Chinese folders to English", async () => {
  const vault = await tempVault();
  const config = defaultConfig(vault, "zh-CN");
  config.capture.mode = "manual";
  const configPath = configPathForVault(vault);
  await saveConfig(configPath, config);

  for (const root of Object.values(config.userFacingPaths)) await fs.mkdir(path.join(vault, root), { recursive: true });
  const projectRoot = path.join(vault, config.userFacingPaths.projects, "Demo");
  for (const folder of Object.values(config.projectSubdirs)) await fs.mkdir(path.join(projectRoot, folder), { recursive: true });
  await fs.writeFile(path.join(vault, config.userFacingPaths.projects, "项目索引.md"), "# 项目索引\n", "utf8");
  await fs.mkdir(path.join(vault, config.daily.path), { recursive: true });
  await fs.mkdir(path.dirname(path.join(vault, config.dashboard.path)), { recursive: true });
  await fs.writeFile(path.join(vault, config.dashboard.path), "# 系统看板\n", "utf8");

  const plan = await buildLayoutMigrationPlan(config, "en-US");
  assert.equal(plan.ready, true);
  assert.ok(plan.operations.some((entry) => entry.to === "Projects"));
  assert.ok(plan.operations.some((entry) => entry.to === "Projects/Demo/Conversations"));

  const result = await applyLayoutMigrationPlan(configPath, plan);
  assert.equal(result.applied, true);
  await fs.access(path.join(vault, "Projects", "Demo", "Conversations"));
  await fs.access(path.join(vault, "Projects", "Project Index.md"));
  await fs.access(path.join(vault, "System", "OCA-Duplex", "System Dashboard.md"));
  assert.equal((await loadConfig(configPath)).locale, "en-US");
});
