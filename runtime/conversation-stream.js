import { normalizeThread } from "../core/capture.js";
import { filterThreadsByMode } from "./workspace-policy.js";

function sleep(milliseconds, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
    signal?.addEventListener("abort", finish, { once: true });
  });
}

export class ConversationStream {
  constructor(client, config) {
    this.client = client;
    this.config = config;
  }

  async selectThreads(explicitThreadIds = []) {
    if (explicitThreadIds.length > 0) return explicitThreadIds;
    if ((this.config.capture.mode ?? "safe") === "manual") {
      throw new Error("当前是手动模式。请使用 --thread <任务ID>，或运行 oca-duplex threads 查看任务。");
    }
    const threads = await this.listThreads();
    return threads.map((thread) => thread.id);
  }

  async listThreads({ unfiltered = false, limit } = {}) {
    const response = await this.client.request("thread/list", {
      archived: this.config.capture.includeArchived,
      limit: limit ?? this.config.capture.newestThreads
    });
    const threads = response.data ?? [];
    return unfiltered ? threads : filterThreadsByMode(threads, this.config.capture);
  }

  async readThread(threadId) {
    const response = await this.client.request("thread/read", { threadId, includeTurns: true });
    return response.thread;
  }

  async fetchSnapshots(explicitThreadIds = []) {
    const threadIds = await this.selectThreads(explicitThreadIds);
    const snapshots = [];
    for (const threadId of threadIds) {
      const thread = await this.readThread(threadId);
      snapshots.push(...normalizeThread(thread, this.config.capture));
    }
    return snapshots;
  }

  async watch(onSnapshots, { threadIds = [], signal } = {}) {
    while (!signal?.aborted) {
      const snapshots = await this.fetchSnapshots(threadIds);
      if (signal?.aborted) break;
      await onSnapshots(snapshots);
      if (signal?.aborted) break;
      await sleep(this.config.capture.pollIntervalMs ?? 10000, signal);
    }
  }
}
