import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function withinVault(vaultRoot, relativePath) {
  const root = path.resolve(vaultRoot);
  const target = path.resolve(root, String(relativePath ?? "").replace(/\\/g, "/"));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`事务路径超出 Vault：${relativePath}`);
  return target;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function beginWriteTransaction(plan, config) {
  const id = randomUUID();
  const root = withinVault(config.vaultRoot, ".oca-duplex/transactions");
  const backupRoot = path.join(root, id);
  const manifestPath = path.join(root, `${id}.json`);
  const targets = [...new Set(plan.map((entry) => entry.target))];
  const snapshots = [];
  await fs.mkdir(backupRoot, { recursive: true });
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const absolute = withinVault(config.vaultRoot, target);
    try {
      const content = await fs.readFile(absolute);
      const backup = path.join(backupRoot, `${index}.bin`);
      await fs.writeFile(backup, content);
      snapshots.push({ target, existed: true, backup });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      snapshots.push({ target, existed: false, backup: null });
    }
  }
  const manifest = {
    schema_version: 1,
    id,
    status: "applying",
    started_at: new Date().toISOString(),
    targets: snapshots.map(({ target, existed }) => ({ target, existed }))
  };
  await writeJson(manifestPath, manifest);
  return { id, backupRoot, manifestPath, manifest, snapshots };
}

export async function completeWriteTransaction(transaction) {
  transaction.manifest.status = "complete";
  transaction.manifest.completed_at = new Date().toISOString();
  await writeJson(transaction.manifestPath, transaction.manifest);
  await fs.rm(transaction.backupRoot, { recursive: true, force: true });
}

export async function rollbackWriteTransaction(transaction, config, cause) {
  const errors = [];
  for (const snapshot of [...transaction.snapshots].reverse()) {
    const target = withinVault(config.vaultRoot, snapshot.target);
    try {
      if (snapshot.existed) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(snapshot.backup, target);
      } else {
        await fs.rm(target, { force: true });
      }
    } catch (error) {
      errors.push({ target: snapshot.target, error: error.message });
    }
  }
  transaction.manifest.status = errors.length ? "rollback_incomplete" : "rolled_back";
  transaction.manifest.failed_at = new Date().toISOString();
  transaction.manifest.error = cause.message;
  transaction.manifest.rollback_errors = errors;
  await writeJson(transaction.manifestPath, transaction.manifest);
  await fs.rm(transaction.backupRoot, { recursive: true, force: true });
  return errors;
}

export async function appendAuditEvents(config, transactionId, results) {
  const auditPath = withinVault(config.vaultRoot, ".oca-duplex/audit.jsonl");
  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  const timestamp = new Date().toISOString();
  const lines = results.map((result) => JSON.stringify({
    schema_version: 1,
    event_id: randomUUID(),
    transaction_id: transactionId,
    occurred_at: timestamp,
    operation: result.operation,
    artifact_type: result.type,
    target: result.target,
    outcome: result.outcome,
    thread_id: result.source_thread_id ?? null,
    turn_id: result.source_turn_id ?? null,
    project_root: result.project_root ?? null,
    knowledge_operation: result.knowledge_operation ?? null
  }));
  if (lines.length) await fs.appendFile(auditPath, `${lines.join("\n")}\n`, "utf8");
  return auditPath;
}
