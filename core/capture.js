import { isoFromUnix, stableId, truncate } from "./text.js";

const SECRET_PATTERNS = [
  { pattern: /\bsk-[A-Za-z0-9_-]{12,}\b/g, replacement: "[REDACTED]" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replacement: "[REDACTED]" },
  { pattern: /\b(Bearer\s+)[A-Za-z0-9._~-]{12,}/gi, replacement: "$1[REDACTED]" }
];

export function redactSecrets(value) {
  let text = String(value ?? "");
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function userContentToText(content = []) {
  return content.map((part) => {
    if (part.type === "text") return part.text;
    if (part.type === "image") return `[image: ${part.url}]`;
    if (part.type === "localImage") return `[local image: ${part.path}]`;
    if (part.type === "skill") return `[skill: ${part.name} @ ${part.path}]`;
    if (part.type === "mention") return `[mention: ${part.name} @ ${part.path}]`;
    return `[${part.type ?? "unknown input"}]`;
  }).join("\n");
}

function visibleToolSummary(item, maxChars) {
  switch (item.type) {
    case "commandExecution":
      return `command=${item.command ?? ""}\nstatus=${item.status ?? "unknown"}\n${item.aggregatedOutput ?? ""}`;
    case "fileChange":
      return (item.changes ?? []).map((change) => `${change.kind?.type ?? change.kind ?? "change"}: ${change.path}`).join("\n");
    case "mcpToolCall":
      return `server=${item.server ?? ""} tool=${item.tool ?? ""} status=${item.status ?? "unknown"}${item.error?.message ? ` error=${item.error.message}` : ""}`;
    case "dynamicToolCall":
      return `tool=${item.namespace ? `${item.namespace}.` : ""}${item.tool ?? ""} status=${item.status ?? "unknown"} success=${item.success ?? "unknown"}`;
    case "webSearch":
      return `query=${item.query ?? ""}`;
    case "imageView":
      return `path=${item.path ?? ""}`;
    case "imageGeneration":
      return `status=${item.status ?? "unknown"} savedPath=${item.savedPath ?? ""}`;
    default:
      return "";
  }
}

export function normalizeItem(item, context, options = {}) {
  const maxToolOutputChars = options.maxToolOutputChars ?? 2000;
  const base = {
    id: item.id ?? stableId(context.threadId, context.turnId, item.type, JSON.stringify(item)),
    thread_id: context.threadId,
    turn_id: context.turnId,
    item_type: item.type ?? "unknown",
    timestamp: context.timestamp
  };

  if (item.type === "userMessage") {
    return { ...base, role: "user", kind: "message", phase: null, text: redactSecrets(userContentToText(item.content)) };
  }
  if (item.type === "agentMessage") {
    return { ...base, role: "assistant", kind: "message", phase: item.phase ?? null, text: redactSecrets(item.text ?? "") };
  }
  if (item.type === "reasoning") {
    if (!options.includeReasoningSummaries) return null;
    const summary = Array.isArray(item.summary) ? item.summary.join("\n") : "";
    if (!summary.trim()) return null;
    return { ...base, role: "assistant", kind: "reasoning_summary", phase: "commentary", text: redactSecrets(summary) };
  }
  if (!options.includeToolResults) return null;
  const toolText = visibleToolSummary(item, maxToolOutputChars);
  if (!toolText) return null;
  return {
    ...base,
    role: "tool",
    kind: "tool_result",
    phase: null,
    text: truncate(redactSecrets(toolText), maxToolOutputChars)
  };
}

export function normalizeTurn(thread, turn, options = {}) {
  const timestamp = isoFromUnix(turn.completedAt ?? turn.startedAt) ?? new Date().toISOString();
  const context = { threadId: thread.id, turnId: turn.id, timestamp };
  const nodes = (turn.items ?? [])
    .map((item) => normalizeItem(item, context, options))
    .filter(Boolean)
    .filter((node) => node.text.trim());
  return {
    thread: {
      id: thread.id,
      name: thread.name ?? null,
      preview: thread.preview ?? "",
      cwd: thread.cwd ?? null,
      source: thread.source ?? null,
      created_at: isoFromUnix(thread.createdAt)
    },
    turn: {
      id: turn.id,
      status: turn.status,
      started_at: isoFromUnix(turn.startedAt),
      completed_at: isoFromUnix(turn.completedAt),
      items_view: turn.itemsView ?? "full"
    },
    conversation_nodes: nodes
  };
}

export function normalizeThread(thread, options = {}) {
  const turns = (thread.turns ?? []).filter((turn) => !options.completedTurnsOnly || turn.status === "completed");
  return turns.map((turn) => normalizeTurn(thread, turn, options));
}
