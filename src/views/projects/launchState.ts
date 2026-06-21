import type { LaunchRun, LaunchSession, LaunchSessionEvent, LaunchSessionSnapshot, Project } from "../../lib/types/domain";

export function getProjectLaunchStatus(project: Project, _projectLaunchTimes: Record<string, string>, launchRun?: LaunchRun | null) {
  if (launchRun?.projectId === project.id && launchRun.sessions.length) {
    const statuses = launchRun.sessions.map((session) => session.status);
    const activeCount = statuses.filter(isActiveLaunchStatus).length;
    if (activeCount > 0) return activeCount === statuses.length ? "运行中" : "部分运行";
    if (statuses.some((status) => status === "failed")) return "失败";
    if (statuses.every((status) => status === "stopped")) return "已停止";
    if (statuses.every((status) => status === "exited")) return "已结束";
  }
  return enabledLaunchConfigs(project).length ? "可启动" : "未配置";
}
export function isActiveLaunchStatus(status: LaunchSession["status"]) {
  return status === "starting" || status === "running";
}

export function isProjectRunning(projectId: string, launchRuns: Record<string, LaunchRun>) {
  return Boolean(launchRuns[projectId]?.sessions.some((session) => isActiveLaunchStatus(session.status)));
}

export function normalizeLaunchSessionEvent(event: LaunchSessionEvent): LaunchSessionEvent {
  const rawEvent = event as LaunchSessionEvent & {
    event_type?: LaunchSessionEvent["eventType"];
    launch_run_id?: string;
    session_id?: string;
    exit_code?: number;
  };
  const eventType = String(rawEvent.eventType ?? rawEvent.event_type).toLowerCase();
  const stream = rawEvent.stream ? String(rawEvent.stream).toLowerCase() : undefined;
  const status = rawEvent.status ? String(rawEvent.status).toLowerCase() : undefined;

  return {
    launchRunId: rawEvent.launchRunId ?? rawEvent.launch_run_id ?? "",
    sessionId: rawEvent.sessionId ?? rawEvent.session_id ?? "",
    eventType: eventType === "status" ? "status" : "output",
    stream: stream === "stderr" ? "stderr" : stream === "stdout" ? "stdout" : undefined,
    content: rawEvent.content,
    status: isLaunchSessionStatus(status) ? status : undefined,
    exitCode: rawEvent.exitCode ?? rawEvent.exit_code
  };
}

function isLaunchSessionStatus(status: string | undefined): status is LaunchSession["status"] {
  return status === "starting" || status === "running" || status === "exited" || status === "failed" || status === "stopped";
}

export function applyLaunchSessionEvent(current: LaunchRun | null, event: LaunchSessionEvent) {
  if (!current || current.id !== event.launchRunId) return current;
  return {
    ...current,
    sessions: current.sessions.map((session) => {
      if (session.id !== event.sessionId) return session;
      if (event.eventType === "output" && event.stream && typeof event.content === "string") {
        return {
          ...session,
          output: [...session.output, { stream: event.stream, content: event.content }]
        };
      }
      if (event.eventType === "status" && event.status) {
        return {
          ...session,
          status: event.status,
          exitCode: event.exitCode ?? session.exitCode
        };
      }
      return session;
    })
  };
}

export function applyPendingLaunchEvents(launchRun: LaunchRun, pendingEvents: Record<string, LaunchSessionEvent[]>) {
  const events = pendingEvents[launchRun.id] ?? [];
  delete pendingEvents[launchRun.id];
  return events.reduce((current, event) => applyLaunchSessionEvent(current, normalizeLaunchSessionEvent(event)) ?? current, launchRun);
}

export function markLaunchRunStopped(launchRun: LaunchRun, sessionId?: string) {
  return {
    ...launchRun,
    sessions: launchRun.sessions.map((session) => {
      if (sessionId && session.id !== sessionId) return session;
      if (!isActiveLaunchStatus(session.status)) return session;
      return { ...session, status: "stopped" as const };
    })
  };
}

function replaceLaunchSession(launchRun: LaunchRun, nextSession: LaunchSession) {
  return {
    ...launchRun,
    sessions: launchRun.sessions.map((session) => session.id === nextSession.id ? nextSession : session)
  };
}

export function markLaunchSessionStoppedInRuns(launchRuns: Record<string, LaunchRun>, sessionId: string) {
  const entry = Object.entries(launchRuns).find(([, launchRun]) =>
    launchRun.sessions.some((session) => session.id === sessionId)
  );
  if (!entry) return launchRuns;
  const [projectId, launchRun] = entry;
  return {
    ...launchRuns,
    [projectId]: markLaunchRunStopped(launchRun, sessionId)
  };
}

export function markLaunchRunStoppedInRuns(launchRuns: Record<string, LaunchRun>, launchRunId: string) {
  const entry = Object.entries(launchRuns).find(([, launchRun]) => launchRun.id === launchRunId);
  if (!entry) return launchRuns;
  const [projectId, launchRun] = entry;
  return {
    ...launchRuns,
    [projectId]: markLaunchRunStopped(launchRun)
  };
}

export function replaceLaunchSessionInRuns(launchRuns: Record<string, LaunchRun>, nextSession: LaunchSession) {
  const entry = Object.entries(launchRuns).find(([, launchRun]) =>
    launchRun.sessions.some((session) => session.id === nextSession.id)
  );
  if (!entry) return launchRuns;
  const [projectId, launchRun] = entry;
  return {
    ...launchRuns,
    [projectId]: replaceLaunchSession(launchRun, nextSession)
  };
}

export function mergeLaunchRunSnapshotsInRuns(launchRuns: Record<string, LaunchRun>, launchRunId: string, snapshots: LaunchSessionSnapshot[]) {
  const entry = Object.entries(launchRuns).find(([, launchRun]) => launchRun.id === launchRunId);
  if (!entry || snapshots.length === 0) return launchRuns;
  const [projectId, launchRun] = entry;
  return {
    ...launchRuns,
    [projectId]: mergeLaunchRunSnapshots(launchRun, snapshots)
  };
}

export function mergeLaunchRunSnapshots(launchRun: LaunchRun, snapshots: LaunchSessionSnapshot[]) {
  const snapshotsBySessionId = new Map(snapshots.map((snapshot) => [snapshot.sessionId, snapshot]));
  return {
    ...launchRun,
    sessions: launchRun.sessions.map((session) => {
      const snapshot = snapshotsBySessionId.get(session.id);
      if (!snapshot) return session;
      return {
        ...session,
        status: snapshot.status,
        exitCode: snapshot.exitCode,
        output: snapshot.output
      };
    })
  };
}

export function isAlreadyEndedLaunchMessage(message: string) {
  return message.includes("启动会话不存在或已结束") || message.includes("没有可停止的启动会话");
}

export function enabledLaunchConfigs(project: Project) {
  return project.launchConfigs.filter((config) => config.enabled && config.command.trim());
}
