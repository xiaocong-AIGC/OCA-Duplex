import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Archive, BookOpen, Bot, Check, ChevronRight, CircleGauge,
  FileOutput, Folder, FolderOpen, GitMerge, Languages, Library, ListChecks, LoaderCircle,
  MessageSquareText, MoreHorizontal, Plus, RefreshCw, Search, Settings, ShieldCheck,
  Sparkles, Trash2, Waypoints, X
} from "lucide-react";
import {
  addWorkspace, chooseDirectory, desktopAction, initializeSystem, listThreads, loadOverview,
  previewSync, removeWorkspace, setCaptureMode, switchLayoutLanguage, writeSync
} from "./api";
import { getCopy, type AppLocale, type Copy } from "./i18n";
import type { ArtifactRecord, OverviewData, ProjectRecord, ViewId } from "./types";

type ThreadRecord = { id: string; name: string; preview: string; cwd: string; updatedAt: string | null };

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
      <Metric icon={Folder} label={c.overview.projects} value={data.projectsCount} hint={`${data.workspaceMappings.length} ${c.overview.projectsHint}`} />
      <Metric icon={MessageSquareText} label={c.overview.conversations} value={data.artifactsByType.conversation ?? data.artifactsByType.source ?? 0} hint={c.overview.conversationsHint} tone="blue" />
      <Metric icon={ListChecks} label={c.overview.candidates} value={data.artifactsByStatus.candidate ?? 0} hint={c.overview.candidatesHint} tone="amber" />
      <Metric icon={AlertTriangle} label={c.overview.conflicts} value={conflictCount} hint={conflictCount ? c.overview.conflictsNow : c.overview.noConflicts} tone="red" />
    </section>
    <section className="overview-grid">
      <div className="surface project-table"><div className="section-heading"><div><h2>{c.overview.recentProjects}</h2><p>{c.overview.recentProjectsHint}</p></div><button className="text-button" onClick={openProjects}>{c.overview.viewAll}<ChevronRight size={16} /></button></div>
        <div className="table-scroll"><table><thead><tr><th>{c.overview.projectName}</th><th>{c.overview.sourcePath}</th><th>{c.overview.lastRead}</th><th>{c.overview.content}</th><th>{c.common.status}</th></tr></thead><tbody>
          {data.projects.map(project => <tr key={project.path} onClick={() => selectProject(project)}><td><span className="project-name"><Folder size={18} />{project.name}</span></td><td className="path-cell">{project.sourcePath ?? project.path}</td><td>{project.updatedAt}</td><td>{project.totalArtifacts}</td><td><Status value={project.status} c={c} /></td></tr>)}
        </tbody></table></div>
      </div>
      <div className="surface activity-panel"><div className="section-heading"><div><h2>{c.overview.recentWrites}</h2><p>{c.overview.recentWritesHint}</p></div></div>
        <div className="activity-list">{data.activity.slice(0, 6).map(item => <div className="activity-item" key={item.eventId}><div className={`activity-icon ${item.knowledgeOperation === "conflict" ? "danger" : ""}`}>{item.artifactType === "learning_summary" ? <BookOpen size={18} /> : item.artifactType === "knowledge" ? <Library size={18} /> : <MessageSquareText size={18} />}</div><div><strong>{typeLabel(c, item.artifactType)}</strong><span>{item.target.split("/").slice(-2).join(" / ")}</span></div><time>{item.occurredAt}</time></div>)}</div>
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
  return <><Header title={title} subtitle={subtitle}><label className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`${c.artifacts.search} ${title}`} /></label></Header><div className="surface artifact-list">{items.length ? items.map(item => <button key={item.path} className="artifact-row" onClick={() => selectArtifact(item)}><div className="artifact-symbol">{type === "conversation" ? <MessageSquareText size={20} /> : <BookOpen size={20} />}</div><div><strong>{item.title}</strong><span>{item.project} · {item.path}</span></div><div className="artifact-meta"><Status value={item.status ?? "active"} c={c} /><time>{item.updatedAt}</time></div><ChevronRight size={18} /></button>) : <Empty>{c.artifacts.empty} {title}</Empty>}</div></>;
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
  return <><Header title={c.activity.title} subtitle={c.activity.subtitle}><button className="button" onClick={exportActivity}><FileOutput size={18} />{c.activity.export}</button></Header><div className="surface audit-table"><table><thead><tr><th>{c.activity.time}</th><th>{c.activity.operation}</th><th>{c.activity.type}</th><th>{c.activity.target}</th><th>{c.activity.result}</th><th>{c.activity.transaction}</th></tr></thead><tbody>{data.activity.map(item => <tr key={item.eventId}><td>{item.occurredAt}</td><td>{item.operation}</td><td>{typeLabel(c, item.artifactType)}</td><td className="path-cell">{item.target}</td><td><Status value={item.outcome} c={c} /></td><td><code>{item.transactionId}</code></td></tr>)}</tbody></table></div></>;
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
  return <><Header title={c.settings.title} subtitle={c.settings.subtitle}>{busy && <LoaderCircle className="spin" size={19} />}</Header>{message && <div className="settings-message"><AlertTriangle size={18} /><span>{message}</span></div>}<div className="settings-grid">
    <section className="surface settings-card"><div className="settings-icon"><ShieldCheck /></div><div><h2>{c.settings.modeTitle}</h2><p>{c.settings.modeDescription}</p><div className="segmented"><button className={data.mode === "safe" ? "active" : ""} onClick={() => run(() => setCaptureMode("safe"))}>{c.settings.safe}</button><button className={data.mode === "manual" ? "active" : ""} onClick={() => run(() => setCaptureMode("manual"))}>{c.settings.manual}</button><button className={data.mode === "all" ? "active" : ""} onClick={() => run(() => setCaptureMode("all"))}>{c.settings.all}</button></div><small>{data.mode === "safe" ? c.settings.safeDescription : data.mode === "manual" ? c.settings.manualDescription : c.settings.allDescription}</small></div></section>
    <section className="surface settings-card"><div className="settings-icon"><Languages /></div><div><h2>{c.settings.languageTitle}</h2><p>{c.settings.languageDescription}</p><div className="segmented"><button className={data.locale === "zh-CN" ? "active" : ""} onClick={() => language("zh-CN")}>{c.settings.chinese}</button><button className={data.locale === "en-US" ? "active" : ""} onClick={() => language("en-US")}>{c.settings.english}</button></div></div></section>
    <section className="surface settings-card workspace-card"><div className="settings-icon"><Folder /></div><div><h2>{c.settings.workspaceTitle}</h2><p>{c.settings.workspaceDescription}</p><div className="workspace-list">{data.workspaceMappings.length ? data.workspaceMappings.map(item => <div className="workspace-row" key={item.path}><div><strong>{item.project}</strong><code>{item.path}</code></div><button className="danger-button" onClick={() => run(() => removeWorkspace(item.path))}><Trash2 size={16} />{c.common.remove}</button></div>) : <div className="workspace-empty">{c.settings.noWorkspaces}</div>}</div><div className="workspace-add"><label><span>{c.settings.workspacePath}</span><div><input value={workspacePath} onChange={event => setWorkspacePath(event.target.value)} /><button onClick={pick}>{c.common.browse}</button></div></label><label><span>{c.settings.projectName}</span><input value={project} onChange={event => setProject(event.target.value)} placeholder={c.settings.projectPlaceholder} /></label><button className="button primary" disabled={!workspacePath.trim() || !project.trim() || busy} onClick={add}><Plus size={17} />{c.common.add}</button></div></div></section>
    <section className="surface settings-card"><div className={`settings-icon ${data.integration?.available ? "" : "warning"}`}><Bot /></div><div><h2>{c.settings.integrationTitle}</h2><p>{data.integration?.available ? c.settings.integrationReady : c.settings.integrationMissing}</p><div className="integration-status"><Status value={data.integration?.available ? "validated" : "conflict"} c={c} /><div><code>{data.integration?.version ?? data.integration?.detail ?? "codex.exe"}</code><code className="integration-path">{data.integration?.command ?? "codex.exe"}</code></div></div><small>{c.settings.integrationHint}</small></div></section>
    <section className="surface settings-card"><div className="settings-icon"><Waypoints /></div><div><h2>{c.settings.vaultTitle}</h2><p className="settings-path">{data.vaultRoot}</p><small>{c.settings.vaultHint}</small></div></section>
  </div></>;
}

function Inspector({ project, artifact, data, c }: { project: ProjectRecord | null; artifact: ArtifactRecord | null; data: OverviewData; c: Copy }) {
  const title = artifact?.title ?? project?.name ?? c.inspector.title;
  const path = artifact?.path ?? project?.sourcePath ?? data.vaultRoot;
  const folders = [c.types.conversation, c.types.learning_summary, c.nav.knowledge, c.types.prompt, c.types.output, c.types.decision, c.nav.activity];
  return <aside className="inspector"><div className="inspector-header"><div className="inspector-mark">{artifact ? <BookOpen size={21} /> : <Bot size={21} />}</div><div><h2>{title}</h2><p>{artifact ? `${c.inspector.artifactInspector} · ${typeLabel(c, artifact.type)}` : project ? c.inspector.projectInspector : c.inspector.title}</p></div><span className="health-dot" /></div><section><label>{c.common.path}</label><code>{path}</code></section>{artifact ? <><section><label>{c.inspector.knowledgeStatus}</label><Status value={artifact.status ?? "active"} c={c} /></section><section><label>{c.inspector.sourceTask}</label><code>{artifact.sourceThreadId ?? c.common.none}</code></section></> : <section><label>{c.inspector.vaultStructure}</label><div className="folder-tree"><b><Folder size={17} />{project?.name ?? c.inspector.project}</b>{folders.map(item => <span key={item}>{item}</span>)}</div></section>}<section><label>{c.inspector.recentTransaction}</label><code>{data.activity[0]?.transactionId ?? c.common.none} · {c.statuses.completed}</code></section><button className="button primary inspector-action" onClick={() => desktopAction("open_artifact", { path })}><FolderOpen size={18} />{c.inspector.open}</button></aside>;
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

function SyncReview({ reports, busy, close, confirm, c }: { reports: Array<Record<string, any>>; busy: boolean; close: () => void; confirm: () => void; c: Copy }) {
  const plans = reports.flatMap(report => report.obsidian_write_plan ?? []);
  const threadIds = reports.map(report => report.source?.thread_id).filter(Boolean);
  return <div className="modal-backdrop"><section className="sync-modal"><div className="modal-heading"><div><h2>{c.sync.title}</h2><p>{threadIds.length} {c.sync.tasks} · {plans.length} {c.sync.operations}</p></div><button className="icon-button" onClick={close} aria-label={c.common.close}><X size={19}/></button></div><div className="sync-summary"><div><span>{c.sync.sources}</span><b>{plans.filter(item => item.type === "source").length}</b></div><div><span>{c.sync.summaries}</span><b>{plans.filter(item => item.type === "learning_summary").length}</b></div><div><span>{c.sync.candidates}</span><b>{plans.filter(item => item.type === "knowledge").length}</b></div><div><span>{c.sync.conflicts}</span><b>{plans.filter(item => item.knowledge_operation === "conflict").length}</b></div></div><div className="sync-files">{plans.length ? plans.slice(0, 20).map((item, index) => <div key={`${item.target}-${index}`}><span>{typeLabel(c, item.type)}</span><code>{item.target}</code><em>{item.operation}</em></div>) : <Empty>{c.sync.empty}</Empty>}</div><div className="modal-actions"><button className="button" onClick={close}>{c.common.cancel}</button><button className="button primary" disabled={busy || !plans.length} onClick={confirm}>{busy && <LoaderCircle className="spin" size={17}/>} {c.sync.confirm}</button></div></section></div>;
}

function ThreadPicker({ threads, loading, close, preview, c }: { threads: ThreadRecord[]; loading: boolean; close: () => void; preview: (ids: string[]) => void; c: Copy }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected(value => value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  return <div className="modal-backdrop"><section className="thread-modal"><div className="modal-heading"><div><h2>{c.picker.title}</h2><p>{c.picker.subtitle}</p></div><button className="icon-button" onClick={close}><X size={19}/></button></div><div className="thread-list">{loading ? <div className="thread-loading"><LoaderCircle className="spin" />{c.picker.loading}</div> : threads.length ? threads.map(thread => <button key={thread.id} className={selected.includes(thread.id) ? "selected" : ""} onClick={() => toggle(thread.id)}><span className="thread-check">{selected.includes(thread.id) && <Check size={15}/>}</span><div><strong>{thread.name || thread.preview || thread.id}</strong><code>{thread.cwd || thread.id}</code></div></button>) : <Empty>{c.picker.empty}</Empty>}</div><div className="modal-actions"><button className="button" onClick={close}>{c.common.cancel}</button><button className="button primary" disabled={loading || selected.length === 0} onClick={() => preview(selected)}>{c.picker.preview}</button></div></section></div>;
}

export default function App() {
  const [view, setView] = useState<ViewId>("overview");
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactRecord | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [syncReports, setSyncReports] = useState<Array<Record<string, any>> | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [threadPicker, setThreadPicker] = useState(false);
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  async function reload() { setError(null); try { const result = await loadOverview(); setData(result); setSelectedProject(current => current ? result.projects.find(item => item.path === current.path) ?? null : result.projects[0] ?? null); setNeedsSetup(false); } catch (reason) { const text = String(reason); if (/config|配置|Vault|找不到/i.test(text)) setNeedsSetup(true); else setError(text); } }
  useEffect(() => { reload(); }, []);
  const locale = data?.locale ?? "zh-CN";
  const c = getCopy(locale);
  const systemLabel = useMemo(() => data?.mode === "safe" ? c.settings.safe : data?.mode === "manual" ? c.settings.manual : c.settings.all, [data?.mode, c]);
  async function runPreview(ids: string[] = []) { setSyncing(true); setSyncError(null); try { const result = await previewSync(ids); setThreadPicker(false); setSyncReports(result.reports); } catch (reason) { setSyncError(String(reason)); } finally { setSyncing(false); } }
  async function sync() {
    if (data?.mode !== "manual") return runPreview();
    setThreadPicker(true); setThreadsLoading(true); setSyncError(null);
    try { setThreads(await listThreads()); } catch (reason) { setThreadPicker(false); setSyncError(String(reason)); } finally { setThreadsLoading(false); }
  }
  async function confirmSync() { if (!syncReports) return; setSyncing(true); try { const ids = syncReports.map(report => report.source?.thread_id).filter(Boolean); await writeSync(ids); setSyncReports(null); await reload(); } catch (reason) { setSyncError(String(reason)); } finally { setSyncing(false); } }
  if (error) return <div className="fatal"><AlertTriangle /><h1>{c.fatal}</h1><p>{error}</p></div>;
  if (needsSetup) return <SetupWizard complete={reload} />;
  if (!data) return <div className="loading"><LoaderCircle className="spin" /><span>{c.loading}</span></div>;
  const openSettings = () => setView("settings");
  return <><div className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><Waypoints size={21} /></div><div><strong>OCA-Duplex</strong><span>{c.brand}</span></div></div><nav>{nav.map(([id, Icon]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={20} /><span>{c.nav[id]}</span>{id === "knowledge" && (data.artifactsByStatus.candidate ?? 0) > 0 && <em>{data.artifactsByStatus.candidate}</em>}</button>)}</nav><div className="system-card"><div><ShieldCheck size={19} /><span>{systemLabel}</span></div><strong><i />{c.system.running}</strong><small>{data.workspaceMappings.length} {c.system.authorized}</small><small className={data.integration?.available ? "integration-ok" : "integration-warning"}>{data.integration?.available ? c.system.ready : c.system.attention}</small></div></aside><main className="content">
    {view === "overview" && <Overview data={data} c={c} selectProject={project => { setSelectedProject(project); setSelectedArtifact(null); }} sync={sync} syncing={syncing} refresh={reload} openSettings={openSettings} openProjects={() => setView("projects")} />}
    {view === "projects" && <Projects data={data} c={c} selectProject={project => { setSelectedProject(project); setSelectedArtifact(null); }} add={openSettings} />}
    {view === "conversations" && <ArtifactPage data={data} c={c} type="conversation" title={c.artifacts.conversationsTitle} subtitle={c.artifacts.conversationsSubtitle} selectArtifact={artifact => { setSelectedArtifact(artifact); setSelectedProject(null); }} />}
    {view === "summaries" && <ArtifactPage data={data} c={c} type="learning_summary" title={c.artifacts.summariesTitle} subtitle={c.artifacts.summariesSubtitle} selectArtifact={artifact => { setSelectedArtifact(artifact); setSelectedProject(null); }} />}
    {view === "knowledge" && <Knowledge data={data} c={c} selectArtifact={artifact => { setSelectedArtifact(artifact); setSelectedProject(null); }} />}
    {view === "activity" && <ActivityPage data={data} c={c} />}
    {view === "settings" && <SettingsPage data={data} c={c} reload={reload} />}
  </main><Inspector project={selectedProject} artifact={selectedArtifact} data={data} c={c} /></div>
  {threadPicker && <ThreadPicker threads={threads} loading={threadsLoading} close={() => setThreadPicker(false)} preview={runPreview} c={c} />}
  {syncReports && <SyncReview reports={syncReports} busy={syncing} close={() => setSyncReports(null)} confirm={confirmSync} c={c} />}
  {syncError && <div className="toast-error"><AlertTriangle size={19}/><div><b>{c.sync.failed}</b><span>{syncError}</span></div><button onClick={() => setSyncError(null)}><X size={17}/></button></div>}</>;
}
