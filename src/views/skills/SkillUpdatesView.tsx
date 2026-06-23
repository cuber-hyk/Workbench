import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button, DetailHeader, PaginationBar, Panel } from "../../components/ui";
import type { SkillUpdateResult, SkillUpdateStatus } from "../../lib/types/domain";
import { clampPage, DEFAULT_PAGE_SIZE, paginateItems } from "../../lib/ui/pagination";
import { SkillStatusIndicator } from "./SkillStatusIndicator";
import { updateStatusLabel } from "./skillMarketFormatters";

export function SkillUpdatesView({
  statuses,
  selectedNames,
  checking,
  updatingNames,
  results,
  onCheck,
  onSelectNames,
  onUpdateSelected,
  onUpdateAll,
  onUpdateOne,
  onOpenMarket
}: {
  statuses: SkillUpdateStatus[];
  selectedNames: string[];
  checking: boolean;
  updatingNames: string[];
  results: SkillUpdateResult[];
  onCheck: () => void;
  onSelectNames: (names: string[]) => void;
  onUpdateSelected: () => void;
  onUpdateAll: () => void;
  onUpdateOne: (directoryName: string) => void;
  onOpenMarket: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const updateable = statuses.filter((status) => status.status === "update_available");
  const selectedUpdateable = selectedNames.filter((directoryName) =>
    updateable.some((status) => status.source.directoryName === directoryName)
  );
  const allUpdateableSelected = updateable.length > 0 && updateable.every((status) => selectedNames.includes(status.source.directoryName));
  const currentPage = clampPage(page, statuses.length, pageSize);
  const pagedStatuses = paginateItems(statuses, currentPage, pageSize);
  useEffect(() => {
    setPage(1);
  }, [statuses, pageSize]);
  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);
  function toggleUpdateSelection(directoryName: string, checked: boolean) {
    onSelectNames(
      checked
        ? Array.from(new Set([...selectedNames, directoryName]))
        : selectedNames.filter((name) => name !== directoryName)
    );
  }
  return (
    <>
      <div className="bulk-bar">
        <span><strong>更新检查</strong><small>仅管理从 skills.sh 安装的 Skill。更新前会备份统一根目录中的旧版本。</small></span>
        <div className="bulk-actions">
          <Button onClick={onCheck}><RefreshCcw size={15} />{checking ? "检查中" : "检查全部"}</Button>
          <Button variant="primary" disabled={selectedUpdateable.length === 0 || updatingNames.length > 0} onClick={onUpdateSelected}>更新选中项</Button>
          <Button disabled={updateable.length === 0 || updatingNames.length > 0} onClick={onUpdateAll}>更新全部可更新项</Button>
        </div>
      </div>
      <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head update-grid">
            <span><input type="checkbox" aria-label="选择全部可更新项" checked={allUpdateableSelected} disabled={updateable.length === 0 || updatingNames.length > 0} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectNames(event.target.checked ? updateable.map((status) => status.source.directoryName) : [])} /></span>
            <span>Skill</span><span>本地版本</span><span>远端状态</span><span>最近检查</span><span className="table-action-heading">操作</span>
          </div>
          <div className="list-body">
            {statuses.length === 0 && (
              <div className="empty-state update-empty-state">
                <span className="empty-state-icon"><RefreshCcw size={18} /></span>
                <strong>暂无可检查的 skills.sh Skill</strong>
                <small>从技能市场安装的 Skill 会出现在这里，用于检查和执行更新。</small>
                <Button onClick={onOpenMarket}>去技能市场</Button>
              </div>
            )}
            {pagedStatuses.map((status) => {
              const directoryName = status.source.directoryName;
              const checked = selectedNames.includes(directoryName);
              const updateableStatus = status.status === "update_available";
              return (
                <div className="table-row update-grid" key={directoryName}>
                  <span><input type="checkbox" aria-label={`选择 ${directoryName}`} disabled={!updateableStatus || updatingNames.length > 0} checked={updateableStatus && checked} onClick={(event) => event.stopPropagation()} onChange={(event) => toggleUpdateSelection(directoryName, event.target.checked)} /></span>
                  <span className="title-cell"><strong>{status.name}</strong><small>{status.source.packageSlug}</small></span>
                  <span className="path">{status.source.installedHash}</span>
                  <SkillStatusIndicator status={status.status} label={updateStatusLabel(status.status)} />
                  <span>{status.source.lastCheckedAt || "未检查"}</span>
                  <span className="row-actions table-actions">
                    <Button disabled={!updateableStatus || updatingNames.includes(directoryName)} onClick={() => onUpdateOne(directoryName)}>
                      {updatingNames.includes(directoryName) ? "更新中" : "更新"}
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
          {statuses.length > pageSize && (
            <PaginationBar
              total={statuses.length}
              page={currentPage}
              pageSize={pageSize}
              label="Skill 更新分页"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </Panel>
        <Panel className="detail-panel">
          <DetailHeader title={updateable.length === 0 ? "等待可更新项" : "批量更新确认"} />
          <p className="description">
            {updateable.length === 0
              ? "检查后发现可更新 Skill 时，可在左侧选择并批量更新。"
              : `已选择 ${selectedUpdateable.length} 个可更新 Skill。批量更新逐项执行，单项失败会保留旧版本并继续处理其他项。`}
          </p>
          <div className="warning">更新不会自动启用到任何 Agent 工具目录；已启用的 Copy 副本也不会在本次自动重同步。</div>
          {results.length > 0 && (
            <div className="update-result-list">
              <h3>最近结果</h3>
              {results.map((result) => (
                <div key={result.directoryName}><strong>{result.directoryName}</strong><small>{result.message}</small></div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
