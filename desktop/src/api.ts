import type { OverviewData } from "./types";
import { mockOverview } from "./mock-data";

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
    camelize(item)
  ]));
}

async function requestDesktop<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>("desktop_request", { request: { method, params } });
}

export async function loadOverview(): Promise<OverviewData> {
  if (!("__TAURI_INTERNALS__" in window)) return mockOverview;
  const result = await requestDesktop<unknown>("system.overview");
  return camelize(result) as OverviewData;
}

export async function desktopAction(action: "sync" | "open_obsidian" | "open_artifact", payload: Record<string, unknown> = {}) {
  if (!("__TAURI_INTERNALS__" in window)) return { ok: true, preview: true };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("desktop_action", { action, payload });
}

export async function chooseDirectory(): Promise<string | null> {
  if (!("__TAURI_INTERNALS__" in window)) return window.prompt("请输入目录路径 / Enter a directory path", "D:\\ObsidianVault");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

export async function initializeSystem(params: { vaultRoot: string; locale: string; mode: string; workspaces: Array<{ path: string; project: string }> }) {
  if (!("__TAURI_INTERNALS__" in window)) return { configured: true };
  return requestDesktop("system.initialize", params);
}

export async function previewSync(threadIds: string[] = []) {
  if (!("__TAURI_INTERNALS__" in window)) return { mode: "dry-run", reports: [] };
  return requestDesktop<{ mode: string; reports: Array<Record<string, unknown>> }>("sync.preview", { limit: 5, threadIds });
}

export async function writeSync(threadIds: string[], turnIds: string[]) {
  if (!("__TAURI_INTERNALS__" in window)) return { mode: "write", reports: [] };
  return requestDesktop<{ mode: string; reports: Array<Record<string, unknown>> }>("sync.write", { limit: Math.max(5, turnIds.length), threadIds, turnIds });
}

export async function setCaptureMode(mode: "safe" | "manual" | "all") {
  if (!("__TAURI_INTERNALS__" in window)) return { mode };
  return requestDesktop<{ mode: string }>("settings.set_mode", { mode });
}

export async function setAutoWatch(enabled: boolean) {
  if (!("__TAURI_INTERNALS__" in window)) return { enabled };
  return requestDesktop<{ enabled: boolean }>("settings.set_auto_watch", { enabled });
}

export async function listThreads() {
  if (!("__TAURI_INTERNALS__" in window)) return [];
  const result = await requestDesktop<unknown>("threads.list", { limit: 50 });
  return camelize(result) as Array<{ id: string; name: string; preview: string; cwd: string; updatedAt: string | null }>;
}

export async function addWorkspace(path: string, project: string) {
  if (!("__TAURI_INTERNALS__" in window)) return { workspaces: [{ path, project }] };
  return requestDesktop<{ workspaces: Array<{ path: string; project: string }> }>("settings.add_workspace", { path, project });
}

export async function removeWorkspace(path: string) {
  if (!("__TAURI_INTERNALS__" in window)) return { workspaces: [] };
  return requestDesktop<{ workspaces: Array<{ path: string; project: string }> }>("settings.remove_workspace", { path });
}

export async function reviewKnowledge(path: string, action: "validate" | "archive" | "supersede", expectedUpdatedAt: string) {
  if (!("__TAURI_INTERNALS__" in window)) return { path, action };
  return requestDesktop("knowledge.review", { path, action, expectedUpdatedAt });
}

export async function switchLayoutLanguage(locale: "zh-CN" | "en-US") {
  if (!("__TAURI_INTERNALS__" in window)) return { applied: true, locale };
  const preview = await requestDesktop<any>("settings.set_language", { locale, apply: false });
  if (!preview.ready) return preview;
  const accepted = window.confirm(locale === "en-US"
    ? `This will move ${preview.operations.length} folders or files. Destination conflicts have been checked. Continue?`
    : `将移动 ${preview.operations.length} 个目录或文件。系统已检查目标路径冲突，是否继续？`);
  if (!accepted) return { applied: false, cancelled: true };
  return requestDesktop<any>("settings.set_language", { locale, apply: true });
}
