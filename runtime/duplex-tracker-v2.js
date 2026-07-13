import { parseConversation } from "../core/parser.js";
import { classifyUnits } from "../core/classifier.js";
import { buildNoteIndex, flattenCrossSessionLinks, suggestLinks } from "../core/linker.js";
import { buildWritePlan, executeWritePlan, publicWritePlan } from "../core/writer.js";
import { commitRuntimeState, executeGitActions, planGitActions } from "../core/git.js";
import { buildHumanSummary } from "../core/human-summary.js";
import { planKnowledgeOperations } from "../core/knowledge-lifecycle.js";
import { ContextBuffer } from "./context-buffer.js";
import { ProjectResolver } from "./project-resolver.js";

function plannedGitActions(plan, config) {
  const stateFiles = config.state?.commit === false ? [] : [config.state.path];
  const files = [...new Set([...plan.map((entry) => entry.target), ...stateFiles])];
  return [
    { status: "planned", command: "git", args: ["add", "--", ...files], files },
    { status: "planned", command: "git", args: ["commit", "-m", config.write.commitMessage, "--", ...files], files }
  ];
}

export class DuplexTracker {
  constructor(config, mode = { write: false, commit: false }) {
    this.config = config;
    this.mode = mode;
    this.context = new ContextBuffer(config);
    this.projectResolver = new ProjectResolver(config);
    this.noteIndex = null;
  }

  async initialize() {
    await this.context.load();
    await this.projectResolver.initialize();
    this.noteIndex = await buildNoteIndex(this.config);
  }

  selectSnapshots(snapshots, limit = 1) {
    return this.context.select(snapshots, limit);
  }

  async preview(snapshot) {
    const prepared = await this.#prepare(snapshot);
    return this.#report(prepared, {
      execution: { mode: "dry-run", wrote_to_disk: false, committed: false },
      gitActions: (this.mode.commit || this.config.write?.commit === true) ? plannedGitActions(prepared.writePlan, this.config) : [],
      writeResults: []
    });
  }

  async process(snapshot) {
    if (this.mode.write) {
      return this.execute(snapshot, { commit: this.mode.commit, userChoice: null });
    }
    const report = await this.preview(snapshot);
    this.context.mark(snapshot.turn.id);
    return report;
  }

  async execute(snapshot, { commit = true, userChoice = "y" } = {}) {
    const prepared = await this.#prepare(snapshot);
    const writeResults = await executeWritePlan(prepared.writePlan, this.config);
    const writtenFiles = writeResults
      .filter((result) => ["created", "updated"].includes(result.outcome))
      .map((result) => result.target);
    if (prepared.projectResolution.confidence >= (this.config.projectRouting?.minimumConfidence ?? 0.75)) {
      this.projectResolver.registerProject(prepared.projectResolution.project_name);
    }

    if (!commit) {
      this.context.record({
        threadId: snapshot.thread.id,
        turnId: snapshot.turn.id,
        mode: "write",
        files: writtenFiles,
        commitHash: null,
        userChoice
      });
      const stateResult = await this.context.save();
      writeResults.push(stateResult);
      const gitActions = planGitActions(writeResults, this.config).map((action) => ({ ...action, status: "not_executed" }));
      const execution = {
        mode: "write-no-commit",
        wrote_to_disk: writeResults.some((result) => ["created", "updated"].includes(result.outcome)),
        committed: false,
        commit_hash: null
      };
      return this.#report(prepared, { execution, gitActions, writeResults });
    }

    const gitResult = await executeGitActions(writeResults, this.config);
    this.context.record({
      threadId: snapshot.thread.id,
      turnId: snapshot.turn.id,
      mode: "commit",
      files: writtenFiles,
      commitHash: gitResult.commit_hash,
      userChoice
    });
    const stateResult = await this.context.save();
    writeResults.push(stateResult);
    const stateCommit = this.config.state?.commit === false
      ? { committed: false, commit_hash: gitResult.commit_hash, actions: [] }
      : await commitRuntimeState(stateResult, this.config);
    const gitActions = [
      ...(gitResult.actions ?? []).map((action) => ({ ...action, status: "executed" })),
      ...(stateCommit.actions ?? []).map((action) => ({ ...action, status: "executed", purpose: "runtime_state" }))
    ];
    const execution = {
      mode: "write-and-commit",
      wrote_to_disk: true,
      committed: gitResult.committed,
      commit_hash: gitResult.commit_hash,
      state_commit_hash: stateCommit.commit_hash,
      diff_summary: gitResult.diff_summary,
      commit_output: gitResult.commit_output
    };
    return this.#report(prepared, { execution, gitActions, writeResults });
  }

  async skip(snapshot, { userChoice = "n" } = {}) {
    this.context.record({
      threadId: snapshot.thread.id,
      turnId: snapshot.turn.id,
      mode: "skipped",
      files: [],
      commitHash: null,
      userChoice
    });
    const stateResult = await this.context.save();
    const stateCommit = this.config.state?.commit === false
      ? { committed: false, commit_hash: null, actions: [] }
      : await commitRuntimeState(stateResult, this.config);
    return {
      status: "skipped",
      thread_id: snapshot.thread.id,
      turn_id: snapshot.turn.id,
      user_choice: userChoice,
      state_commit_hash: stateCommit.commit_hash
    };
  }

  async #prepare(snapshot) {
    const projectResolution = await this.projectResolver.resolve(snapshot);
    const parsed = parseConversation(snapshot);
    const classifiedUnits = classifyUnits(parsed.knowledge_units, this.config);
    const units = planKnowledgeOperations(classifiedUnits, this.noteIndex);
    const linkSets = suggestLinks(units, this.noteIndex, this.config);
    const writePlan = buildWritePlan({
      snapshot,
      title: parsed.title,
      units,
      linkSets,
      projectResolution,
      config: this.config
    });
    return {
      snapshot,
      projectResolution,
      parsed,
      units,
      linkSets,
      writePlan,
      crossSessionLinks: flattenCrossSessionLinks(linkSets, this.noteIndex),
      humanSummary: buildHumanSummary(snapshot, parsed, writePlan)
    };
  }

  #report(prepared, { execution, gitActions, writeResults }) {
    const { snapshot, projectResolution, parsed, units, linkSets, writePlan, crossSessionLinks, humanSummary } = prepared;
    return {
      project_resolution: projectResolution,
      conversation_nodes: snapshot.conversation_nodes,
      knowledge_units: units.map((unit) => ({
        ...unit,
        recommended_target: writePlan.find((entry) => entry.unit_id === unit.unit_id)?.target ?? unit.recommended_target,
        suggested_links: linkSets.find((set) => set.unit_id === unit.unit_id)?.links ?? []
      })),
      project_updates: parsed.project_updates,
      obsidian_write_plan: publicWritePlan(writePlan),
      git_actions: gitActions,
      cross_session_links: crossSessionLinks,
      execution,
      source: {
        thread_id: snapshot.thread.id,
        turn_id: snapshot.turn.id,
        turn_status: snapshot.turn.status
      },
      write_results: writeResults.map(({ content, append_content, turn_marker, ...result }) => result),
      human_summary: humanSummary
    };
  }
}
