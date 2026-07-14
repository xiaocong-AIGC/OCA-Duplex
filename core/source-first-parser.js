import { stableId } from "./text.js";
import {
  buildSemanticTitle,
  hasReusableValue,
  isEnvironmentStatus,
  isStructuralLine,
  meetsContentLength,
  passesKnowledgeGate,
  QUALITY_PATTERNS,
  semanticTags
} from "./quality.js";
import { assistantResponseText, extractContentUnits } from "./content-extractor.js";

function cleanLine(line) {
  return String(line ?? "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\s*>\s?/, "")
    .trim();
}

function extractFragments(node) {
  const fragments = [];
  let skipped = 0;
  let heading = "";
  let paragraph = [];
  let insideCode = false;

  const flush = () => {
    const tableLike = paragraph.filter((line) => /^\s*\|.*\|\s*$/.test(line)).length >= 2;
    const text = (tableLike ? paragraph.join("\n") : paragraph.join(" ").replace(/\s+/g, " ")).trim();
    paragraph = [];
    if (!text) return;
    if (isEnvironmentStatus(text) || !hasReusableValue(`${heading} ${text}`)) {
      skipped += 1;
      return;
    }
    fragments.push({
      id: stableId(node.id, heading, text),
      node_id: node.id,
      role: node.role,
      heading,
      text
    });
  };

  for (const rawLine of String(node.text ?? "").replace(/\r/g, "").split("\n")) {
    const trimmed = rawLine.trim();
    if (/^```|^~~~/.test(trimmed)) {
      flush();
      insideCode = !insideCode;
      skipped += 1;
      continue;
    }
    if (insideCode) {
      skipped += 1;
      continue;
    }
    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flush();
      heading = headingMatch[1].trim();
      skipped += 1;
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    if (isStructuralLine(trimmed)) {
      flush();
      skipped += 1;
      continue;
    }
    const line = cleanLine(trimmed);
    if (!line || isStructuralLine(line)) {
      skipped += 1;
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return { fragments, skipped };
}

function uniqueFragments(fragments) {
  const seen = new Set();
  return fragments.filter((fragment) => {
    const key = fragment.text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function composeSummary(fragments, maximumCharacters = 2600) {
  const parts = [];
  let length = 0;
  for (const fragment of uniqueFragments(fragments)) {
    const part = fragment.heading ? `**${fragment.heading}**\n${fragment.text}` : fragment.text;
    if (length > 0 && length + part.length > maximumCharacters) break;
    parts.push(part);
    length += part.length;
  }
  return parts.join("\n\n").trim();
}

function createUnit(kind, fragments, snapshot, topicText) {
  const text = composeSummary(fragments);
  const title = buildSemanticTitle(kind, `${topicText}\n${text}`);
  const unit = {
    unit_id: `KU-${stableId(snapshot.thread.id, snapshot.turn.id, kind, text)}`,
    category: kind === "project" ? "task_collection" : kind === "prompt" ? "rule_summary" : "method_summary",
    type_hint: kind,
    title,
    text,
    tags: semanticTags(`${title}\n${text}`),
    source_node_ids: [...new Set(fragments.map((fragment) => fragment.node_id))],
    source_thread_id: snapshot.thread.id,
    source_turn_id: snapshot.turn.id,
    reusable_value: true
  };
  return passesKnowledgeGate(unit) ? unit : null;
}

function explicitProjectName(snapshot) {
  return "";
}

export function parseConversation(snapshot) {
  const nodes = snapshot.conversation_nodes ?? [];
  const finalAnswers = nodes.filter((node) => node.role === "assistant" && node.kind === "message" && node.phase === "final_answer");
  const userMessages = nodes.filter((node) => node.role === "user" && node.kind === "message");
  const legacyAnswers = finalAnswers.length === 0
    ? nodes.filter((node) => node.role === "assistant" && node.kind === "message" && node.phase !== "commentary")
    : [];
  // Derived assets must come from an answer, not from the user's request. The
  // request remains in the Source note and is used only as title context.
  // Mixing it into the reusable-content pool turns questions into fake rules.
  const extractionNodes = [...finalAnswers, ...legacyAnswers];
  const extracted = extractionNodes.map(extractFragments);
  const fragments = uniqueFragments(extracted.flatMap((result) => result.fragments));
  let skippedFragments = extracted.reduce((total, result) => total + result.skipped, 0);
  const topicText = `${snapshot.thread.preview ?? ""}\n${userMessages.map((node) => node.text).join("\n")}`;

  const promptFragments = fragments.filter((fragment) => QUALITY_PATTERNS.prompt.test(`${fragment.heading} ${fragment.text}`));
  const promptIds = new Set(promptFragments.map((fragment) => fragment.id));
  const projectFragments = fragments.filter((fragment) => {
    if (promptIds.has(fragment.id)) return false;
    const context = `${fragment.heading} ${fragment.text}`;
    const explicitProject = /项目实施|交付目标|验收标准|任务集合|里程碑|\bmvp\b|project|deliverable|milestone/i.test(context);
    const userRequest = fragment.role === "user" && /请|需要|目标|要求|implement|build|create/i.test(fragment.text);
    return explicitProject || userRequest;
  });
  const projectIds = new Set(projectFragments.map((fragment) => fragment.id));
  const knowledgeFragments = fragments.filter((fragment) =>
    QUALITY_PATTERNS.knowledge.test(`${fragment.heading} ${fragment.text}`)
    && !promptIds.has(fragment.id)
    && !projectIds.has(fragment.id)
  );

  const candidates = [
    ["project", projectFragments],
    ["knowledge", knowledgeFragments],
    ["prompt", promptFragments]
  ];
  const units = [];
  for (const [kind, selected] of candidates) {
    if (selected.length === 0) continue;
    const unit = createUnit(kind, selected, snapshot, topicText);
    if (unit && meetsContentLength(unit.text)) units.push(unit);
    else skippedFragments += selected.length;
  }

  const assistantText = assistantResponseText(snapshot);
  const contentUnits = extractContentUnits({
    snapshot,
    text: assistantText,
    projectName: explicitProjectName(snapshot),
    title: topicText
  });
  const contentTypes = new Set(contentUnits.map((unit) => unit.type_hint));
  const dedupedUnits = [
    ...contentUnits,
    ...units.filter((unit) => !contentTypes.has(unit.type_hint))
  ];

  const title = buildSemanticTitle("source", topicText || fragments.map((fragment) => fragment.text).join(" "));
  return {
    title,
    knowledge_units: dedupedUnits.slice(0, 5),
    project_updates: units
      .filter((unit) => unit.type_hint === "project")
      .map((unit) => ({
        update_id: `PU-${stableId(unit.unit_id)}`,
        title: unit.title,
        action: unit.text,
        status: "proposed",
        source_unit_id: unit.unit_id
      })),
    extraction_stats: {
      candidate_fragments: fragments.length,
      skipped_fragments: skippedFragments,
      derived_notes: dedupedUnits.length,
      learning_summary_units: contentUnits.filter((unit) => unit.type_hint === "learning_summary").length,
      content_digest_units: contentUnits.filter((unit) => ["digest", "learning_summary"].includes(unit.type_hint)).length,
      output_units: contentUnits.filter((unit) => unit.type_hint === "output").length
    }
  };
}
