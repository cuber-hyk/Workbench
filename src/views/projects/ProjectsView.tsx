import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Edit3, FileText, FolderOpen, MonitorUp, Pause, Play, Plus, RefreshCcw, Square, Terminal, X } from "lucide-react";
import { ActionGroup, Button, DetailHeader, IconButton, PageHeader, Panel, SearchInput, StatusBadge, TagList, Toolbar } from "../../components/ui";
import { workbenchApi } from "../../lib/api/workbenchApi";
import type { LaunchRun, LaunchSession, Project, ProjectLaunchConfig, ProjectOpenProfile } from "../../lib/types/domain";
import { enabledLaunchConfigs, getProjectLaunchStatus, isActiveLaunchStatus, isProjectRunning } from "./launchState";

export function ProjectsView({
  projects,
  selectedProject,
  projectLaunchTimes,
  launchRuns,
  launchRun,
  projectOpenProfiles = [],
  loading,
  loadError,
  onSelect,
  onOpenWithProfile,
  onLaunch,
  onStopLaunchSession = () => undefined,
  onStopLaunchRun = () => undefined,
  onRestartLaunchSession = () => undefined,
  onSyncLaunchRun = () => undefined,
  onOpenLogUrl = () => undefined,
  onClearLaunchRun = () => undefined,
  onEdit,
  onArchive,
  onAdd
}: {
  projects: Project[];
  selectedProject?: Project;
  projectLaunchTimes: Record<string, string>;
  launchRuns?: Record<string, LaunchRun>;
  launchRun?: LaunchRun | null;
  projectOpenProfiles?: ProjectOpenProfile[];
  loading: boolean;
  loadError: string;
  onSelect: (id: string) => void;
  onOpenWithProfile?: (project: Project, profile: ProjectOpenProfile) => void;
  onLaunch: (project: Project) => void;
  onStopLaunchSession?: (sessionId: string) => void;
  onStopLaunchRun?: (launchRunId: string) => void;
  onRestartLaunchSession?: (session: LaunchSession) => void;
  onSyncLaunchRun?: (launchRunId: string) => void;
  onOpenLogUrl?: (url: string) => void;
  onClearLaunchRun?: (projectId: string) => void;
  onEdit: (project: Project) => void;
  onArchive: (project: Project, archived: boolean) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("全部标签");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [archiveFilter, setArchiveFilter] = useState("活跃项目");
  const [launchLogProjectId, setLaunchLogProjectId] = useState("");
  const tagOptions = useMemo(
    () => ["全部标签", ...Array.from(new Set(projects.flatMap((project) => project.tags)))],
    [projects]
  );
  const currentLaunchRuns = launchRuns ?? (launchRun ? { [launchRun.projectId]: launchRun } : {});
  const launchLogProject = projects.find((project) => project.id === launchLogProjectId);
  const launchLogRun = launchLogProject ? currentLaunchRuns[launchLogProject.id] ?? null : null;
  const selectedProjectRunning = selectedProject ? isProjectRunning(selectedProject.id, currentLaunchRuns) : false;
  const visibleProjects = projects.filter((project) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery
      || project.name.toLowerCase().includes(normalizedQuery)
      || project.path.toLowerCase().includes(normalizedQuery);
    const matchesTag = tagFilter === "全部标签" || project.tags.includes(tagFilter);
    const status = getProjectLaunchStatus(project, projectLaunchTimes, currentLaunchRuns[project.id]);
    const matchesStatus = statusFilter === "全部状态" || status === statusFilter;
    const matchesArchive =
      archiveFilter === "全部项目" ||
      (archiveFilter === "活跃项目" && !project.archived) ||
      (archiveFilter === "已归档" && project.archived);
    return matchesQuery && matchesTag && matchesStatus && matchesArchive;
  });
  const selectedLaunchRun = selectedProject ? currentLaunchRuns[selectedProject.id] ?? null : null;

  if (launchLogProject && launchLogRun) {
    return (
      <LaunchLogDetailPage
        project={launchLogProject}
        launchRun={launchLogRun}
        onBack={() => setLaunchLogProjectId("")}
        onLaunch={onLaunch}
        onStopLaunchSession={onStopLaunchSession}
        onStopLaunchRun={onStopLaunchRun}
        onRestartLaunchSession={onRestartLaunchSession}
        onSyncLaunchRun={onSyncLaunchRun}
        onOpenLogUrl={onOpenLogUrl}
        onClearLaunchRun={() => {
          onClearLaunchRun(launchLogProject.id);
          setLaunchLogProjectId("");
        }}
      />
    );
  }

  return (
    <section className="view">
      <PageHeader title="项目" description="管理本地开发项目并快速启动" actions={<Button variant="primary" onClick={onAdd}><Plus size={15} />添加项目</Button>} />
      <Toolbar>
        <SearchInput placeholder="搜索项目名称或路径" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="按标签筛选项目" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          {tagOptions.map((tag) => <option key={tag}>{tag}</option>)}
        </select>
        <select aria-label="按启动状态筛选项目" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option>全部状态</option>
          <option>可启动</option>
          <option>未配置</option>
          <option>运行中</option>
          <option>部分运行</option>
          <option>已结束</option>
          <option>失败</option>
          <option>已停止</option>
        </select>
        <select aria-label="按归档状态筛选项目" value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value)}>
          <option>活跃项目</option>
          <option>已归档</option>
          <option>全部项目</option>
        </select>
      </Toolbar>
      <div className="split-layout">
        <Panel className="list-panel">
          <div className="table-head projects-grid"><span>项目</span><span>标签</span><span>启动项</span><span>状态</span><span>操作</span></div>
          {loading && (
            <div className="empty-state">
              <strong>正在加载项目</strong>
              <small>正在读取 Workbench 本地数据库。</small>
            </div>
          )}
          {!loading && loadError && (
            <div className="empty-state">
              <strong>项目加载失败</strong>
              <small>{loadError}</small>
            </div>
          )}
          {!loading && !loadError && visibleProjects.map((project) => {
            const projectLaunchRun = currentLaunchRuns[project.id] ?? null;
            const launchStatus = getProjectLaunchStatus(project, projectLaunchTimes, projectLaunchRun);
            const isRunningProject = Boolean(projectLaunchRun?.sessions.some((session) => isActiveLaunchStatus(session.status)));
            return (
              <div
                key={project.id}
                className={`table-row projects-grid ${selectedProject?.id === project.id ? "selected" : ""}`}
                role="group"
                aria-label={`${project.name} 项目`}
                aria-current={selectedProject?.id === project.id ? "true" : undefined}
                tabIndex={0}
                onClick={() => onSelect(project.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(project.id);
                }}
              >
                <span className="title-cell">
                  <strong>{project.name}{project.archived && <i className="archived-inline">已归档</i>}</strong>
                  <small>{project.path}</small>
                </span>
                <TagList tags={project.tags} />
                <span className="command-cell">{formatLaunchConfigSummary(project)}</span>
                <span><StatusBadge tone={projectStatusTone(launchStatus)}>{launchStatus}</StatusBadge></span>
                <ActionGroup className="row-actions">
                  <IconButton
                    title="打开目录"
                    onClick={(event) => {
                      event.stopPropagation();
                      void workbenchApi.openLocalPath(project.path);
                    }}
                  >
                    <FolderOpen size={14} />
                  </IconButton>
                  <ProjectOpenProfileMenu
                    project={project}
                    profiles={projectOpenProfiles}
                    onOpen={onOpenWithProfile ?? (() => undefined)}
                  />
                  <IconButton
                    title={isRunningProject ? "停止项目" : "启动项目"}
                    disabled={enabledLaunchConfigs(project).length === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isRunningProject && projectLaunchRun) {
                        onStopLaunchRun(projectLaunchRun.id);
                      } else {
                        onLaunch(project);
                      }
                    }}
                  >
                    {isRunningProject ? <Pause size={14} /> : <Play size={14} />}
                  </IconButton>
                  <IconButton
                    title="编辑项目"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(project);
                    }}
                  >
                    <Edit3 size={14} />
                  </IconButton>
                  <IconButton
                    title={!project.archived && isRunningProject ? "运行中不可归档" : project.archived ? "恢复项目" : "归档项目"}
                    disabled={!project.archived && isRunningProject}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!project.archived && isRunningProject) return;
                      onArchive(project, !project.archived);
                    }}
                  >
                    {project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </IconButton>
                </ActionGroup>
              </div>
            );
          })}
          {!loading && !loadError && visibleProjects.length === 0 && (
            <div className="empty-state">
              <strong>{projects.length === 0 ? "暂无项目" : "没有匹配的项目"}</strong>
              <small>{projects.length === 0 ? "点击右上角“添加项目”记录本地项目路径和启动配置。" : "调整搜索、标签、启动状态或归档筛选后重试。"}</small>
            </div>
          )}
        </Panel>

        <Panel className="detail-panel">
          {selectedProject ? (
            <>
              <DetailHeader
                title={selectedProject.name}
                description={selectedProject.note}
                actions={
                  <>
                  <IconButton title="编辑" onClick={() => onEdit(selectedProject)}><Edit3 size={15} /></IconButton>
                  <IconButton
                    title={!selectedProject.archived && selectedProjectRunning ? "运行中不可归档" : selectedProject.archived ? "恢复项目" : "归档项目"}
                    disabled={!selectedProject.archived && selectedProjectRunning}
                    onClick={() => {
                      if (!selectedProject.archived && selectedProjectRunning) return;
                      onArchive(selectedProject, !selectedProject.archived);
                    }}
                  >
                    {selectedProject.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </IconButton>
                  </>
                }
              />
              <div className="form-grid">
                <label>项目路径<input value={selectedProject.path} readOnly /></label>
                <label>标签<input value={selectedProject.tags.join(", ")} readOnly /></label>
                <label className="full">备注<textarea rows={4} value={selectedProject.note} readOnly /></label>
              </div>
              <div className="detail-meta-grid">
                <div><small>启动状态</small><strong>{getProjectLaunchStatus(selectedProject, projectLaunchTimes, selectedLaunchRun)}</strong></div>
                <div><small>最近启动</small><strong>{projectLaunchTimes[selectedProject.id] ?? "暂无"}</strong></div>
                <div><small>项目状态</small><strong>{selectedProject.archived ? "已归档" : "活跃"}</strong></div>
                <div><small>启动方式</small><strong>内嵌启动会话</strong></div>
              </div>
              <LaunchItemsPanel
                project={selectedProject}
                launchRun={selectedLaunchRun}
                projectLaunchTime={projectLaunchTimes[selectedProject.id]}
                onLaunch={onLaunch}
                onStopLaunchSession={onStopLaunchSession}
                onStopLaunchRun={onStopLaunchRun}
                onRestartLaunchSession={onRestartLaunchSession}
                onClearLaunchRun={() => onClearLaunchRun(selectedProject.id)}
                onOpenLaunchLogs={() => setLaunchLogProjectId(selectedProject.id)}
              />
              <div className="boundary-note">
                <span className="status-dot" />
                <p>Workbench 只展示本次启动的内存日志；不保存历史日志，再次启动会创建全新的会话组。</p>
              </div>
            </>
          ) : (
            <div className="empty-state detail-empty">
              <strong>还没有项目</strong>
              <small>添加项目后，可以配置启动项并在 Workbench 内查看本次启动输出。</small>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
function ProjectOpenProfileMenu({
  project,
  profiles,
  onOpen
}: {
  project: Project;
  profiles: ProjectOpenProfile[];
  onOpen: (project: Project, profile: ProjectOpenProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const enabledProfiles = profiles.filter((profile) => profile.enabled);
  return (
    <span className="row-menu">
      <IconButton
        title="用工具打开"
        aria-label={`用工具打开 ${project.name}`}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <MonitorUp size={14} />
      </IconButton>
      {open && (
        <span className="row-menu-popover" role="menu" aria-label={`${project.name} 打开方式`}>
          {enabledProfiles.length ? enabledProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onOpen(project, profile);
              }}
            >
              {profile.kind === "terminal" ? <Terminal size={13} /> : <MonitorUp size={13} />}
              <span>{profile.name}</span>
            </button>
          )) : (
            <span className="row-menu-empty">没有启用的打开方式</span>
          )}
        </span>
      )}
    </span>
  );
}

function projectStatusTone(status: string): "neutral" | "accent" | "success" | "danger" {
  if (status === "未配置" || status === "已停止" || status === "已结束") return "neutral";
  if (status === "失败") return "danger";
  if (status === "运行中" || status === "部分运行" || status === "启动中") return "success";
  return "accent";
}

function launchStatusTone(status: LaunchSession["status"]): "neutral" | "accent" | "success" | "danger" {
  if (status === "running" || status === "starting") return "success";
  if (status === "failed") return "danger";
  if (status === "stopped" || status === "exited") return "neutral";
  return "accent";
}

function LaunchItemsPanel({
  project,
  launchRun,
  projectLaunchTime,
  onLaunch,
  onStopLaunchSession,
  onStopLaunchRun,
  onRestartLaunchSession,
  onClearLaunchRun,
  onOpenLaunchLogs
}: {
  project: Project;
  launchRun: LaunchRun | null;
  projectLaunchTime?: string;
  onLaunch: (project: Project) => void;
  onStopLaunchSession: (sessionId: string) => void;
  onStopLaunchRun: (launchRunId: string) => void;
  onRestartLaunchSession: (session: LaunchSession) => void;
  onClearLaunchRun: () => void;
  onOpenLaunchLogs: () => void;
}) {
  const hasRunningSession = Boolean(launchRun?.sessions.some((session) => isActiveLaunchStatus(session.status)));
  const launchSessionsByConfigId = new Map((launchRun?.sessions ?? []).map((session) => [session.configId, session]));
  const launchItems = [
    ...project.launchConfigs.map((config) => ({
      key: config.id,
      name: config.name,
      command: config.command,
      workdir: config.workdir || project.path,
      config,
      session: launchSessionsByConfigId.get(config.id)
    })),
    ...(launchRun?.sessions ?? [])
      .filter((session) => !project.launchConfigs.some((config) => config.id === session.configId))
      .map((session) => ({
        key: session.id,
        name: session.configName,
        command: session.command,
        workdir: session.workdir || project.path,
        config: null,
        session
      }))
  ];
  const enabledCount = enabledLaunchConfigs(project).length;
  const headerSummary = launchRun
    ? `${projectLaunchTime ?? launchRun.startedAt} · ${launchRun.sessions.length} 个启动项`
    : `${enabledCount}/${project.launchConfigs.length} 启动项`;

  return (
    <section className="launch-items-panel" aria-label="启动项">
      <header>
        <span>
          <h3>启动项</h3>
          <small>{headerSummary}</small>
        </span>
        <span className="launch-run-actions">
          {launchRun && <Button onClick={onOpenLaunchLogs}><FileText size={14} />查看日志</Button>}
          {launchRun && hasRunningSession ? (
            <IconButton
              title="停止全部会话"
              onClick={() => onStopLaunchRun(launchRun.id)}
            >
              <Square size={14} />
            </IconButton>
          ) : launchRun ? (
            <>
              <IconButton title="重新启动全部" onClick={() => onLaunch(project)}>
                <RefreshCcw size={14} />
              </IconButton>
              <IconButton title="关闭本次记录" onClick={onClearLaunchRun}>
                <X size={14} />
              </IconButton>
            </>
          ) : (
            enabledCount > 0 && (
              <IconButton title="启动项目" onClick={() => onLaunch(project)}>
                <Play size={14} />
              </IconButton>
            )
          )}
        </span>
      </header>
      <div className="launch-item-list">
        {launchItems.length ? launchItems.map((item) => {
          const session = item.session;
          const sessionStatus = session ? formatLaunchSessionStatus(session) : formatLaunchConfigState(item.config);
          return (
            <article className="launch-item-card" key={item.key}>
              <div className="launch-item-head">
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.workdir}</small>
                </span>
                <span className="launch-session-actions">
                  <StatusBadge tone={session ? launchStatusTone(session.status) : launchConfigTone(item.config)}>{sessionStatus}</StatusBadge>
                </span>
              </div>
              <code>{item.command || "未配置命令"}</code>
              {session && (
                <div className="launch-item-footer">
                  <span className="launch-session-actions">
                    {isActiveLaunchStatus(session.status) ? (
                      <IconButton
                        title="停止会话"
                        onClick={() => onStopLaunchSession(session.id)}
                      >
                        <Square size={14} />
                      </IconButton>
                    ) : (
                      <IconButton
                        title="重新启动此项"
                        onClick={() => onRestartLaunchSession(session)}
                      >
                        <RefreshCcw size={14} />
                      </IconButton>
                    )}
                  </span>
                </div>
              )}
            </article>
          );
        }) : <p className="muted">暂无启动项。</p>}
      </div>
    </section>
  );
}

function launchConfigTone(config: ProjectLaunchConfig | null): "neutral" | "accent" {
  return config?.enabled && config.command.trim() ? "accent" : "neutral";
}

function formatLaunchConfigState(config: ProjectLaunchConfig | null) {
  if (!config) return "已结束";
  if (!config.enabled) return "停用";
  return config.command.trim() ? "可启动" : "未配置";
}

function LaunchLogDetailPage({
  project,
  launchRun,
  onBack,
  onLaunch,
  onStopLaunchSession,
  onStopLaunchRun,
  onRestartLaunchSession,
  onSyncLaunchRun,
  onOpenLogUrl,
  onClearLaunchRun
}: {
  project: Project;
  launchRun: LaunchRun;
  onBack: () => void;
  onLaunch: (project: Project) => void;
  onStopLaunchSession: (sessionId: string) => void;
  onStopLaunchRun: (launchRunId: string) => void;
  onRestartLaunchSession: (session: LaunchSession) => void;
  onSyncLaunchRun: (launchRunId: string) => void;
  onOpenLogUrl: (url: string) => void;
  onClearLaunchRun: () => void;
}) {
  const [activeSessionId, setActiveSessionId] = useState("all");
  const hasRunningSession = launchRun.sessions.some((session) => isActiveLaunchStatus(session.status));
  const activeSession = launchRun.sessions.find((session) => session.id === activeSessionId);
  const visibleLogs = activeSessionId === "all"
    ? combinedLaunchLogs(launchRun.sessions)
    : sessionLaunchLogs(activeSession);

  useEffect(() => {
    onSyncLaunchRun(launchRun.id);
    const timer = window.setInterval(() => onSyncLaunchRun(launchRun.id), 1000);
    return () => window.clearInterval(timer);
  }, [launchRun.id]);

  return (
    <section className="view launch-log-view">
      <div className="launch-log-page-header">
        <div>
          <div className="breadcrumb">项目 / {project.name} / 本次启动日志</div>
          <h1>{project.name} 启动日志</h1>
          <p>{project.path}</p>
        </div>
        <div className="launch-log-actions">
          <Button onClick={onBack}><ArrowLeft size={15} />返回项目列表</Button>
          {hasRunningSession ? (
            <IconButton title="停止全部会话" onClick={() => onStopLaunchRun(launchRun.id)}>
              <Square size={15} />
            </IconButton>
          ) : (
            <>
              <IconButton title="重新启动全部" onClick={() => onLaunch(project)}>
                <RefreshCcw size={15} />
              </IconButton>
              <IconButton title="关闭本次记录" onClick={onClearLaunchRun}>
                <X size={15} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      <div className="launch-log-meta">
        <span><StatusBadge tone={hasRunningSession ? "success" : "neutral"}>{getProjectLaunchStatus(project, {}, launchRun)}</StatusBadge></span>
        <span>{launchRun.startedAt}</span>
        <span>{launchRun.sessions.length} 个启动项</span>
      </div>

      <section className="launch-log-surface" aria-label="启动日志详情">
        <div className="launch-log-tabs">
          <div className="launch-log-tab-list" role="tablist" aria-label="启动项日志">
            <button
              type="button"
              role="tab"
              aria-selected={activeSessionId === "all"}
              className={activeSessionId === "all" ? "active" : ""}
              onClick={() => setActiveSessionId("all")}
            >
              全部
            </button>
            {launchRun.sessions.map((session) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeSessionId === session.id}
                className={activeSessionId === session.id ? "active" : ""}
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
              >
                {session.configName}
              </button>
            ))}
          </div>
          <div className="launch-log-tab-actions">
            {activeSession ? (
              <>
              <StatusBadge tone={launchStatusTone(activeSession.status)}>{formatLaunchSessionStatus(activeSession)}</StatusBadge>
              {isActiveLaunchStatus(activeSession.status) ? (
                <IconButton title="停止会话" onClick={() => onStopLaunchSession(activeSession.id)}>
                  <Square size={14} />
                </IconButton>
              ) : (
                <IconButton title="重新启动此项" onClick={() => onRestartLaunchSession(activeSession)}>
                  <RefreshCcw size={14} />
                </IconButton>
              )}
              </>
            ) : (
              <StatusBadge tone={hasRunningSession ? "success" : "neutral"}>{getProjectLaunchStatus(project, {}, launchRun)}</StatusBadge>
            )}
          </div>
        </div>

        <div className="launch-log-output" role="log" aria-label="启动日志输出">
          {visibleLogs.length
            ? visibleLogs.map((line, index) => (
              <span className={`log-line ${line.stream}`} key={`${line.sessionId}-${index}`}>
                {renderLogLine(line.content, onOpenLogUrl)}
              </span>
            ))
            : <span className="muted-output">等待输出...</span>}
        </div>
      </section>
    </section>
  );
}

function renderLogLine(content: string, onOpenLogUrl: (url: string) => void) {
  const segments = splitLogLineByUrl(content);
  return segments.map((segment, index) => {
    if (segment.kind === "url") {
      return (
        <button
          className="log-link"
          key={`${segment.text}-${index}`}
          type="button"
          aria-label={`打开链接 ${segment.text}`}
          onClick={() => onOpenLogUrl(segment.text)}
        >
          {segment.text}
        </button>
      );
    }
    return <span key={`${segment.text}-${index}`}>{segment.text}</span>;
  });
}

function splitLogLineByUrl(content: string) {
  const urlPattern = /https?:\/\/[^\s)]+[^\s).,;:!?]/g;
  const segments: Array<{ kind: "text" | "url"; text: string }> = [];
  let cursor = 0;
  for (const match of content.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: "text", text: content.slice(cursor, index) });
    }
    segments.push({ kind: "url", text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) {
    segments.push({ kind: "text", text: content.slice(cursor) });
  }
  return segments;
}

function combinedLaunchLogs(sessions: LaunchSession[]) {
  return sessions.flatMap((session) =>
    sessionLaunchLogs(session).map((line) => ({
      ...line,
      content: `[${session.configName}] ${line.content}`
    }))
  );
}

function sessionLaunchLogs(session: LaunchSession | undefined) {
  if (!session) return [];
  return session.output.flatMap((chunk) =>
    chunk.content
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => ({
        sessionId: session.id,
        stream: chunk.stream,
        content: line
      }))
  );
}

function formatLaunchSessionStatus(session: LaunchSession) {
  if (session.status === "exited") return `已退出 ${session.exitCode ?? 0}`;
  if (session.status === "failed") return `失败 ${session.exitCode ?? ""}`.trim();
  if (session.status === "stopped") return "已停止";
  if (session.status === "running") return "运行中";
  return "启动中";
}
function formatLaunchConfigSummary(project: Project) {
  const total = project.launchConfigs.length;
  const enabled = enabledLaunchConfigs(project).length;
  if (total === 0) return <small>未配置</small>;
  return <span>{enabled}/{total} 启动项</span>;
}
