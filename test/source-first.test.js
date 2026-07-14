import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeTurn } from "../core/capture.js";
import { parseConversation } from "../core/parser.js";
import { classifyUnits } from "../core/classifier.js";
import { buildHumanSummary } from "../core/human-summary.js";
import { sanitizeFilename, semanticTags } from "../core/quality.js";
import { buildWritePlan, executeWritePlan, renderKnowledgeBody, renderOutputBody } from "../core/writer.js";

function makeConfig(vaultRoot) {
  return {
    vaultRoot,
    capture: { includeToolResults: true, completedTurnsOnly: true },
    classification: {
      minimumWriteConfidence: 0.72,
      paths: { inbox: "00_收件箱", knowledge: "30_知识库", prompt: "50_提示词", project: "10_项目", source: "30_来源" }
    },
    linking: { minimumSharedTokens: 2, maximumLinksPerNote: 3 },
    write: { maxDerivedNotesPerTurn: 3, conversationSourceFolder: "30_来源/Codex Conversations", commitMessage: "test" },
    projectRouting: { root: "10_项目", unsorted: "00_收件箱/未归类Codex捕获", minimumConfidence: 0.75 },
    dashboard: { path: "90_系统/oca-duplex/系统看板.md" },
    ocaVersion: "0.3.0",
    state: { path: "90_System/OCA-Duplex/runtime-state.json" }
  };
}

function makeSnapshot({ turnId = "turn-0001", userText, answerText }) {
  return normalizeTurn(
    {
      id: "thread-source-first",
      preview: "使用 Codex 优化 Obsidian Vault 自动知识库",
      createdAt: 1700000000,
      cwd: "D:\\ObsidianVault",
      source: "vscode"
    },
    {
      id: turnId,
      status: "completed",
      startedAt: 1700000000,
      completedAt: 1700000060,
      itemsView: "full",
      items: [
        { id: `${turnId}-user`, type: "userMessage", content: [{ type: "text", text: userText }] },
        { id: `${turnId}-answer`, type: "agentMessage", phase: "final_answer", text: answerText }
      ]
    },
    { includeToolResults: true }
  );
}

const PROJECT_REQUEST = `
请把 Codex 与 Obsidian Vault 的知识整理工作建设成一个可执行项目。项目需要保留完整来源，定义明确目标、交付内容、验收标准、回滚方式和下一步任务，并确保每轮只处理有限数量的会话。所有写入都必须先经过 dry-run 审核，确认后才能创建总结笔记和提交 Git，从而形成可持续维护的自动知识库。
`;

const HIGH_QUALITY_ANSWER = `
# 当前状态
只有欢迎页，没有既有分类体系。
RealClaudian 已启用 Codex。
Vault 已初始化 Git，但没有远程仓库。

# 目录结构
├─ AGENTS.md
├─ 00_收件箱/
│  └─ 示例.md
└─ 30_知识库/
D:\\ObsidianVault

# 项目实施与验收
这个项目以稳定运行的知识整理链路为交付目标，需要依次完成真实会话采集、Source 原文保存、分类计划生成、人工审核、安全写入和 Git 回滚验证。每个阶段都要定义输入、输出、失败处理与验收证据；任何不满足质量门槛的内容都只留在 Source，不得创建独立笔记。完成标准是连续多轮运行都只产生少量稳定结果，并且能够追踪每个结果来自哪个线程与 Turn。

# 方法与流程总结
可复用的方法采用 source-first 流程：首先完整保存可见对话，然后按整段内容识别方法、规则、流程和架构，再把相关段落聚合成独立总结。提炼阶段必须排除目录树、文件路径、代码边框、工具错误和环境状态，并使用长度门槛与复用价值门槛共同审核。最后只为通过门槛的内容生成目标路径，通过语义主题建立少量链接，避免为了图谱结构制造无意义关系。

# Prompt 与 Skill 规则
Prompt 和 Skill 应共享固定执行规则：输入必须说明允许读取的会话范围，输出必须包含 Source 记录、总结计划和审核摘要，写入前必须展示 dry-run，低置信度项目必须进入人工复核。规则还要限制单轮最多三篇提炼笔记，禁止覆盖已有知识文件，禁止把工具失败日志当作知识，并要求 Git 只暂存本轮实际影响的文件，以便每次自动处理都可以审计和回滚。
`;

test("directory trees, paths, headings, and environment status do not become knowledge units", () => {
  const snapshot = makeSnapshot({
    userText: "请检查当前环境。",
    answerText: "# 目录结构\n├─ AGENTS.md\n├─ 00_收件箱/\nD:\\ObsidianVault\n\n只有欢迎页，没有既有分类体系。\nRealClaudian 已启用 Codex。\nVault 已初始化 Git，但没有远程仓库。"
  });
  const parsed = parseConversation(snapshot);
  assert.equal(parsed.knowledge_units.length, 0);
  assert.ok(parsed.extraction_stats.skipped_fragments >= 5);
});

test("source-first extraction creates a thread learning summary plus output when warranted", () => {
  const snapshot = makeSnapshot({ userText: PROJECT_REQUEST, answerText: HIGH_QUALITY_ANSWER });
  const parsed = parseConversation(snapshot);
  const units = classifyUnits(parsed.knowledge_units, makeConfig("D:\\ObsidianVault"));
  assert.ok(units.length >= 1 && units.length <= 5);
  assert.ok(units.some((unit) => unit.type === "learning_summary"));
  assert.equal(new Set(units.map((unit) => unit.type)).size, units.length);
  assert.ok(units.every((unit) => unit.quality_gate_passed));
  assert.doesNotMatch(JSON.stringify(units), /├|D:\\\\ObsidianVault|只有欢迎页|RealClaudian 已启用/);
  assert.ok(units.every((unit) => !unit.tags.some((tag) => /^[\p{Script=Han}]{2}$/u.test(tag) && !["知识管理", "项目管理"].includes(tag))));
});

test("project-first write plan contains Source plus prioritized derived content", () => {
  const snapshot = makeSnapshot({ userText: PROJECT_REQUEST, answerText: HIGH_QUALITY_ANSWER });
  const parsed = parseConversation(snapshot);
  const config = makeConfig("D:\\ObsidianVault");
  const units = classifyUnits(parsed.knowledge_units, config);
  const plan = buildWritePlan({
    snapshot,
    title: parsed.title,
    units,
    linkSets: units.map((unit) => ({ unit_id: unit.unit_id, links: [] })),
    projectResolution: {
      project_name: "OCA-Duplex",
      project_slug: "oca-duplex",
      confidence: 0.96,
      reason: "explicit project",
      source: "thread_title"
    },
    config
  });
  assert.equal(plan.filter((entry) => entry.type === "source").length, 1);
  assert.ok(plan.some((entry) => entry.type === "learning_summary"));
  assert.ok(plan.filter((entry) => ["learning_summary", "output", "project", "knowledge", "prompt"].includes(entry.type)).length <= 5);
  assert.equal(plan.filter((entry) => entry.type === "project_home").length, 0);
  assert.equal(plan.filter((entry) => entry.type === "project_index").length, 0);
  assert.equal(plan.filter((entry) => entry.type === "dashboard").length, 0);
  assert.match(plan.find((entry) => entry.type === "source").target, /^10_项目\/OCA-Duplex\/01_原始记录\/\d{4}-\d{2}-\d{2}-.+-thread-s\.md$/);
  const summary = buildHumanSummary(snapshot, parsed, plan);
  assert.equal(summary.source_notes_to_create, 1);
  assert.equal(summary.captured_messages, 2);
  assert.ok(summary.skipped_fragments > 0);
});

test("Source plan is retained even when no derived unit passes quality gates", () => {
  const snapshot = makeSnapshot({ userText: "检查环境。", answerText: "当前 Vault 为空。" });
  const parsed = parseConversation(snapshot);
  const plan = buildWritePlan({ snapshot, title: parsed.title, units: [], linkSets: [], config: makeConfig("D:\\ObsidianVault") });
  assert.equal(plan.filter((entry) => entry.type === "source").length, 1);
  assert.equal(plan.filter((entry) => ["knowledge", "prompt", "project"].includes(entry.type)).length, 0);
  assert.match(plan.find((entry) => entry.type === "source").target, /^00_收件箱\/未归类Codex捕获\//);
  assert.equal(plan.filter((entry) => entry.type === "project_index").length, 0);
  assert.equal(plan.filter((entry) => entry.type === "dashboard").length, 0);
});

test("legacy Markdown maintenance files are available only by explicit opt-in", () => {
  const snapshot = makeSnapshot({ userText: PROJECT_REQUEST, answerText: HIGH_QUALITY_ANSWER });
  const parsed = parseConversation(snapshot);
  const config = makeConfig("D:\\ObsidianVault");
  config.write.generateProjectHome = true;
  config.write.generateMaintenanceFiles = true;
  const units = classifyUnits(parsed.knowledge_units, config);
  const plan = buildWritePlan({ snapshot, title: parsed.title, units, linkSets: [], projectResolution: { project_name: "OCA-Duplex", confidence: 0.96, source: "thread_title" }, config });
  assert.equal(plan.filter((entry) => entry.type === "project_home").length, 1);
  assert.equal(plan.filter((entry) => entry.type === "project_index").length, 1);
  assert.equal(plan.filter((entry) => entry.type === "dashboard").length, 1);
});

test("filename sanitizer removes Windows, Markdown, backtick, and tree characters", () => {
  const filename = sanitizeFilename("├─ 当前 Vault `D:\\ObsidianVault` 基本是空白起点：*规则*?.md");
  assert.doesNotMatch(filename, /[<>:"/\\|?*`│├└─#]/);
  assert.ok(Array.from(filename).length <= 30);
});

test("semantic tags use the whitelist instead of Chinese bigram windows", () => {
  const tags = semanticTags("Obsidian Vault 使用 Codex 和 Git 管理 Inbox Prompt、Skill 与自动知识库项目");
  assert.deepEqual(tags, ["obsidian", "codex", "自动知识库", "vault", "git", "skill", "知识管理", "inbox", "prompt"]);
  assert.ok(!tags.includes("有欢") && !tags.includes("据层") && !tags.includes("录结"));
});

test("knowledge and output renderers do not invent generic filler", () => {
  const resolution = { project_name: "测试项目", project_slug: "test" };
  const source = "项目/测试项目/原始对话/source.md";
  const knowledge = renderKnowledgeBody({ title: "迁移规则", text: "切换目录语言前必须检查目标路径是否已经存在。" }, resolution, source);
  const output = renderOutputBody({ title: "迁移清单", text: "- 生成迁移预览\n- 检查冲突\n- 用户确认后执行" }, resolution, source);
  assert.doesNotMatch(knowledge, /先明确输入|真实使用后记录反馈|适用场景/);
  assert.doesNotMatch(output, /视觉奇观|账号反馈|爆点/);
  assert.match(output, /生成迁移预览/);
});

test("thread Source appends a new Turn without creating another Source file", async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oca-source-first-"));
  const config = makeConfig(vaultRoot);
  const first = makeSnapshot({ turnId: "turn-0001", userText: "第一轮。", answerText: "当前 Vault 为空。" });
  const second = makeSnapshot({ turnId: "turn-0002", userText: "第二轮。", answerText: "继续检查。" });
  const firstPlan = buildWritePlan({ snapshot: first, title: "测试", units: [], linkSets: [], config });
  const secondPlan = buildWritePlan({ snapshot: second, title: "测试", units: [], linkSets: [], config });
  assert.equal(firstPlan[0].target, secondPlan[0].target);
  assert.equal((await executeWritePlan(firstPlan, config))[0].outcome, "created");
  assert.equal((await executeWritePlan(secondPlan, config))[0].outcome, "updated");
  const content = await fs.readFile(path.join(vaultRoot, firstPlan[0].target), "utf8");
  assert.match(content, /oca-turn:turn-0001/);
  assert.match(content, /oca-turn:turn-0002/);
  await fs.rm(vaultRoot, { recursive: true, force: true });
});

test("one learning summary is updated across turns in the same thread", async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oca-learning-summary-"));
  const config = makeConfig(vaultRoot);
  const resolution = { project_name: "OCA-Duplex", project_slug: "oca-duplex", category: "知识管理", confidence: 0.96, source: "workspace_mapping" };
  const snapshots = [
    makeSnapshot({ turnId: "turn-learn-1", userText: PROJECT_REQUEST, answerText: HIGH_QUALITY_ANSWER }),
    makeSnapshot({ turnId: "turn-learn-2", userText: PROJECT_REQUEST, answerText: `${HIGH_QUALITY_ANSWER}\n新增结论：目录语言必须保持一致，并在切换前检查冲突。` })
  ];
  const plans = snapshots.map((snapshot) => {
    const parsed = parseConversation(snapshot);
    const units = classifyUnits(parsed.knowledge_units, config);
    return buildWritePlan({ snapshot, title: parsed.title, units, linkSets: [], projectResolution: resolution, config });
  });
  const summaries = plans.map((plan) => plan.find((entry) => entry.type === "learning_summary"));
  assert.equal(summaries[0].target, summaries[1].target);
  await executeWritePlan(plans[0], config);
  const secondResults = await executeWritePlan(plans[1], config);
  assert.equal(secondResults.find((entry) => entry.type === "learning_summary").outcome, "updated");
  const content = await fs.readFile(path.join(vaultRoot, summaries[0].target), "utf8");
  assert.match(content, /schema_version: 2/);
  assert.match(content, /oca-learning-turn:turn-learn-1/);
  assert.match(content, /oca-learning-turn:turn-learn-2/);
  await fs.rm(vaultRoot, { recursive: true, force: true });
});
