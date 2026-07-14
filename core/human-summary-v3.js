export function buildHumanSummary(snapshot, parsed, writePlan) {
  const count = (predicate) => writePlan.filter(predicate).length;
  const projectKnowledge = count((entry) => entry.type === "knowledge" && entry.scope === "project");
  const projectDigest = count((entry) => entry.type === "digest" && entry.scope === "project");
  const projectOutput = count((entry) => entry.type === "output" && entry.scope === "project");
  const projectPrompt = count((entry) => entry.type === "prompt" && entry.scope === "project");
  const globalKnowledge = count((entry) => entry.type === "knowledge" && entry.scope === "global");
  const globalPrompt = count((entry) => entry.type === "prompt" && entry.scope === "global");
  const unsorted = count((entry) => entry.scope === "unsorted" || (entry.type === "source" && entry.target.includes("Unsorted Codex Captures")));
  const onlySource = count((entry) => ["digest", "output", "knowledge", "prompt"].includes(entry.type)) === 0;
  const sourceOnlyReason = "本轮只写入对话底稿，因为没有检测到可复用内容、可执行方案或明确结论。";
  const reason = onlySource
    ? sourceOnlyReason
    : `项目优先：计划写入 ${projectDigest} 篇内容整理、${projectOutput} 篇项目输出、${projectKnowledge} 篇项目知识、${projectPrompt} 篇项目提示词、${globalKnowledge} 篇全局知识、${globalPrompt} 篇全局提示词；未归类 ${unsorted} 项。`;
  return {
    captured_messages: snapshot.conversation_nodes.length,
    source_notes_to_create: count((entry) => entry.type === "source"),
    project_home_to_create: count((entry) => entry.type === "project_home"),
    content_digests_to_create: projectDigest,
    project_outputs_to_create: projectOutput,
    project_knowledge_to_create: projectKnowledge,
    project_prompt_to_create: projectPrompt,
    global_knowledge_to_create: globalKnowledge,
    global_prompt_to_create: globalPrompt,
    unsorted_captures: unsorted,
    skipped_fragments: parsed.extraction_stats?.skipped_fragments ?? 0,
    reason
  };
}
