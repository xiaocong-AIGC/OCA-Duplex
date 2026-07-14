import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInit } from "../commands/init.js";
import { runMode, runWorkspace } from "../commands/configure.js";
import { configPathForVault, loadConfig } from "../runtime/config.js";
import { filterThreadsByMode, workspaceForCwd } from "../runtime/workspace-policy.js";
import { ProjectResolver } from "../runtime/project-resolver.js";

const temporaryRoots = new Set();

test.after(async () => {
  await Promise.all([...temporaryRoots].map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function tempLayout() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "oca-public-"));
  temporaryRoots.add(root);
  const vault = path.join(root, "vault");
  const projectA = path.join(root, "projects", "alpha");
  const projectB = path.join(root, "projects", "beta");
  const nested = path.join(projectA, "packages", "special");
  await Promise.all([vault, projectA, projectB, nested].map((directory) => fs.mkdir(directory, { recursive: true })));
  return { root, vault, projectA, projectB, nested };
}

test("init creates a private-by-default, stable config with multiple project mappings", async () => {
  const layout = await tempLayout();
  await runInit([
    "--vault", layout.vault,
    "--mode", "safe",
    "--workspace", `${layout.projectA}=项目甲`,
    "--workspace", `${layout.projectB}=项目乙`
  ]);
  const config = await loadConfig(configPathForVault(layout.vault));
  assert.equal(config.capture.mode, "safe");
  assert.equal(config.capture.includeToolResults, false);
  assert.equal(config.appServer.experimentalApi, false);
  assert.deepEqual(config.capture.workspaces.map((entry) => entry.project), ["项目甲", "项目乙"]);
  await fs.access(path.join(layout.vault, ".oca-duplex", "project-aliases.json"));
  await fs.access(path.join(layout.vault, "项目"));
});

test("safe, manual, and all modes select the expected task metadata", async () => {
  const layout = await tempLayout();
  const capture = {
    mode: "safe",
    workspaces: [
      { path: layout.projectA, project: "项目甲" },
      { path: layout.nested, project: "特殊子项目" }
    ]
  };
  const threads = [
    { id: "a", cwd: layout.projectA },
    { id: "nested", cwd: path.join(layout.nested, "src") },
    { id: "other", cwd: layout.projectB }
  ];
  assert.deepEqual(filterThreadsByMode(threads, capture).map((thread) => thread.id), ["a", "nested"]);
  assert.equal(workspaceForCwd(capture.workspaces, path.join(layout.nested, "src")).project, "特殊子项目");
  assert.deepEqual(filterThreadsByMode(threads, { ...capture, mode: "manual" }), []);
  assert.deepEqual(filterThreadsByMode(threads, { ...capture, mode: "all" }).map((thread) => thread.id), ["a", "nested", "other"]);
});

test("workspace mapping has highest routing priority and prevents topic-based mixing", async () => {
  const layout = await tempLayout();
  const config = {
    vaultRoot: layout.vault,
    userFacingPaths: { projects: "10_项目" },
    projectAliases: { path: ".oca-duplex/project-aliases.json" },
    capture: { workspaces: [{ path: layout.projectA, project: "项目甲" }] }
  };
  await fs.mkdir(path.join(layout.vault, ".oca-duplex"), { recursive: true });
  await fs.writeFile(path.join(layout.vault, ".oca-duplex", "project-aliases.json"), JSON.stringify({
    aliases: [{ project_name: "错误项目", aliases: ["相同话题"], default_categories: [] }]
  }));
  const resolver = new ProjectResolver(config);
  await resolver.initialize();
  const result = await resolver.resolve({
    thread: { cwd: path.join(layout.projectA, "src"), name: "相同话题" },
    conversation_nodes: [{ role: "user", kind: "message", text: "讨论相同话题" }]
  });
  assert.equal(result.project_name, "项目甲");
  assert.equal(result.source, "workspace_mapping");
  assert.equal(result.confidence, 1);
});

test("generic operational wording is not invented as a project name", async () => {
  const layout = await tempLayout();
  const config = {
    vaultRoot: layout.vault,
    userFacingPaths: { projects: "10_项目" },
    projectAliases: { path: ".oca-duplex/project-aliases.json" },
    capture: { workspaces: [] }
  };
  await fs.mkdir(path.join(layout.vault, ".oca-duplex"), { recursive: true });
  await fs.writeFile(path.join(layout.vault, ".oca-duplex", "project-aliases.json"), JSON.stringify({ aliases: [] }));
  const resolver = new ProjectResolver(config);
  await resolver.initialize();
  const result = await resolver.resolve({
    thread: { cwd: "D:\\ObsidianVault", name: "请全面分析当前工具" },
    conversation_nodes: [{ role: "user", kind: "message", text: "实时监控 ChatGPT 应用的每个文件夹和项目对话。" }]
  });
  assert.equal(result.project_name, "未归类Codex捕获");
  assert.equal(result.needs_confirmation, true);
});

test("users can switch modes and manage workspace mappings after installation", async () => {
  const layout = await tempLayout();
  await runInit(["--vault", layout.vault, "--mode", "manual"]);
  const configPath = configPathForVault(layout.vault);
  await runWorkspace(["add", "--config", configPath, "--path", layout.projectA, "--project", "项目甲"]);
  await runMode(["safe", "--config", configPath]);
  assert.equal((await loadConfig(configPath)).capture.mode, "safe");
  await runMode(["all", "--yes", "--config", configPath]);
  assert.equal((await loadConfig(configPath)).capture.mode, "all");
  await runMode(["manual", "--config", configPath]);
  assert.equal((await loadConfig(configPath)).capture.mode, "manual");
});
