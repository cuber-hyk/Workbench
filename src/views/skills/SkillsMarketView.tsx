import { CircleCheck, ExternalLink, PackagePlus, RefreshCcw, Trash2 } from "lucide-react";
import { Button, DetailHeader, IconButton, Panel, SearchInput, Toolbar } from "../../components/ui";
import type { SkillMarketDetail, SkillMarketItem } from "../../lib/types/domain";
import { SkillStatusIndicator } from "./SkillStatusIndicator";
import { formatInstallCount, marketItemStatus, marketRepositoryUrl, type MarketStats } from "./skillMarketFormatters";

export type MarketInstallTask = {
  key: string;
  source: string;
  skillId: string;
  progress: number;
  status: "running" | "succeeded" | "failed";
  error?: string;
};

export function MarketListSkeleton() {
  return (
    <div className="market-skeleton-list" aria-label="正在加载 skills.sh 市场" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="table-row market-grid market-skeleton-row" key={index} aria-hidden="true">
          <span className="skeleton-stack"><i className="skeleton skeleton-title" /><i className="skeleton skeleton-subtitle" /></span>
          <i className="skeleton skeleton-source" />
          <i className="skeleton skeleton-status" />
          <i className="skeleton skeleton-download" />
          <i className="skeleton skeleton-action" />
        </div>
      ))}
    </div>
  );
}

export function MarketDetailSkeleton() {
  return (
    <div className="market-detail-skeleton" aria-label="正在加载 Skill 详情" aria-busy="true">
      <i className="skeleton skeleton-kicker" />
      <i className="skeleton skeleton-detail-title" />
      <div className="skeleton-divider" />
      <i className="skeleton skeleton-detail-line wide" />
      <i className="skeleton skeleton-detail-line" />
      <div className="skeleton-detail-grid">
        {Array.from({ length: 5 }, (_, index) => <i className="skeleton skeleton-detail-meta" key={index} />)}
      </div>
      <i className="skeleton skeleton-warning" />
      <i className="skeleton skeleton-preview" />
    </div>
  );
}

export function SkillsMarketView({
  items,
  selectedItem,
  detail,
  query,
  statusFilter,
  stats,
  currentCount,
  loading,
  error,
  installTask,
  uninstallingKey,
  onQueryChange,
  onStatusFilterChange,
  onRefresh,
  onSearch,
  onSelect,
  onInstall,
  onUninstall,
  onOpenSource
}: {
  items: SkillMarketItem[];
  selectedItem: SkillMarketItem | undefined;
  detail: SkillMarketDetail | null;
  query: string;
  statusFilter: "全部状态" | "未安装" | "已安装" | "可更新" | "不可安装";
  stats: MarketStats;
  currentCount: number;
  loading: boolean;
  error: string;
  installTask: MarketInstallTask | null;
  uninstallingKey: string;
  onQueryChange: (query: string) => void;
  onStatusFilterChange: (status: "全部状态" | "未安装" | "已安装" | "可更新" | "不可安装") => void;
  onRefresh: () => void;
  onSearch: () => void;
  onSelect: (item: SkillMarketItem) => void;
  onInstall: (item: SkillMarketItem) => void;
  onUninstall: (item: SkillMarketItem) => void;
  onOpenSource: (url: string) => void;
}) {
  const selectedKey = selectedItem ? `${selectedItem.source}/${selectedItem.skillId}` : "";
  const repositoryUrl = selectedItem ? detail?.repositoryUrl || marketRepositoryUrl(selectedItem) : "";
  return (
    <>
      <Toolbar>
        <SearchInput
          placeholder="搜索 skills.sh"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
        />
        <select aria-label="按市场状态筛选" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as typeof statusFilter)}>
          <option>全部状态</option>
          <option>未安装</option>
          <option>已安装</option>
          <option>可更新</option>
          <option>不可安装</option>
        </select>
        <Button onClick={onRefresh}><RefreshCcw size={15} />刷新市场</Button>
      </Toolbar>
      {error && (
        <div className="warning market-error" role="alert">
          <span>{error}</span>
          <Button onClick={onRefresh}><RefreshCcw size={14} />重试</Button>
        </div>
      )}
      <div className="market-stats" aria-label="技能市场统计">
        {[
          [stats.total, "全部"],
          [stats.installed, "已安装"],
          [stats.notInstalled, "未安装"],
          [stats.updateAvailable, "可更新"],
          [stats.unsupported, "不支持"],
          [currentCount, "当前结果"]
        ].map(([value, label]) => (
          <span key={label}>
            <strong>{loading && items.length === 0 ? <i className="skeleton skeleton-stat" /> : value}</strong>
            <small>{label}</small>
          </span>
        ))}
      </div>
      <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head market-grid"><span>远程 Skill</span><span>来源</span><span>状态</span><span>下载</span><span className="table-action-heading">操作</span></div>
          {loading && items.length === 0 && <MarketListSkeleton />}
          {!loading && items.map((item) => {
            const key = `${item.source}/${item.skillId}`;
            const taskForItem = installTask?.key === key ? installTask : null;
            const installing = taskForItem?.status === "running";
            const installedByTask = taskForItem?.status === "succeeded" && !item.installedDirectoryName;
            const uninstalling = uninstallingKey === key;
            return (
              <div
                className={`table-row market-grid ${selectedKey === key ? "selected" : ""}`}
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(item);
                }}
              >
                <span className="title-cell"><strong>{item.name}</strong><small>{item.description || item.skillId}</small></span>
                <span className="path">{item.source}</span>
                <SkillStatusIndicator status={marketItemStatus(item)} />
                <span>{formatInstallCount(item.installs)}</span>
                <span className="row-actions table-actions install-action">
                  {installing ? (
                    <Button disabled><RefreshCcw className="spin" size={14} />安装中 {taskForItem?.progress ?? 8}%</Button>
                  ) : installedByTask ? (
                    <Button disabled><CircleCheck size={14} />安装完成</Button>
                  ) : item.installedDirectoryName ? (
                    <Button
                      variant="danger"
                      disabled={installTask?.status === "running" || uninstalling}
                      onClick={(event) => {
                        event.stopPropagation();
                        onUninstall(item);
                      }}
                    >
                      <Trash2 size={14} />{uninstalling ? "卸载中" : "卸载"}
                    </Button>
                  ) : !item.installable ? (
                    <span className="action-muted" aria-label="不可安装">不可安装</span>
                  ) : (
                    <Button
                      disabled={installTask?.status === "running"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onInstall(item);
                      }}
                    >
                      <PackagePlus size={14} />安装
                    </Button>
                  )}
                  {installing && <i style={{ width: `${taskForItem?.progress ?? 8}%` }} />}
                </span>
              </div>
            );
          })}
        </Panel>
        <Panel className="detail-panel market-detail-panel">
          {loading && items.length === 0 ? (
            <MarketDetailSkeleton />
          ) : selectedItem ? (
            <>
              <div className="market-detail-hero">
                <div>
                  <span className="market-detail-kicker">skills.sh</span>
                  <DetailHeader title={selectedItem.name} actions={repositoryUrl ? <IconButton title="打开来源仓库" onClick={() => onOpenSource(repositoryUrl)}><ExternalLink size={14} /></IconButton> : undefined} />
                </div>
              </div>
              <p className="market-detail-description">{detail?.item.description || selectedItem.description || "暂无远程描述。"}</p>
              <dl className="market-detail-list">
                <div><dt>安装状态</dt><dd><SkillStatusIndicator status={marketItemStatus(selectedItem)} /></dd></div>
                <div><dt>skills.sh 包</dt><dd><code>{selectedItem.source}/{selectedItem.skillId}</code></dd></div>
                <div><dt>Skill ID</dt><dd><code>{selectedItem.skillId}</code></dd></div>
                <div><dt>来源仓库</dt><dd><code>{repositoryUrl || "非 GitHub owner/repo 来源，暂不支持 Workbench 安装"}</code></dd></div>
                <div><dt>参考命令</dt><dd><code>{detail?.installCommand || `npx -y skills add ${selectedItem.source} --skill ${selectedItem.skillId} -g --agent codex -y --copy`}</code></dd></div>
              </dl>
              <div className="warning market-detail-warning">{detail?.securityNote || "Workbench 调用 skills.sh 官方安装器完成获取和展开，再复制到统一 Skills 根目录；第三方 Skill 仍需自行确认来源可信。"}</div>
              {detail?.skillMarkdownPreview && <div className="market-preview"><h3>SKILL.md 预览</h3><p>{detail.skillMarkdownPreview}</p></div>}
            </>
          ) : (
            <div className="notice compact-empty">暂无市场条目。</div>
          )}
        </Panel>
      </div>
    </>
  );
}
