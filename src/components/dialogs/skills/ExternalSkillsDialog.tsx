import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Inbox, RefreshCcw } from "lucide-react";
import { Button, Modal, StatusBadge } from "../../ui";
import type { ExternalSkillCandidateGroup, ExternalSkillSyncAction, ExternalSkillSyncResult, ExternalSkillSyncSelection } from "../../../lib/types/domain";
import { externalCandidateStatusLabel, externalSyncStatusLabel, syncStatusImportClass } from "./skillsImportFormatters";

type SelectionState = Record<string, ExternalSkillSyncAction>;
type SyncTab = "new" | "conflict" | "same" | "invalid";

export function ExternalSkillsDialog({
  candidates,
  results,
  loading,
  syncing,
  skillsRoot,
  onRefresh,
  onSync,
  onClose
}: {
  candidates: ExternalSkillCandidateGroup[];
  results: ExternalSkillSyncResult[];
  loading: boolean;
  syncing: boolean;
  skillsRoot: string;
  onRefresh: () => void;
  onSync: (selections: ExternalSkillSyncSelection[]) => void;
  onClose: () => void;
}) {
  const defaults = useMemo(() => defaultSelections(candidates), [candidates]);
  const [selections, setSelections] = useState<SelectionState>(defaults);
  const groups = useMemo(() => groupCandidates(candidates), [candidates]);
  const [activeTab, setActiveTab] = useState<SyncTab>(() => firstUsefulTab(groups));

  useEffect(() => setSelections(defaults), [defaults]);
  useEffect(() => setActiveTab((current) => tabHasItems(current, groups) ? current : firstUsefulTab(groups)), [groups]);

  const actionableCandidates = [...groups.newCandidates, ...groups.conflictCandidates];
  const syncSelections = buildSelections(actionableCandidates, selections);
  const unresolvedConflictCount = countUnresolvedConflicts(groups.conflictCandidates, selections);
  const selectedNewCount = countSelectedByStatus(groups.newCandidates, selections);
  const selectedTotal = selectedNewCount + countSelectedByStatus(groups.conflictCandidates, selections);
  const conflictBulkAction = conflictBulkSelection(groups.conflictCandidates, selections);
  const allNewSelected = groups.newCandidates.length > 0 && countSources(groups.newCandidates) === selectedNewCount;
  const busy = loading || syncing;
  const syncDisabled = busy || syncSelections.length === 0 || unresolvedConflictCount > 0;

  function setSelection(key: string, action: ExternalSkillSyncAction) {
    setSelections((current) => ({ ...current, [key]: action }));
  }

  function setNewCandidates(action: Extract<ExternalSkillSyncAction, "sync" | "skip">) {
    setSelections((current) => {
      const next = { ...current };
      for (const candidate of groups.newCandidates) {
        for (const source of candidate.sources) {
          next[selectionKey(candidate.directoryName, source.tool, source.path)] = action;
        }
      }
      return next;
    });
  }

  function toggleConflictBulk(action: Extract<ExternalSkillSyncAction, "use_workbench" | "use_external">) {
    setSelections((current) => {
      const currentBulk = conflictBulkSelection(groups.conflictCandidates, current);
      const nextAction: ExternalSkillSyncAction = currentBulk === action ? "skip" : action;
      const next = { ...current };
      for (const candidate of groups.conflictCandidates) {
        for (const source of candidate.sources) {
          next[selectionKey(candidate.directoryName, source.tool, source.path)] = nextAction;
        }
      }
      return next;
    });
  }

  return (
    <Modal
      title="同步外部工具 Skills"
      description="检查已注册工具目录中的 Skills，并按状态处理同步项。"
      onClose={onClose}
      large
      className="sync-dialog-card"
      footer={
        <div className="sync-footer">
          <div>
            <div className="sync-footer-summary">
              {footerSummary(selectedTotal, selectedNewCount, groups.sameCandidates.length, groups.invalidCandidates.length, unresolvedConflictCount)}
            </div>
            <div className="sync-footer-note">只会同步你确认的项；接管工具目录前会备份；同名且内容相同的项自动跳过。</div>
          </div>
          <Button
            variant="primary"
            disabled={syncDisabled}
            onClick={() => onSync(syncSelections)}
          >
            <RefreshCcw className={syncing ? "spin" : ""} size={15} />{syncing ? "同步中" : "同步"}
          </Button>
        </div>
      }
    >
      <div className="file-block file-block-action sync-root-row">
        <span>当前统一根目录</span>
        <code>{skillsRoot}</code>
        <Button disabled={busy} onClick={onRefresh}><RefreshCcw className={loading ? "spin" : ""} size={15} />{loading ? "扫描中" : "重新扫描"}</Button>
      </div>

      <div className="sync-tabs" role="tablist" aria-label="外部 Skills 状态">
        <button disabled={busy} className={activeTab === "new" ? "active" : ""} onClick={() => setActiveTab("new")}>新增 <span>{groups.newCandidates.length}</span></button>
        <button disabled={busy} className={activeTab === "conflict" ? "active" : ""} onClick={() => setActiveTab("conflict")}>冲突 <span>{groups.conflictCandidates.length}</span></button>
        <button disabled={busy} className={activeTab === "same" ? "active" : ""} onClick={() => setActiveTab("same")}>已存在 <span>{groups.sameCandidates.length}</span></button>
        <button disabled={busy} className={activeTab === "invalid" ? "active" : ""} onClick={() => setActiveTab("invalid")}>不可用 <span>{groups.invalidCandidates.length}</span></button>
      </div>

      {activeTab === "new" && (
        <SyncTabPanel
          title="新增 Skills"
          description="Workbench 统一根目录中还没有这些 Skills。默认导入并接管对应工具目录。"
          actions={
            groups.newCandidates.length > 0 && (
              <div className="sync-policy-actions" aria-label="新增项策略">
                <button disabled={busy} className={allNewSelected ? "active" : ""} onClick={() => setNewCandidates(allNewSelected ? "skip" : "sync")}>导入并接管</button>
              </div>
            )
          }
        >
          {groups.newCandidates.length === 0 ? (
            <EmptySyncTab>没有新增 Skills。</EmptySyncTab>
          ) : (
            <div className="sync-candidate-list">
              {groups.newCandidates.map((candidate) => (
                <CandidateRows
                  key={candidate.directoryName}
                  candidate={candidate}
                  selections={selections}
                  onSelectionChange={setSelection}
                  disabled={busy}
                />
              ))}
            </div>
          )}
        </SyncTabPanel>
      )}

      {activeTab === "conflict" && (
        <SyncTabPanel
          title="冲突 Skills"
          description="统一根目录和工具目录存在同名但内容不同的 Skill。必须选择版本来源后才能同步。"
          actions={
            groups.conflictCandidates.length > 0 && (
              <div className="sync-policy-actions" aria-label="冲突项策略">
                <button disabled={busy} className={conflictBulkAction === "use_workbench" ? "active" : ""} onClick={() => toggleConflictBulk("use_workbench")}>全部保留 Workbench</button>
                <button disabled={busy} className={conflictBulkAction === "use_external" ? "active" : ""} onClick={() => toggleConflictBulk("use_external")}>全部使用外部</button>
              </div>
            )
          }
        >
          {groups.conflictCandidates.length === 0 ? (
            <EmptySyncTab>没有冲突 Skills。</EmptySyncTab>
          ) : (
            <div className="sync-candidate-list">
              {groups.conflictCandidates.map((candidate) => (
                <CandidateRows
                  key={candidate.directoryName}
                  candidate={candidate}
                  selections={selections}
                  onSelectionChange={setSelection}
                  disabled={busy}
                />
              ))}
            </div>
          )}
        </SyncTabPanel>
      )}

      {activeTab === "same" && (
        <SyncTabPanel
          title="已存在相同内容"
          description="这些项与统一根目录中的内容相同，本次自动跳过，不接管、不修改工具目录。"
        >
          {groups.sameCandidates.length === 0 ? (
            <EmptySyncTab>没有已存在相同内容的 Skills。</EmptySyncTab>
          ) : (
            <ReadOnlyCandidateList candidates={groups.sameCandidates} statusText="无需处理" />
          )}
        </SyncTabPanel>
      )}

      {activeTab === "invalid" && (
        <SyncTabPanel
          title="不可用项"
          description="这些目录不能同步，需要用户在工具目录中修正后重新扫描。"
        >
          {groups.invalidCandidates.length === 0 ? (
            <EmptySyncTab>没有不可用项。</EmptySyncTab>
          ) : (
            <ReadOnlyCandidateList candidates={groups.invalidCandidates} statusText="不可同步" danger />
          )}
        </SyncTabPanel>
      )}

      {results.length > 0 && (
        <section className="sync-result-panel">
          <div className="section-heading">同步结果</div>
          <div className="import-list">
            {results.map((result) => (
              <div className={`import-result ${syncStatusImportClass(result.status)}`} key={`${result.directoryName}-${result.tool}-${result.sourcePath}`}>
                <span>
                  <strong>{result.directoryName}</strong>
                  <small>{result.toolName} · {externalSyncStatusLabel(result.status)}{result.syncMethod ? ` · ${result.syncMethod}` : ""}</small>
                  <small>{result.message}</small>
                  {result.backupPath && <small>备份：{result.backupPath}</small>}
                </span>
                <i>{externalSyncStatusLabel(result.status)}</i>
              </div>
            ))}
          </div>
        </section>
      )}
    </Modal>
  );
}

function SyncTabPanel({
  title,
  description,
  actions,
  children
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sync-tab-panel">
      <div className="sync-panel-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function EmptySyncTab({ children }: { children: ReactNode }) {
  return (
    <div className="sync-empty-state">
      <span><Inbox size={18} /></span>
      <strong>{children}</strong>
    </div>
  );
}

function CandidateRows({
  candidate,
  selections,
  onSelectionChange,
  disabled = false
}: {
  candidate: ExternalSkillCandidateGroup;
  selections: SelectionState;
  onSelectionChange: (key: string, action: ExternalSkillSyncAction) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {candidate.sources.map((source) => {
        const key = selectionKey(candidate.directoryName, source.tool, source.path);
        const action = selections[key] ?? "skip";
        const selected = action !== "skip";
        return (
          <div className="sync-candidate-row" key={key}>
            <button
              className={`sync-check ${selected ? "selected" : ""}`}
              aria-label={`${candidate.directoryName} ${source.toolName}`}
              disabled={disabled}
              onClick={() => onSelectionChange(key, selected ? "skip" : checkedActionFor(candidate.status))}
            >
              {selected ? "✓" : "?"}
            </button>
            <span>
              <strong>{candidate.displayName}</strong>
              <small>{source.toolName}: {source.path}</small>
              {source.message && <small>{source.message}</small>}
            </span>
            <i className={candidate.status === "conflict" ? "danger" : ""}>{externalCandidateStatusLabel(candidate.status)}</i>
            {candidate.status === "new" ? (
              selected ? <StatusBadge tone="accent">导入并接管</StatusBadge> : <StatusBadge tone="neutral">不处理</StatusBadge>
            ) : (
              <select
                aria-label={`${candidate.directoryName} ${source.toolName} 同步方式`}
                value={action}
                disabled={disabled}
                onChange={(event) => onSelectionChange(key, event.target.value as ExternalSkillSyncAction)}
              >
                <option value="skip">选择版本来源</option>
                <option value="use_workbench">保留 Workbench 版本并接管</option>
                <option value="use_external">使用外部版本并接管</option>
              </select>
            )}
          </div>
        );
      })}
    </>
  );
}

function ReadOnlyCandidateList({
  candidates,
  statusText,
  danger = false
}: {
  candidates: ExternalSkillCandidateGroup[];
  statusText: string;
  danger?: boolean;
}) {
  return (
    <div className="sync-readonly-list">
      {candidates.map((candidate) => (
        <div className="sync-readonly-row" key={candidate.directoryName}>
          <span>
            <strong>{candidate.displayName}</strong>
            <small>{candidate.sources.map((source) => `${source.toolName}: ${source.message ?? source.path}`).join(" / ")}</small>
          </span>
          <i className={danger ? "danger" : ""}>{statusText}</i>
        </div>
      ))}
    </div>
  );
}

function groupCandidates(candidates: ExternalSkillCandidateGroup[]) {
  return {
    newCandidates: candidates.filter((candidate) => candidate.status === "new"),
    conflictCandidates: candidates.filter((candidate) => candidate.status === "conflict"),
    sameCandidates: candidates.filter((candidate) => candidate.status === "same_as_current"),
    invalidCandidates: candidates.filter((candidate) => candidate.status === "invalid" || candidate.status === "unreadable")
  };
}

function firstUsefulTab(groups: ReturnType<typeof groupCandidates>): SyncTab {
  if (groups.newCandidates.length > 0) return "new";
  if (groups.conflictCandidates.length > 0) return "conflict";
  if (groups.invalidCandidates.length > 0) return "invalid";
  return "same";
}

function tabHasItems(tab: SyncTab, groups: ReturnType<typeof groupCandidates>) {
  if (tab === "new") return groups.newCandidates.length > 0;
  if (tab === "conflict") return groups.conflictCandidates.length > 0;
  if (tab === "invalid") return groups.invalidCandidates.length > 0;
  return groups.sameCandidates.length > 0;
}

function countSources(candidates: ExternalSkillCandidateGroup[]) {
  return candidates.reduce((count, candidate) => count + candidate.sources.length, 0);
}

function countSelectedByStatus(candidates: ExternalSkillCandidateGroup[], selections: SelectionState) {
  return candidates.reduce((count, candidate) =>
    count + candidate.sources.filter((source) => (selections[selectionKey(candidate.directoryName, source.tool, source.path)] ?? "skip") !== "skip").length
  , 0);
}

function countUnresolvedConflicts(candidates: ExternalSkillCandidateGroup[], selections: SelectionState) {
  return candidates.reduce((count, candidate) =>
    count + candidate.sources.filter((source) => {
      const action = selections[selectionKey(candidate.directoryName, source.tool, source.path)] ?? "skip";
      return action === "skip" || action === "sync";
    }).length
  , 0);
}

function conflictBulkSelection(candidates: ExternalSkillCandidateGroup[], selections: SelectionState): Extract<ExternalSkillSyncAction, "use_workbench" | "use_external"> | null {
  const actions = candidates.flatMap((candidate) =>
    candidate.sources.map((source) => selections[selectionKey(candidate.directoryName, source.tool, source.path)] ?? "skip")
  );
  if (actions.length === 0) return null;
  if (actions.every((action) => action === "use_workbench")) return "use_workbench";
  if (actions.every((action) => action === "use_external")) return "use_external";
  return null;
}

function footerSummary(
  selectedTotal: number,
  selectedNewCount: number,
  sameCount: number,
  invalidCount: number,
  unresolvedConflictCount: number
) {
  if (unresolvedConflictCount > 0) {
    return <>冲突项需完成版本选择后才能同步；当前还有 <strong>{unresolvedConflictCount}</strong> 项待选择</>;
  }
  if (selectedTotal === 0) {
    return <>未选择可同步项；已存在 <strong>{sameCount}</strong> 项会自动跳过，不可用 <strong>{invalidCount}</strong> 项不会同步</>;
  }
  return <>已选择 <strong>{selectedTotal}</strong> 项，将导入 <strong>{selectedNewCount}</strong> 项，接管 <strong>{selectedTotal}</strong> 个工具目录，跳过 <strong>{sameCount}</strong> 项</>;
}

function selectionKey(directoryName: string, tool: string, path: string) {
  return `${directoryName}::${tool}::${path}`;
}

function defaultActionFor(status: ExternalSkillCandidateGroup["status"]): ExternalSkillSyncAction {
  if (status === "new") return "sync";
  return "skip";
}

function checkedActionFor(status: ExternalSkillCandidateGroup["status"]): ExternalSkillSyncAction {
  if (status === "conflict") return "skip";
  return defaultActionFor(status);
}

function defaultSelections(candidates: ExternalSkillCandidateGroup[]) {
  const selections: SelectionState = {};
  for (const candidate of candidates) {
    for (const source of candidate.sources) {
      selections[selectionKey(candidate.directoryName, source.tool, source.path)] = defaultActionFor(candidate.status);
    }
  }
  return selections;
}

function buildSelections(candidates: ExternalSkillCandidateGroup[], selections: SelectionState): ExternalSkillSyncSelection[] {
  return candidates.flatMap((candidate) =>
    candidate.sources.flatMap((source) => {
      const action = selections[selectionKey(candidate.directoryName, source.tool, source.path)] ?? "skip";
      if (action === "skip" || action === "sync" && candidate.status === "conflict") return [];
      return [{
        directoryName: candidate.directoryName,
        sourcePath: source.path,
        tool: source.tool,
        action
      }];
    })
  );
}
