import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveWithinVault } from "../core/writer.js";

const TERMINAL_MODES = new Set(["write", "commit", "skipped", "legacy"]);

function normalizeRecord(record) {
  return {
    thread_id: record.thread_id ?? null,
    turn_id: record.turn_id,
    processed_at: record.processed_at ?? null,
    mode: record.mode ?? "legacy",
    files: Array.isArray(record.files) ? record.files : [],
    commit_hash: record.commit_hash ?? null,
    user_choice: record.user_choice ?? null
  };
}

export class ContextBuffer {
  constructor(config) {
    this.config = config;
    this.processedTurns = new Set();
    this.processedThreads = new Set();
    this.records = [];
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    const filePath = resolveWithinVault(this.config.vaultRoot, this.config.state.path);
    try {
      const state = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (Array.isArray(state.records)) {
        this.records = state.records.map(normalizeRecord);
      } else {
        this.records = (state.processed_turn_ids ?? []).map((turnId) => normalizeRecord({
          turn_id: turnId,
          processed_at: state.updated_at ?? null,
          mode: "legacy"
        }));
      }
      for (const record of this.records) this.#indexRecord(record);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  select(snapshots, limit = 1) {
    return snapshots
      .filter((snapshot) => !this.processedTurns.has(snapshot.turn.id))
      .sort((left, right) => String(left.turn.completed_at ?? "").localeCompare(String(right.turn.completed_at ?? "")))
      .slice(0, limit);
  }

  hasProcessed(turnId) {
    return this.processedTurns.has(turnId);
  }

  mark(turnId) {
    this.processedTurns.add(turnId);
  }

  record({ threadId, turnId, mode, files = [], commitHash = null, userChoice = null, processedAt = new Date().toISOString() }) {
    const record = normalizeRecord({
      thread_id: threadId,
      turn_id: turnId,
      processed_at: processedAt,
      mode,
      files: [...new Set(files)],
      commit_hash: commitHash,
      user_choice: userChoice
    });
    const index = this.records.findIndex((entry) => entry.turn_id === turnId);
    if (index >= 0) this.records[index] = record;
    else this.records.push(record);
    this.#indexRecord(record);
    return record;
  }

  updateRecord(turnId, patch) {
    const index = this.records.findIndex((record) => record.turn_id === turnId);
    if (index < 0) throw new Error(`Runtime record not found for turn: ${turnId}`);
    this.records[index] = normalizeRecord({ ...this.records[index], ...patch });
    this.#indexRecord(this.records[index]);
    return this.records[index];
  }

  getRecord(turnId) {
    return this.records.find((record) => record.turn_id === turnId) ?? null;
  }

  async save() {
    const relativePath = this.config.state.path;
    const filePath = resolveWithinVault(this.config.vaultRoot, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    let existed = true;
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      existed = false;
    }
    const state = {
      version: 2,
      updated_at: new Date().toISOString(),
      processed_thread_ids: [...this.processedThreads].sort(),
      processed_turn_ids: [...this.processedTurns].sort(),
      records: [...this.records].sort((left, right) => String(left.processed_at).localeCompare(String(right.processed_at)))
    };
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
    return {
      operation: existed ? "update" : "create",
      type: "runtime_state",
      target: relativePath.replace(/\\/g, "/"),
      outcome: existed ? "updated" : "created",
      absolute_path: filePath
    };
  }

  #indexRecord(record) {
    if (TERMINAL_MODES.has(record.mode)) this.processedTurns.add(record.turn_id);
    if (record.thread_id) this.processedThreads.add(record.thread_id);
  }
}
