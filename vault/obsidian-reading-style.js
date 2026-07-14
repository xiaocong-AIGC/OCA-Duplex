import fs from "node:fs/promises";
import path from "node:path";

export const OCA_SNIPPET_NAME = "oca-duplex-readable";

const INTERNAL_PROPERTIES = [
  "schema_version", "type", "artifact_id", "status", "project", "project_slug", "category",
  "source_thread_id", "source_turn_id", "thread_status", "turn_status", "captured_from",
  "captured_at", "oca_version", "oca_managed", "confidence", "oca_unit_id",
  "recommended_target", "assigned_by", "cssclasses"
];

export const OCA_READING_CSS = `/* Managed by OCA-Duplex. Keeps operational notes readable without changing their Markdown meaning. */
.oca-duplex-note .markdown-preview-sizer,
.oca-duplex-note .cm-sizer { max-width: 900px; }

${INTERNAL_PROPERTIES.map((key) => `.oca-duplex-note .metadata-property[data-property-key="${key}"]`).join(",\n")} { display: none; }

.oca-duplex-note .metadata-container { border: 1px solid var(--background-modifier-border); border-radius: 10px; padding: 10px 14px; }
.oca-duplex-note .cm-line:has(.cm-comment) { display: none; }
.oca-duplex-note .callout[data-callout="summary"] { --callout-color: 52, 120, 166; }
.oca-duplex-note .callout[data-callout="success"] { --callout-color: 47, 145, 112; }
.oca-duplex-note .callout[data-callout="warning"] { --callout-color: 205, 137, 35; }
.oca-duplex-note .callout[data-callout="info"] { --callout-color: 94, 108, 168; }
.oca-duplex-note table { width: 100%; }
.oca-duplex-note th { white-space: nowrap; }
.oca-duplex-note h2 { margin-top: 1.8em; padding-bottom: .35em; border-bottom: 1px solid var(--background-modifier-border); }
`;

export async function installObsidianReadingStyle(vaultRoot, { enable = true } = {}) {
  const obsidianDirectory = path.join(vaultRoot, ".obsidian");
  const exists = await fs.stat(obsidianDirectory).then((stat) => stat.isDirectory()).catch(() => false);
  if (!exists) return { installed: false, enabled: false, reason: "not-an-obsidian-vault" };
  const snippets = path.join(obsidianDirectory, "snippets");
  await fs.mkdir(snippets, { recursive: true });
  await fs.writeFile(path.join(snippets, `${OCA_SNIPPET_NAME}.css`), OCA_READING_CSS, "utf8");
  if (!enable) return { installed: true, enabled: false };

  const appearancePath = path.join(obsidianDirectory, "appearance.json");
  let appearance = {};
  try {
    appearance = JSON.parse(await fs.readFile(appearancePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") return { installed: true, enabled: false, reason: "invalid-appearance-config" };
  }
  const enabledCssSnippets = Array.isArray(appearance.enabledCssSnippets) ? appearance.enabledCssSnippets : [];
  if (!enabledCssSnippets.includes(OCA_SNIPPET_NAME)) enabledCssSnippets.push(OCA_SNIPPET_NAME);
  await fs.writeFile(appearancePath, `${JSON.stringify({ ...appearance, enabledCssSnippets }, null, 2)}\n`, "utf8");
  return { installed: true, enabled: true };
}
