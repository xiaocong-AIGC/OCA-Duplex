import path from "node:path";

function normalized(value) {
  const resolved = path.resolve(String(value ?? ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isPathInside(root, candidate) {
  if (!root || !candidate) return false;
  const base = normalized(root);
  const target = normalized(candidate);
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function workspaceForCwd(workspaces = [], cwd = "") {
  return workspaces
    .filter((entry) => isPathInside(entry.path, cwd))
    .sort((left, right) => normalized(right.path).length - normalized(left.path).length)[0] ?? null;
}

export function filterThreadsByMode(threads, capture, explicitThreadIds = []) {
  if (explicitThreadIds.length > 0) {
    const wanted = new Set(explicitThreadIds);
    return threads.filter((thread) => wanted.has(thread.id));
  }
  const mode = capture.mode ?? "safe";
  if (mode === "manual") return [];
  if (mode === "all") return threads;
  return threads.filter((thread) => workspaceForCwd(capture.workspaces, thread.cwd));
}

