import { stdout as output } from "node:process";
import { discoverConfigPath, loadConfig } from "../runtime/config.js";
import { applyLayoutMigrationPlan, buildLayoutMigrationPlan } from "../vault/layout-migration.js";
import { layoutProfile } from "../vault/layout-profiles.js";
import { hasFlag, option } from "./args.js";

export async function runLayout(args) {
  const configPath = await discoverConfigPath({ explicitPath: option(args, "--config") });
  const config = await loadConfig(configPath, { allowEmptySafeMode: true });
  const requested = option(args, "--language");
  if (!requested) {
    const current = layoutProfile(config.locale ?? config.layoutProfile ?? "zh-CN");
    const result = {
      locale: current.id,
      name: current.name,
      user_facing_paths: config.userFacingPaths,
      project_subdirs: config.projectSubdirs
    };
    output.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  const plan = await buildLayoutMigrationPlan(config, requested);
  if (!hasFlag(args, "--apply")) {
    const preview = { ...plan, next_config: undefined };
    output.write(`${JSON.stringify(preview, null, 2)}\n`);
    output.write(plan.ready
      ? "\n预览通过。确认无误后添加 --apply 执行迁移。\n"
      : "\n发现目标路径冲突，当前不能执行迁移。\n");
    return plan;
  }

  if (!hasFlag(args, "--yes")) throw new Error("执行目录迁移必须同时添加 --apply --yes；请先运行不带 --apply 的预览命令。");
  const result = await applyLayoutMigrationPlan(configPath, plan);
  output.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}
