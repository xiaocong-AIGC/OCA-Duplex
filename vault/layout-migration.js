import fs from "node:fs/promises";
import path from "node:path";
import { applyLayoutProfile, layoutProfile, normalizeLocale } from "./layout-profiles.js";
import { normalizeVaultPath } from "./path-map.js";

function insideVault(vaultRoot, relativePath) {
  const root = path.resolve(vaultRoot);
  const target = path.resolve(root, normalizeVaultPath(relativePath));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`迁移路径超出 Vault：${relativePath}`);
  return target;
}

async function kindAt(vaultRoot, relativePath) {
  const stat = await fs.stat(insideVault(vaultRoot, relativePath)).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return "missing";
  return stat.isDirectory() ? "directory" : "file";
}

function translatedAfterRootMove(relativePath, currentConfig, targetConfig) {
  const input = normalizeVaultPath(relativePath);
  for (const key of Object.keys(currentConfig.userFacingPaths)) {
    const from = normalizeVaultPath(currentConfig.userFacingPaths[key]);
    if (input === from || input.startsWith(`${from}/`)) {
      const suffix = input.slice(from.length).replace(/^\//, "");
      return normalizeVaultPath(path.posix.join(targetConfig.userFacingPaths[key], suffix));
    }
  }
  return input;
}

async function addMove(operations, conflicts, vaultRoot, { phase, kind, from, to, inspectFrom = from, inspectTo = to }) {
  from = normalizeVaultPath(from);
  to = normalizeVaultPath(to);
  if (!from || !to || from === to) return;
  const sourceKind = await kindAt(vaultRoot, inspectFrom);
  if (sourceKind === "missing") return;
  const targetKind = await kindAt(vaultRoot, inspectTo);
  const operation = { phase, kind, from, to, source_kind: sourceKind, target_kind: targetKind };
  operations.push(operation);
  if (targetKind !== "missing") conflicts.push({ ...operation, reason: "目标路径已经存在" });
}

export async function buildLayoutMigrationPlan(config, targetLocale) {
  const locale = normalizeLocale(targetLocale);
  const targetConfig = applyLayoutProfile(structuredClone(config), locale);
  const vaultRoot = config.vaultRoot;
  const operations = [];
  const conflicts = [];

  for (const key of Object.keys(targetConfig.userFacingPaths)) {
    await addMove(operations, conflicts, vaultRoot, {
      phase: 1,
      kind: `root:${key}`,
      from: config.userFacingPaths[key],
      to: targetConfig.userFacingPaths[key]
    });
  }

  const currentProjects = normalizeVaultPath(config.userFacingPaths.projects);
  const targetProjects = normalizeVaultPath(targetConfig.userFacingPaths.projects);
  const projectsKind = await kindAt(vaultRoot, currentProjects);
  if (projectsKind === "directory") {
    const entries = await fs.readdir(insideVault(vaultRoot, currentProjects), { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory())) {
      for (const key of Object.keys(targetConfig.projectSubdirs)) {
        const currentName = config.projectSubdirs[key];
        const targetName = targetConfig.projectSubdirs[key];
        await addMove(operations, conflicts, vaultRoot, {
          phase: 2,
          kind: `project-folder:${key}`,
          from: path.posix.join(targetProjects, entry.name, currentName),
          to: path.posix.join(targetProjects, entry.name, targetName),
          inspectFrom: path.posix.join(currentProjects, entry.name, currentName),
          inspectTo: path.posix.join(currentProjects, entry.name, targetName)
        });
      }
    }
  }

  const currentProfile = layoutProfile(config.locale ?? config.layoutProfile ?? "zh-CN");
  await addMove(operations, conflicts, vaultRoot, {
    phase: 2,
    kind: "project-index",
    from: path.posix.join(targetProjects, currentProfile.names.projectIndex),
    to: path.posix.join(targetProjects, layoutProfile(locale).names.projectIndex),
    inspectFrom: path.posix.join(currentProjects, currentProfile.names.projectIndex),
    inspectTo: path.posix.join(currentProjects, layoutProfile(locale).names.projectIndex)
  });

  const specialPaths = [
    ["dashboard", config.dashboard?.path, targetConfig.dashboard.path],
    ["daily", config.daily?.path, targetConfig.daily.path]
  ];
  for (const [kind, currentPath, targetPath] of specialPaths) {
    if (!currentPath) continue;
    await addMove(operations, conflicts, vaultRoot, {
      phase: 2,
      kind,
      from: translatedAfterRootMove(currentPath, config, targetConfig),
      to: targetPath,
      inspectFrom: currentPath,
      inspectTo: translatedAfterRootMove(targetPath, targetConfig, config)
    });
  }

  return {
    schema_version: 1,
    from: config.locale ?? config.layoutProfile ?? "zh-CN",
    to: locale,
    profile_name: layoutProfile(locale).name,
    ready: conflicts.length === 0,
    operations: operations.sort((a, b) => a.phase - b.phase),
    conflicts,
    next_config: targetConfig
  };
}

export async function applyLayoutMigrationPlan(configPath, plan) {
  if (!plan.ready || plan.conflicts.length) throw new Error("迁移计划存在冲突，请先处理冲突后重新预览。");
  const vaultRoot = plan.next_config.vaultRoot;
  const migrationDir = insideVault(vaultRoot, ".oca-duplex/migrations");
  await fs.mkdir(migrationDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const manifestPath = path.join(migrationDir, `${stamp}-${plan.from}-to-${plan.to}.json`);
  const completed = [];
  const manifest = { ...plan, status: "applying", started_at: new Date().toISOString(), completed: [] };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  try {
    for (const operation of plan.operations) {
      const source = insideVault(vaultRoot, operation.from);
      const target = insideVault(vaultRoot, operation.to);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(source, target);
      completed.push(operation);
      manifest.completed = completed;
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
    await fs.writeFile(path.resolve(configPath), `${JSON.stringify(plan.next_config, null, 2)}\n`, "utf8");
    manifest.status = "complete";
    manifest.completed_at = new Date().toISOString();
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return { applied: true, operations: completed.length, manifest: manifestPath, locale: plan.to };
  } catch (error) {
    const rollbackErrors = [];
    for (const operation of [...completed].reverse()) {
      try {
        await fs.rename(insideVault(vaultRoot, operation.to), insideVault(vaultRoot, operation.from));
      } catch (rollbackError) {
        rollbackErrors.push({ operation, error: rollbackError.message });
      }
    }
    manifest.status = rollbackErrors.length ? "rollback_incomplete" : "rolled_back";
    manifest.error = error.message;
    manifest.rollback_errors = rollbackErrors;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    throw new Error(`目录迁移失败，已尝试回滚：${error.message}${rollbackErrors.length ? "；部分路径需要人工恢复" : ""}`);
  }
}
