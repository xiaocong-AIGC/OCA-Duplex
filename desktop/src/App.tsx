import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Archive, BookOpen, Bot, Check, ChevronRight, CircleGauge,
  FileOutput, Folder, FolderOpen, GitMerge, Languages, Library, ListChecks, LoaderCircle,
  MessageSquareText, MoreHorizontal, Plus, RefreshCw, Search, Settings, ShieldCheck,
  Sparkles, Trash2, Waypoints, X
} from "lucide-react";
import {
  addWorkspace, chooseDirectory, desktopAction, initializeSystem, listThreads, loadOverview,
  previewSync, removeWorkspace, resetHistory, reviewKnowledge, setAutoWatch, setCaptureMode, skipSync, switchLayoutLanguage, writeSync
} from "./api";
import { getCopy, type AppLocale, type Copy } from "./i18n";
import type { ArtifactRecord, OverviewData, ProjectRecord, ViewId } from "./types";

type ThreadRecord = { id: string; name: string; preview: string; cwd: string; updatedAt: string | null };
type ReviewAction = "validate" | "archive" | "supersede";
type ListenerState = "listening" | "scanning" | "paused" | "manual" | "error";
type MonitorEvent = { id: string; at: string; tone: "info" | "success" | "warning"; title: string; detail: string };

function formatDate(value: string | null | undefined, locale: AppLocale) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

function actionableReports(reports: Array<Record<string, any>>) {
  const unique = new Map<string, Record<string, any>>();
  for (const report of reports) {
    const threadId = report.source?.thread_id;
    const turnId = report.source?.turn_id;
    if (!threadId || !turnId || !(report.obsidian_write_plan?.length)) continue;
    unique.set(`${threadId}:${turnId}`, report);
  }
  return [...unique.values()];
}

const nav = [
  ["overview", CircleGauge], ["projects", Folder], ["conversations", MessageSquareText],
  ["summaries", BookOpen], ["knowledge", Library], ["activity", Activity], ["settings", Settings]
] as const;

function typeLabel(c: Copy, value: string) {
  return c.types[value as keyof typeof c.types] ?? value;
}

function Status({ value, c }: { value: string; c: Copy }) {
  const label = c.statuses[value as keyof typeof c.statuses] ?? value;
  return <span className={`status status-${value}`}><i />{label}</span>;
}

function Metric({ icon: Icon, label, value, hint, tone = "green" }: { icon: typeof Folder; label: string; value: number; hint: string; tone?: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={23} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>;
}

function Header({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="header-actions">{children}</div></header>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty"><Archive size={30} /><p>{children}</p></div>;
}

function Overview({ data, c, selectProject, sync, syncing, refresh, openSettings, openProjects }: {
  data: OverviewData; c: Copy; selectProject: (p: ProjectRecord) => void; sync: () => void; syncing: boolean;
  refresh: () => Promise<void>; openSettings: () => void; openProjects: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const conflictCount = data.artifacts.filter(item => item.status === "conflict" || item.knowledgeOperation === "conflict").length || data.artifactsByStatus.conflict || 0;
  const userContentTypes = new Set(["source", "conversation", "learning_summary", "knowledge", "prompt", "output", "decision"]);
  const recentWrites = data.activity.filter(item => ["created", "updated", "validated", "archived", "superseded"].includes(item.outcome) && userContentTypes.has(item.artifactType)).slice(0, 6);
  return <>
    <Header title={c.overview.title} subtitle={c.overview.subtitle}>
      <button className="button" onClick={() => desktopAction("open_obsidian")}><FolderOpen size={18} />{c.common.openObsidian}</button>
      <button className="button primary" onClick={sync} disabled={syncing}>{syncing ? <LoaderCircle className="spin" size={18} /> : <RefreshCw size={18} />}{c.common.syncNow}</button>
      <div className="more-actions">
        <button className="icon-button" aria-label={c.common.more} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={20} /></button>
        {menuOpen && <div className="action-menu">
          <button onClick={() => { setMenuOpen(false); refresh(); }}><RefreshCw size={17} />{c.common.refresh}</button>
          <button onClick={() => { setMenuOpen(false); openSettings(); }}><Settings size={17} />{c.common.settings}</button>
          <button onClick={() => { setMenuOpen(false); desktopAction("open_obsidian"); }}><FolderOpen size={17} />{c.common.openObsidian}</button>
        </div>}
      </div>
    </Header>
    <section className="metrics">
      <Metric icon={Folder} label={c.overview.projects} value={data.workspaceMappings.length} hint={`${data.projectsCount} ${c.overview.projectsHint}`} />
      <Metric icon={MessageSquareText} label={c.overview.conversations} value={data.artifactsByType.conversation ?? data.artifactsByType.source ?? 0} hint={c.overview.conversationsHint} tone="blue" />
      <Metric icon={ListChecks} label={c.overview.candidates} value={data.artifactsByStatus.candidate ?? 0} hint={c.overview.candidatesHint} tone="amber" />
      <Metric icon={AlertTriangle} label={c.overview.conflicts} value={conflictCount} hint={conflictCount ? c.overview.conflictsNow : c.overview.noConflicts} tone="red" />
    </section>
    <section className="overview-grid">
      <div className="surface project-table"><div className="section-heading"><div><h2>{c.overview.recentProjects}</h2><p>{c.overview.recentProjectsHint}</p></div><button className="text-button" onClick={openProjects}>{c.overview.viewAll}<ChevronRight size={16} /></button></div>
        <div className="table-scroll"><table><thead><tr><th>{c.overview.projectName}</th><th>{c.overview.sourcePath}</th><th>{c.overview.lastRead}</th><th>{c.overview.content}</th><th>{c.common.status}</th></tr></thead><tbody>
          {data.projects.map(project => <tr key={project.path} onClick={() => selectProject(project)}><td><span className="project-name"><Folder size={18} />{project.name}</span></td><td className="path-cell">{project.sourcePath ?? c.projects.noSource}</td><td>{formatDate(project.updatedAt, data.locale)}</td><td>{project.totalArtifacts}</td><td><Status value={project.status} c={c} /></td></tr>)}
        </tbody></table></div>
      </div>
      <div className="surface activity-panel"><div className="section-heading"><div><h2>{c.overview.recentWrites}</h2><p>{c.overview.recentWritesHint}</p></div></div>
        <div className="activity-list">{recentWrites.length ? recentWrites.map(item => <div className="activity-item" key={item.eventId}><div className={`activity-icon ${item.knowledgeOperation === "conflict" ? "danger" : ""}`}>{item.artifactType === "learning_summary" ? <BookOpen size={18} /> : item.artifactType === "knowledge" ? <Library size={18} /> : <MessageSquareText size={18} />}</div><div><strong>{typeLabel(c, item.artifactType)}</strong><span>{item.target.split("/").slice(-2).join(" / ")}</span></div><time>{formatDate(item.occurredAt, data.locale)}</time></div>) : <Empty>{c.sync.empty}</Empty>}</div>
      </div>
    </section>
  </>;
}

function Projects({ data, c, selectProject, add }: { data: OverviewData; c: Copy; selectProject: (p: ProjectRecord) => void; add: () => void }) {
  return <><Header title={c.projects.title} subtitle={c.projects.subtitle}><button className="button primary" onClick={add}><Plus size={18} />{c.projects.add}</button></Header><div className="project-cards">{data.projects.map(project => <article className="project-card" key={project.path} onClick={() => selectProject(project)}><div className="project-card-top"><div className="folder-tile"><Folder size={23} /></div><Status value={project.status} c={c} /></div><h2>{project.name}</h2><p>{project.sourcePath ?? c.projects.noSource}</p><div className="project-stats"><span><b>{project.counts.sources ?? project.counts.conversations ?? 0}</b>{c.projects.conversation}</span><span><b>{project.counts.summaries ?? 0}</b>{c.projects.summary}</span><span><b>{project.counts.knowledge ?? 0}</b>{c.projects.knowledge}</span><span><b>{project.counts.outputs ?? 0}</b>{c.projects.output}</span></div></article>)}</div></>;
}

function ArtifactPage({ data, c, type, title, subtitle, selectArtifact }: { data: OverviewData; c: Copy; type: string; title: string; subtitle: string; selectArtifact: (a: ArtifactRecord) => void }) {
  const [query, setQuery] = useState("");
  const aliases = type === "conversation" ? ["conversation", "source"] : [type];
  const normalized = query.trim().toLocaleLowerCase();
  const items = data.artifacts.filter(item => aliases.includes(item.type) && (!normalized || `${item.title} ${item.project ?? ""} ${item.path}`.toLocaleLowerCase().includes(normalized)));
  return <><Header title={title} subtitle={subtitle}><label className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`${c.artifacts.search} ${title}`} /></label></Header><div className="surface artifact-list">{items.length ? items.map(item => <button key={item.path} className="artifact-row" onClick={() => selectArtifact(item)}><div className="artifact-symbol">{type === "conversation" ? <MessageSquareText size={20} /> : <BookOpen size={20} />}</div><div><strong>{item.title}</strong><span>{item.project} · {item.path}</span></div><div className="artifact-meta"><Status value={item.status ?? "active"} c={c} /><time>{formatDate(item.updatedAt, data.locale)}</time></div><ChevronRight size={18} /></button>) : <Empty>{c.artifacts.empty} {title}</Empty>}</div></>;
}

function Knowledge({ data, c, selectArtifact }: { data: OverviewData; c: Copy; selectArtifact: (a: ArtifactRecord) => void }) {
  const [filter, setFilter] = useState("all");
  const items = data.artifacts.filter(item => item.type === "knowledge" && (filter === "all" || item.status === filter || item.knowledgeOperation === filter));
  const filters = [["all", c.knowledge.all], ["candidate", c.knowledge.candidate], ["validated", c.knowledge.validated], ["conflict", c.knowledge.conflict], ["superseded", c.knowledge.superseded]];
  return <><Header title={c.knowledge.title} subtitle={c.knowledge.subtitle}><button className="button" onClick={() => setFilter("conflict")}><GitMerge size={18} />{c.knowledge.merge}</button></Header><div className="filter-bar">{filters.map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}<span>{id === "all" ? data.artifactsByType.knowledge ?? 0 : data.artifactsByStatus[id] ?? data.artifacts.filter(a => a.knowledgeOperation === id).length}</span></button>)}</div><div className="surface knowledge-list">{items.length ? items.map(item => <button className="knowledge-row" key={item.path} onClick={() => selectArtifact(item)}><div className={`knowledge-op ${item.knowledgeOperation ?? "add"}`}>{item.knowledgeOperation === "conflict" ? <AlertTriangle size={19} /> : item.knowledgeOperation === "merge" ? <GitMerge size={19} /> : <Sparkles size={19} />}</div><div><strong>{item.title}</strong><span>{item.project} · {c.knowledge.operation}: {item.knowledgeOperation ?? c.knowledge.add}</span></div><Status value={item.status ?? "candidate"} c={c} /><ChevronRight size={18} /></button>) : <Empty>{c.artifacts.empty} {c.knowledge.title}</Empty>}</div></>;
}

function ActivityPage({ data, c }: { data: OverviewData; c: Copy }) {
  function exportActivity() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data.activity, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `oca-duplex-activity-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <><Header title={c.activity.title} subtitle={c.activity.subtitle}><button className="button" onClick={exportActivity}><FileOutput size={18} />{c.activity.export}</button></Header><div className="surface audit-table"><table><thead><tr><th>{c.activity.time}</th><th>{c.activity.operation}</th><th>{c.activity.type}</th><th>{c.activity.target}</th><th>{c.activity.result}</th><th>{c.activity.transaction}</th></tr></thead><tbody>{data.activity.map(item => <tr key={item.eventId}><td>{formatDate(item.occurredAt, data.locale)}</td><td>{item.operation}</td><td>{typeLabel(c, item.artifactType)}</td><td className="path-cell">{item.target}</td><td><Status value={item.outcome} c={c} /></td><td><code>{item.transactionId}</code></td></tr>)}</tbody></table></div></>;
}

function SettingsPage({ data, c, reload }: { data: OverviewData; c: Copy; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState("");
  const [project, setProject] = useState("");
  async function run(action: () => Promise<unknown>) { setBusy(true); setMessage(null); try { await action(); await reload(); } catch (reason) { setMessage(String(reason)); } finally { setBusy(false); } }
  async function language(value: AppLocale) {
    if (value === data.locale) return;
    setBusy(true); setMessage(null);
    try {
      const result: any = await switchLayoutLanguage(value);
      if (result.conflicts?.length) setMessage(data.locale === "en-US" ? `${result.conflicts.length} migration conflicts were found.` : `发现 ${result.conflicts.length} 个目标路径冲突，未执行迁移。`);
      else if (result.applied) await reload();
    } catch (reason) { setMessage(String(reason)); } finally { setBusy(false); }
  }
  async function pick() { const selected = await chooseDirectory(); if (selected) setWorkspacePath(selected); }
  async function add() {
    if (!workspacePath.trim() || !project.trim()) return;
    await run(async () => { await addWorkspace(workspacePath, project); setWorkspacePath(""); setProject(""); });
  }
  async function clearHistory() {
    if (!window.confirm(c.settings.resetConfirm)) return;
    setBusy(true); setMessage(null);
    try {
      const result = await resetHistory();
      setMessage(`${c.settings.resetDone}：${result.deletedCount} / ${result.baselineTurns}`);
      await reload();
    } catch (reason) { setMessage(String(reason)); }
    finally { setBusy(false); }
  }
  return <><Header title={c.settings.title} subtitle={c.settings.subtitle}>{busy && <LoaderCircle className="spin" size={19} />}</Header>{message && <div className="settings-message"><AlertTriangle size={18} /><span>{message}</span></div>}<div className="settings-grid">
    <section className="surface settings-card"><div className="settings-icon"><ShieldCheck /></div><div><h2>{c.settings.modeTitle}</h2><p>{c.settings.modeDescription}</p><div className="segmented"><button className={data.mode === "safe" ? "active" : ""} onClick={() => run(() => setCaptureMode("safe"))}>{c.settings.safe}</button><button className={data.mode === "manual" ? "active" : ""} onClick={() => run(() => setCaptureMode("manual"))}>{c.settings.manual}</button><button className={data.mode === "all" ? "active" : ""} onClick={() => run(() => setCaptureMode("all"))}>{c.settings.all}</button></div><small>{data.mode === "safe" ? c.settings.safeDescription : data.mode === "manual" ? c.settings.manualDescription : c.settings.allDescription}</small></div></section>
    <section className="surface settings-card"><div className="settings-icon"><Languages /></div><div><h2>{c.settings.languageTitle}</h2><p>{c.settings.languageDescription}</p><div className="segmented"><button className={data.locale === "zh-CN" ? "active" : ""} onClick={() => language("zh-CN")}>{c.settings.chinese}</button><button className={data.locale === "en-US" ? "active" : ""} onClick={() => language("en-US")}>{c.settings.english}</button></div></div></section>
    <section className="surface settings-card"><div className="settings-icon"><RefreshCw /></div><div><h2>{c.settings.autoWatchTitle}</h2><p>{c.settings.autoWatchDescription}</p><div className="segmented"><button className={data.autoWatch ? "active" : ""} onClick={() => run(() => setAutoWatch(true))}>{c.settings.autoWatchOn}</button><button className={!data.autoWatch ? "active" : ""} onClick={() => run(() => setAutoWatch(false))}>{c.settings.autoWatchOff}</button></div>{data.mode === "manual" && <small>{c.settings.autoWatchManual}</small>}</div></section>
    <section className="surface settings-card workspace-card"><div className="settings-icon"><Folder /></div><div><h2>{c.settings.workspaceTitle}</h2><p>{c.settings.workspaceDescription}</p><div className="workspace-list">{data.workspaceMappings.length ? data.workspaceMappings.map(item => <div className="workspace-row" key={item.path}><div><strong>{item.project}</strong><code>{item.path}</code></div><button className="danger-button" onClick={() => run(() => removeWorkspace(item.path))}><Trash2 size={16} />{c.common.remove}</button></div>) : <div className="workspace-empty">{c.settings.noWorkspaces}</div>}</div><div className="workspace-add"><label><span>{c.settings.workspacePath}</span><div><input value={workspacePath} onChange={event => setWorkspacePath(event.target.value)} /><button onClick={pick}>{c.common.browse}</button></div></label><label><span>{c.settings.projectName}</span><input value={project} onChange={event => setProject(event.target.value)} placeholder={c.settings.projectPlaceholder} /></label><button className="button primary" disabled={!workspacePath.trim() || !project.trim() || busy} onClick={add}><Plus size={17} />{c.common.add}</button></div></div></section>
    <section className="surface settings-card"><div className={`settings-icon ${data.integration?.available ? "" : "warning"}`}><Bot /></div><div><h2>{c.settings.integrationTitle}</h2><p>{data.integration?.available ? c.settings.integrationReady : c.settings.integrationMissing}</p><div className="integration-status"><Status value={data.integration?.available ? "validated" : "conflict"} c={c} /><div><code>{data.integration?.version ?? data.integration?.detail ?? "codex.exe"}</code><code className="integration-path">{data.integration?.command ?? "codex.exe"}</code></div></div><small>{c.settings.integrationHint}</small></div></section>
    <section className="surface settings-card"><div className="settings-icon"><Waypoints /></div><div><h2>{c.settings.vaultTitle}</h2><p className="settings-path">{data.vaultRoot}</p><small>{c.settings.vaultHint}</small></div></section>
    <section className="surface settings-card danger-zone"><div className="settings-icon warning"><Trash2 /></div><div><h2>{c.settings.resetTitle}</h2><p>{c.settings.resetDescription}</p><button className="button danger" disabled={busy} onClick={clearHistory}><Trash2 size={17}/>{c.settings.resetAction}</button></div></section>
  </div></>;
}

function Inspector({ project, artifact, data, c, reviewing, review, reviewProject }: { project: ProjectRecord | null; artifact: ArtifactRecord | null; data: OverviewData; c: Copy; reviewing: boolean; review: (artifact: ArtifactRecord, action: ReviewAction) => void; reviewProject: () => void }) {
  const title = artifact?.title ?? project?.name ?? c.inspector.title;
  const path = artifact?.path ?? project?.path ?? data.vaultRoot;
  const folders = [c.types.conversation, c.types.learning_summary, c.nav.knowledge, c.types.prompt, c.types.output, c.types.decision, c.nav.activity];
  const canValidate = artifact?.type === "knowledge" && ["candidate", "conflict"].includes(artifact.status ?? "");
  const canArchive = artifact?.type === "knowledge" && ["candidate", "validated", "conflict"].includes(artifact.status ?? "");
  const pendingCount = project ? data.artifacts.filter(item => item.project === project.name && ["candidate", "conflict"].includes(item.status ?? "")).length : 0;
  return <aside className="inspector"><div className="inspector-header"><div className="inspector-mark">{artifact ? <BookOpen size={21} /> : <Bot size={21} />}</div><div><h2>{title}</h2><p>{artifact ? `${c.inspector.artifactInspector} · ${typeLabel(c, artifact.type)}` : project ? c.inspector.projectInspector : c.inspector.title}</p></div><span className="health-dot" /></div><section><label>{c.inspector.targetPath}</label><code>{path}</code></section>{project && <section><label>{c.inspector.sourceWorkspace}</label><code>{project.sourcePath ?? c.projects.noSource}</code></section>}{artifact ? <><section><label>{c.inspector.knowledgeStatus}</label><Status value={artifact.status ?? "active"} c={c} /></section><section><label>{c.inspector.sourceTask}</label><code>{artifact.sourceThreadId ?? c.common.none}</code></section>{artifact.type === "knowledge" && <div className="review-actions">{canValidate && <button className="button primary" disabled={reviewing} onClick={() => review(artifact, "validate")}><Check size={17}/>{c.knowledge.validate}</button>}{canArchive && <button className="button danger" disabled={reviewing} onClick={() => review(artifact, artifact.status === "validated" ? "supersede" : "archive")}><Archive size={17}/>{artifact.status === "validated" ? c.knowledge.markSuperseded : c.knowledge.archive}</button>}</div>}</> : <><section><label>{c.inspector.vaultStructure}</label><div className="folder-tree"><b><Folder size={17} />{project?.name ?? c.inspector.project}</b>{folders.map(item => <span key={item}>{item}</span>)}</div></section>{pendingCount > 0 && <button className="button review-project" onClick={reviewProject}><ListChecks size={17}/>{pendingCount} · {c.knowledge.reviewProject}</button>}</>}<section><label>{c.inspector.recentTransaction}</label><code>{data.activity[0]?.transactionId ?? c.common.none} · {c.statuses.completed}</code></section><button className="button primary inspector-action" onClick={() => desktopAction("open_artifact", { path })}><FolderOpen size={18} />{c.inspector.open}</button></aside>;
}

function SetupWizard({ complete }: { complete: () => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [vaultRoot, setVaultRoot] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [project, setProject] = useState("");
  const [locale, setLocale] = useState<AppLocale>("zh-CN");
  const [mode, setMode] = useState<"safe" | "manual" | "all">("safe");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const c = getCopy(locale);
  async function pick(setter: (value: string) => void) { const selected = await chooseDirectory(); if (selected) setter(selected); }
  async function finish() { setBusy(true); setMessage(null); try { const workspaces = workspacePath && project ? [{ path: workspacePath, project }] : []; await initializeSystem({ vaultRoot, locale, mode, workspaces }); await complete(); } catch (reason) { setMessage(String(reason)); setBusy(false); } }
  const modes = [["safe", c.settings.safe, c.settings.safeDescription], ["manual", c.settings.manual, c.settings.manualDescription], ["all", c.settings.all, c.settings.allDescription]] as const;
  return <div className="setup-shell"><div className="setup-brand"><div className="brand-mark"><Waypoints size={21} /></div><strong>OCA-Duplex</strong></div><div className="setup-card"><div className="setup-progress"><span className={step >= 1 ? "active" : ""}>1</span><i/><span className={step >= 2 ? "active" : ""}>2</span><i/><span className={step >= 3 ? "active" : ""}>3</span></div>
    {step === 1 && <><div className="setup-icon"><FolderOpen /></div><h1>{c.setup.vaultTitle}</h1><p>{c.setup.vaultDescription}</p><label className="path-input"><input value={vaultRoot} onChange={event => setVaultRoot(event.target.value)} placeholder={c.setup.vaultPlaceholder}/><button onClick={() => pick(setVaultRoot)}>{c.common.browse}</button></label><button className="button primary setup-next" disabled={!vaultRoot} onClick={() => setStep(2)}>{c.common.continue}<ChevronRight size={18}/></button></>}
    {step === 2 && <><div className="setup-icon"><Languages /></div><h1>{c.setup.languageTitle}</h1><p>{c.setup.languageDescription}</p><div className="choice-grid"><button className={locale === "zh-CN" ? "active" : ""} onClick={() => setLocale("zh-CN")}><b>{c.settings.chinese}</b><span>{c.setup.chineseLayout}</span></button><button className={locale === "en-US" ? "active" : ""} onClick={() => setLocale("en-US")}><b>{c.settings.english}</b><span>{c.setup.englishLayout}</span></button></div><div className="setup-actions"><button className="button" onClick={() => setStep(1)}>{c.common.back}</button><button className="button primary" onClick={() => setStep(3)}>{c.common.continue}<ChevronRight size={18}/></button></div></>}
    {step === 3 && <><div className="setup-icon"><ShieldCheck /></div><h1>{c.setup.scopeTitle}</h1><p>{c.setup.scopeDescription}</p><div className="mode-choices">{modes.map(([id, title, desc]) => <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}><span>{mode === id && <Check size={15}/>}</span><div><b>{title}</b><small>{desc}</small></div></button>)}</div>{mode === "safe" && <div className="workspace-fields"><label><span>{c.settings.workspacePath}</span><div><input value={workspacePath} onChange={event => setWorkspacePath(event.target.value)} placeholder={c.settings.workspacePath}/><button onClick={() => pick(setWorkspacePath)}>{c.common.browse}</button></div></label><label><span>{c.settings.projectName}</span><input value={project} onChange={event => setProject(event.target.value)} placeholder={c.settings.projectPlaceholder}/></label></div>}{message && <div className="setup-error">{message}</div>}<div className="setup-actions"><button className="button" onClick={() => setStep(2)}>{c.common.back}</button><button className="button primary" disabled={busy || (mode === "safe" && (!workspacePath || !project))} onClick={finish}>{busy && <LoaderCircle className="spin" size={17}/>} {c.setup.finish}</button></div></>}
  </div><small className="setup-footnote">{c.setup.localFirst}</small></div>;
}

function MonitorPanel({ reports, events, state, lastScanAt, busy, writeOne, writeAll, ignoreOne, c, locale }: {
  reports: Array<Record<string, any>>; events: MonitorEvent[]; state: ListenerState; lastScanAt: string | null; busy: boolean;
  writeOne: (report: Record<string, any>) => void; writeAll: () => void; ignoreOne: (report: Record<string, any>) => void; c: Copy; locale: AppLocale;
}) {
  const stateLabel = state === "scanning" ? c.monitor.scanning : state === "error" ? c.monitor.error : state === "paused" ? c.system.paused : state === "manual" ? c.system.manual : c.monitor.waiting;
  return <aside className="inspector monitor-panel"><div className="monitor-head"><div className={`monitor-signal ${state}`}><Activity size={20}/></div><div><h2>{c.monitor.title}</h2><p>{c.monitor.subtitle}</p></div></div><div className="monitor-live"><span><i className={state}/>{stateLabel}</span>{lastScanAt && <time>{formatDate(lastScanAt, locale)}</time>}</div><section className="monitor-queue"><div className="monitor-section-title"><div><label>{c.monitor.queue}</label><b>{reports.length}</b></div>{reports.length > 1 && <button className="text-button" disabled={busy} onClick={writeAll}>{c.monitor.writeAll}</button>}</div>{reports.length ? reports.map(report => {
    const plans = report.obsidian_write_plan ?? [];
    const key = `${report.source?.thread_id}:${report.source?.turn_id}`;
    const project = report.project_resolution?.project_name ?? c.common.none;
    const needsRouting = Boolean(report.project_resolution?.needs_confirmation);
    return <article className={`pending-turn${needsRouting ? " needs-routing" : ""}`} key={key}><div className="pending-turn-head"><div><strong>{report.source?.thread_name || project}</strong><span>{c.monitor.project}：{project}</span></div>{needsRouting ? <span className="route-warning">{c.monitor.routeNeeded}</span> : <Status value="review" c={c}/>}</div><code className="pending-workspace">{report.source?.workspace_path || c.common.none}</code>{needsRouting && <p className="route-hint">{c.monitor.routeHint}</p>}<p>{report.human_summary?.reason ?? c.monitor.sourceOnly}</p><details><summary>{c.monitor.details} · {plans.length}</summary><div className="pending-plan">{plans.slice(0, 20).map((item: any, index: number) => <div key={`${item.target}-${index}`}><span>{typeLabel(c, item.type)}</span><code>{item.target}</code></div>)}</div></details><div className="pending-actions"><button className="button" disabled={busy} onClick={() => ignoreOne(report)}>{c.monitor.ignore}</button><button className="button primary" disabled={busy} onClick={() => writeOne(report)}>{busy && <LoaderCircle className="spin" size={16}/>} {needsRouting ? c.monitor.writeUnsorted : c.monitor.writeOne}</button></div></article>;
  }) : <div className="monitor-empty"><Check size={24}/><span>{c.sync.empty}</span></div>}</section><section className="monitor-log"><label>{c.nav.activity}</label>{events.length ? events.slice().reverse().map(event => <div className={`monitor-event ${event.tone}`} key={event.id}><i/><div><strong>{event.title}</strong><span>{event.detail}</span></div><time>{formatDate(event.at, locale)}</time></div>) : <div className="monitor-empty compact"><span>{c.monitor.started}</span></div>}</section></aside>;
}

function ThreadPicker({ threads, loading, close, preview, c }: { threads: ThreadRecord[]; loading: boolean; close: () => void; preview: (ids: string[]) => void; c: Copy }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected(value => value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  return <div className="modal-backdrop"><section className="thread-modal"><div className="modal-heading"><div><h2>{c.picker.title}</h2><p>{c.picker.subtitle}</p></div><button className="icon-button" onClick={close}><X size={19}/></button></div><div className="thread-list">{loading ? <div className="thread-loading"><LoaderCircle className="spin" />{c.picker.loading}</div> : threads.length ? threads.map(thread => <button key={thread.id} className={selected.includes(thread.id) ? "selected" : ""} onClick={() => toggle(thread.id)}><span className="thread-check">{selected.includes(thread.id) && <Check size={15}/>}</span><div><strong>{thread.name || thread.preview || thread.id}</strong><code>{thread.cwd || thread.id}</code></div></button>) : <Empty>{c.picker.empty}</Empty>}</div><div className="modal-actions"><button className="button" onClick={close}>{c.common.cancel}</button><button className="button primary" disabled={loading || selected.length === 0} onClick={() => preview(selected)}>{c.picker.preview}</button></div></section></div>;
}

function Notice({ tone, title, message, close }: { tone: "success" | "info"; title: string; message: string; close: () => void }) {
  return <div className={`toast-notice ${tone}`}><Check size={19}/><div><b>{title}</b><span>{message}</span></div><button onClick={close}><X size={17}/></button></div>;
}

export default function App() {
  const [view, setView] = useState<ViewId>("overview");
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactRecord | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [syncReports, setSyncReports] = useState<Array<Record<string, any>>>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [threadPicker, setThreadPicker] = useState(false);
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "info"; title: string; message: string } | null>(null);
  const [listenerState, setListenerState] = useState<ListenerState>("paused");
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [monitorEvents, setMonitorEvents] = useState<MonitorEvent[]>([]);
  const pendingRef = useRef<Array<Record<string, any>>>([]);
  const scanBusyRef = useRef(false);
  const operationBusyRef = useRef(false);
  const listenerStartedRef = useRef(false);
  function addMonitorEvent(tone: MonitorEvent["tone"], title: string, detail: string) {
    setMonitorEvents(current => [...current, { id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), tone, title, detail }].slice(-30));
  }
  function replaceQueue(next: Array<Record<string, any>>) {
    pendingRef.current = next;
    setSyncReports(next);
  }
  function mergeQueue(incoming: Array<Record<string, any>>) {
    const current = new Map(pendingRef.current.map(report => [`${report.source?.thread_id}:${report.source?.turn_id}`, report]));
    let added = 0;
    for (const report of actionableReports(incoming)) {
      const key = `${report.source?.thread_id}:${report.source?.turn_id}`;
      if (!current.has(key)) added += 1;
      current.set(key, report);
    }
    replaceQueue([...current.values()]);
    return added;
  }
  async function reload() { setError(null); try { const result = await loadOverview(); setData(result); setSelectedProject(current => current ? result.projects.find(item => item.path === current.path) ?? null : result.projects[0] ?? null); setSelectedArtifact(current => current ? result.artifacts.find(item => item.path === current.path) ?? null : null); setNeedsSetup(false); } catch (reason) { const text = String(reason); if (/config|配置|Vault|找不到/i.test(text)) setNeedsSetup(true); else setError(text); } }
  useEffect(() => { reload(); }, []);
  const locale = data?.locale ?? "zh-CN";
  const c = getCopy(locale);
  const systemLabel = useMemo(() => data?.mode === "safe" ? c.settings.safe : data?.mode === "manual" ? c.settings.manual : c.settings.all, [data?.mode, c]);
  useEffect(() => {
    if (!data) return;
    if (data.mode === "manual") { setListenerState("manual"); return; }
    if (!data.autoWatch || !data.integration?.available) { setListenerState("paused"); return; }
    let disposed = false;
    async function scan() {
      if (scanBusyRef.current || operationBusyRef.current) return;
      scanBusyRef.current = true;
      setListenerState("scanning");
      try {
        const result = await previewSync();
        if (disposed) return;
        setLastScanAt(new Date().toISOString());
        const added = mergeQueue(result.reports);
        if (added > 0) {
          addMonitorEvent("info", c.monitor.detected, `${added} ${c.sync.tasks}`);
        }
        setListenerState("listening");
      } catch (reason) {
        if (!disposed) {
          setListenerState("error");
          addMonitorEvent("warning", c.monitor.error, String(reason));
        }
      } finally {
        scanBusyRef.current = false;
      }
    }
    if (!listenerStartedRef.current) {
      listenerStartedRef.current = true;
      addMonitorEvent("success", c.monitor.started, c.monitor.subtitle);
    }
    setListenerState("listening");
    void scan();
    const timer = window.setInterval(scan, Math.max(5000, data.pollIntervalMs ?? 10000));
    return () => { disposed = true; window.clearInterval(timer); };
  }, [data?.mode, data?.autoWatch, data?.pollIntervalMs, data?.integration?.available, c]);
  async function runPreview(ids: string[] = []) { setSyncing(true); setSyncError(null); setNotice(null); try { const result = await previewSync(ids); const added = mergeQueue(result.reports); setThreadPicker(false); setLastScanAt(new Date().toISOString()); if (added > 0) { addMonitorEvent("info", c.monitor.detected, `${added} ${c.sync.tasks}`); setNotice({ tone: "info", title: c.monitor.detected, message: c.sync.autoFound }); } else { setNotice({ tone: "info", title: c.common.syncNow, message: c.sync.noNew }); } } catch (reason) { setSyncError(String(reason)); } finally { setSyncing(false); } }
  async function sync() {
    if (data?.mode !== "manual") return runPreview();
    setThreadPicker(true); setThreadsLoading(true); setSyncError(null);
    try { setThreads(await listThreads()); } catch (reason) { setThreadPicker(false); setSyncError(String(reason)); } finally { setThreadsLoading(false); }
  }
  async function processQueue(reports: Array<Record<string, any>>, action: "write" | "ignore") {
    if (!reports.length) return;
    setSyncing(true); operationBusyRef.current = true; setSyncError(null);
    const keys = new Set(reports.map(report => `${report.source?.thread_id}:${report.source?.turn_id}`));
    const ids = [...new Set(reports.map(report => report.source?.thread_id).filter(Boolean))] as string[];
    const turnIds = [...new Set(reports.map(report => report.source?.turn_id).filter(Boolean))] as string[];
    try {
      if (action === "ignore") {
        await skipSync(ids, turnIds);
        replaceQueue(pendingRef.current.filter(report => !keys.has(`${report.source?.thread_id}:${report.source?.turn_id}`)));
        addMonitorEvent("info", c.monitor.ignored, `${reports.length} ${c.sync.tasks}`);
      } else {
        const result = await writeSync(ids, turnIds);
        const changed = result.reports.flatMap(report => (report as any).write_results ?? []).filter((item: any) => ["created", "updated"].includes(item.outcome)).length;
        replaceQueue(pendingRef.current.filter(report => !keys.has(`${report.source?.thread_id}:${report.source?.turn_id}`)));
        addMonitorEvent("success", c.monitor.wrote, `${changed} ${c.sync.changedFiles}`);
        setNotice({ tone: "success", title: c.sync.success, message: `${c.sync.successDetail} ${changed} ${c.sync.changedFiles}` });
        await reload();
      }
    } catch (reason) { setSyncError(String(reason)); addMonitorEvent("warning", c.monitor.error, String(reason)); }
    finally { operationBusyRef.current = false; setSyncing(false); }
  }
  async function confirmSync(reports = pendingRef.current) { await processQueue(reports, "write"); }
  async function ignoreSync(report: Record<string, any>) { await processQueue([report], "ignore"); }
  async function reviewArtifact(artifact: ArtifactRecord, action: ReviewAction) {
    if (action !== "validate" && !window.confirm(action === "archive" ? c.knowledge.archive : c.knowledge.markSuperseded)) return;
    setReviewing(true); setSyncError(null);
    try { await reviewKnowledge(artifact.path, action, artifact.updatedAt); await reload(); setNotice({ tone: "success", title: c.knowledge.reviewed, message: artifact.title }); }
    catch (reason) { setSyncError(String(reason)); }
    finally { setReviewing(false); }
  }
  if (error) return <div className="fatal"><AlertTriangle /><h1>{c.fatal}</h1><p>{error}</p></div>;
  if (needsSetup) return <SetupWizard complete={reload} />;
  if (!data) return <div className="loading"><LoaderCircle className="spin" /><span>{c.loading}</span></div>;
  const openSettings = () => setView("settings");
  const listenerLabel = listenerState === "scanning" ? c.system.scanning : listenerState === "listening" ? c.system.listening : listenerState === "manual" ? c.system.manual : listenerState === "error" ? c.system.attention : c.system.paused;
  const scopeLabel = data.mode === "all" ? c.system.scopeAll : data.mode === "manual" ? c.system.scopeManual : `${data.workspaceMappings.length} ${c.system.authorized}`;
  return <><div className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><Waypoints size={21} /></div><div><strong>OCA-Duplex</strong><span>{c.brand}</span></div></div><nav>{nav.map(([id, Icon]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={20} /><span>{c.nav[id]}</span>{id === "knowledge" && (data.artifactsByStatus.candidate ?? 0) > 0 && <em>{data.artifactsByStatus.candidate}</em>}</button>)}</nav><div className="system-card"><div><ShieldCheck size={19} /><span>{systemLabel}</span></div><strong><i className={listenerState === "error" ? "error" : listenerState === "paused" || listenerState === "manual" ? "paused" : ""}/>{listenerLabel}</strong><small>{scopeLabel}</small>{lastScanAt && <small>{c.system.lastScan}：{formatDate(lastScanAt, locale)}</small>}<small className={data.integration?.available ? "integration-ok" : "integration-warning"}>{data.integration?.available ? c.system.ready : c.system.attention}</small></div></aside><main className="content">
    {view === "overview" && <Overview data={data} c={c} selectProject={project => { setSelectedProject(project); setSelectedArtifact(null); }} sync={sync} syncing={syncing} refresh={reload} openSettings={openSettings} openProjects={() => setView("projects")} />}
    {view === "projects" && <Projects data={data} c={c} selectProject={project => { setSelectedProject(project); setSelectedArtifact(null); }} add={openSettings} />}
    {view === "conversations" && <ArtifactPage data={data} c={c} type="conversation" title={c.artifacts.conversationsTitle} subtitle={c.artifacts.conversationsSubtitle} selectArtifact={artifact => { setSelectedArtifact(artifact); setSelectedProject(null); }} />}
    {view === "summaries" && <ArtifactPage data={data} c={c} type="learning_summary" title={c.artifacts.summariesTitle} subtitle={c.artifacts.summariesSubtitle} selectArtifact={artifact => { setSelectedArtifact(artifact); setSelectedProject(null); }} />}
    {view === "knowledge" && <Knowledge data={data} c={c} selectArtifact={artifact => { setSelectedArtifact(artifact); setSelectedProject(null); }} />}
    {view === "activity" && <ActivityPage data={data} c={c} />}
    {view === "settings" && <SettingsPage data={data} c={c} reload={reload} />}
  </main>{view === "overview" ? <MonitorPanel reports={syncReports} events={monitorEvents} state={listenerState} lastScanAt={lastScanAt} busy={syncing} writeOne={report => confirmSync([report])} writeAll={() => confirmSync()} ignoreOne={ignoreSync} c={c} locale={locale}/> : <Inspector project={selectedProject} artifact={selectedArtifact} data={data} c={c} reviewing={reviewing} review={reviewArtifact} reviewProject={() => setView("knowledge")} />}</div>
  {threadPicker && <ThreadPicker threads={threads} loading={threadsLoading} close={() => setThreadPicker(false)} preview={runPreview} c={c} />}
  {notice && <Notice {...notice} close={() => setNotice(null)} />}
  {syncError && <div className="toast-error"><AlertTriangle size={19}/><div><b>{c.sync.failed}</b><span>{syncError}</span></div><button onClick={() => setSyncError(null)}><X size={17}/></button></div>}</>;
}
