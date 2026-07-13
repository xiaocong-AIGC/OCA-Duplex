export const CONTENT_SCHEMA_VERSION = 2;

export const ARTIFACT_TYPES = Object.freeze({
  conversation: "conversation",
  learningSummary: "learning_summary",
  knowledge: "knowledge",
  prompt: "prompt",
  output: "output",
  decision: "decision",
  project: "project",
  syncLog: "sync_log"
});

export const KNOWLEDGE_STATES = Object.freeze(["candidate", "validated", "superseded", "archived"]);
export const KNOWLEDGE_OPERATIONS = Object.freeze(["add", "update", "merge", "conflict", "supersede"]);

export function threadLifecycle(snapshot) {
  const threadStatus = snapshot?.thread?.status ?? "active";
  const turnStatus = snapshot?.turn?.status ?? "unknown";
  return {
    schema_version: CONTENT_SCHEMA_VERSION,
    thread_id: snapshot?.thread?.id ?? null,
    thread_status: threadStatus,
    turn_id: snapshot?.turn?.id ?? null,
    turn_status: turnStatus,
    last_activity_at: snapshot?.turn?.completed_at ?? snapshot?.turn?.started_at ?? null
  };
}

export function artifactIdentity(type, snapshot, suffix = "") {
  const threadId = snapshot?.thread?.id ?? "unknown-thread";
  const turnId = snapshot?.turn?.id ?? "unknown-turn";
  const stableScope = type === ARTIFACT_TYPES.conversation || type === ARTIFACT_TYPES.learningSummary
    ? threadId
    : `${threadId}:${turnId}`;
  return [type, stableScope, suffix].filter(Boolean).join(":");
}
