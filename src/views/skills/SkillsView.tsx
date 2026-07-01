import { useEffect, useRef, useState } from "react";
import { Ban, ChevronDown, CircleAlert, CircleCheck, Download, ExternalLink, FileText, FolderOpen, RefreshCcw, Settings, Trash2 } from "lucide-react";
import { ActionGroup, Button, DetailHeader, IconButton, PaginationBar, Panel, SearchInput, StatusBadge, Toolbar } from "../../components/ui";
import { DeleteMarketSkillDialog } from "../../components/dialogs/skills/DeleteMarketSkillDialog";
import { workbenchApi } from "../../lib/api/workbenchApi";
import { ToolIcon } from "../../lib/ui/toolIcons";
import { clampPage, DEFAULT_PAGE_SIZE, paginateItems } from "../../lib/ui/pagination";
import type { AppSettings, Project, Skill, SkillCategory, SkillMarketDetail, SkillMarketItem, SkillMarketMode, SkillMarketResponse, SkillUpdateResult, SkillUpdateStatus, SkillVersionSource, ToolKey, ToolTarget } from "../../lib/types/domain";
import { SkillUpdatesView } from "./SkillUpdatesView";
import { SkillsMarketView, type MarketInstallTask } from "./SkillsMarketView";
import { buildMarketStats, localMarketDetail } from "./skillMarketFormatters";
import { globalStatusLabel, skillMatchesStatusFilter, skillMatchesToolProjectFilter } from "./skillFilters";

let skillMarketRuntimeCache: { response: SkillMarketResponse; updatedAt: number } | null = null;
const MARKET_DEFAULT_SEARCH_LIMIT = 100;
const MARKET_MAX_SEARCH_LIMIT = 2000;

function marketSearchBatchSize(pageSize: number) {
  return Math.min(Math.max(pageSize * 4, 100), 400);
}

function normalizeMarketResponse(
  response: SkillMarketResponse | SkillMarketItem[],
  query: string,
  limit?: number
): SkillMarketResponse {
  if (!Array.isArray(response)) return response;
  return {
    items: response,
    mode: query ? "search" : "leaderboard",
    query,
    loaded: response.length,
    hasMore: false,
    limit: query ? limit ?? MARKET_DEFAULT_SEARCH_LIMIT : null,
    message: null
  };
}

export function clearSkillMarketRuntimeCache() {
  skillMarketRuntimeCache = null;
}

export function SkillsView({
  skills,
  selectedSkill,
  categories: skillCategories,
  settings,
  projects,
  onSelect,
  onImport,
  onImportGithub,
  onRefresh,
  marketInstallTask,
  onInstallMarketSkill,
  onSyncSkills = () => undefined,
  isSyncingSkills = false,
  onManageCategories,
  onToggle,
  onToggleSkillGlobal,
  onToggleProjectAll,
  onCategorySkill,
  onCreateCategorySkill,
  onResolve,
  onOpenSource = (url) => void workbenchApi.openExternalLink(url),
  onDeleteSkill
}: {
  skills: Skill[];
  selectedSkill: Skill;
  categories: SkillCategory[];
  settings: AppSettings;
  projects: Project[];
  onSelect: (id: string) => void;
  onImport: (kind: "zip" | "folder") => Promise<void>;
  onImportGithub?: () => void;
  onRefresh: () => void | Promise<void>;
  marketInstallTask?: MarketInstallTask | null;
  onInstallMarketSkill?: (item: SkillMarketItem) => void;
  onSyncSkills?: () => void;
  isSyncingSkills?: boolean;
  onManageCategories: () => void;
  onToggle: (tool: ToolKey, enabled: boolean, project?: Project) => void;
  onToggleSkillGlobal: (directoryName: string, tool: ToolKey, enabled: boolean) => void;
  onToggleProjectAll: (project: Project, enabled: boolean) => void;
  onCategorySkill: (directoryName: string, categoryId: string) => void;
  onCreateCategorySkill: (directoryName: string, name: string) => void;
  onResolve: (source: SkillVersionSource) => void;
  onOpenSource?: (url: string) => void;
  onDeleteSkill: (skillId: string) => void;
}) {
  const [activeSkillsTab, setActiveSkillsTab] = useState<"local" | "market" | "updates">("local");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部分类");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [toolFilter, setToolFilter] = useState<ToolKey | "全部工具">("全部工具");
  const [projectFilter, setProjectFilter] = useState("全部项目");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState("");
  const [marketStatusFilter, setMarketStatusFilter] = useState<"全部状态" | "未安装" | "已安装" | "可更新" | "不可安装">("全部状态");
  const [marketItems, setMarketItems] = useState<SkillMarketItem[]>([]);
  const [marketMode, setMarketMode] = useState<SkillMarketMode>("leaderboard");
  const [marketActiveQuery, setMarketActiveQuery] = useState("");
  const [marketLoaded, setMarketLoaded] = useState(0);
  const [marketHasMore, setMarketHasMore] = useState(false);
  const [marketLimit, setMarketLimit] = useState<number | null>(null);
  const [marketLoadingMore, setMarketLoadingMore] = useState(false);
  const [selectedMarketKey, setSelectedMarketKey] = useState("");
  const [marketDetail, setMarketDetail] = useState<SkillMarketDetail | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [uninstallingMarketKey, setUninstallingMarketKey] = useState("");
  const [deletingMarketItem, setDeletingMarketItem] = useState<SkillMarketItem | null>(null);
  const [updateStatuses, setUpdateStatuses] = useState<SkillUpdateStatus[]>([]);
  const [selectedUpdateNames, setSelectedUpdateNames] = useState<string[]>([]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatingNames, setUpdatingNames] = useState<string[]>([]);
  const [updateProgressByName, setUpdateProgressByName] = useState<Record<string, number>>({});
  const [updateResults, setUpdateResults] = useState<SkillUpdateResult[]>([]);
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [expandedToolSkillId, setExpandedToolSkillId] = useState("");
  const handledMarketInstallRef = useRef("");
  const importMenuRef = useRef<HTMLDivElement>(null);
  const handleMarketInstall = onInstallMarketSkill ?? ((item: SkillMarketItem) => {
    void workbenchApi.installSkillFromMarket(item.source, item.skillId, () => undefined)
      .then(() => onRefresh())
      .catch((error) => setMarketError(String(error)));
  });
  const categories = ["全部分类", ...skillCategories.map((category) => category.name)];
  const visibleSkills = skills.filter((skill) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery);
    const matchesCategory = categoryFilter === "全部分类" || skill.category === categoryFilter;
    const matchesStatus = skillMatchesStatusFilter(skill, statusFilter);
    const matchesToolProject = skillMatchesToolProjectFilter(skill, toolFilter, projectFilter);
    return matchesQuery && matchesCategory && matchesStatus && matchesToolProject;
  });
  const localCurrentPage = clampPage(localPage, visibleSkills.length, localPageSize);
  const pagedSkills = paginateItems(visibleSkills, localCurrentPage, localPageSize);
  const visibleSelectedSkill = pagedSkills.find((skill) => skill.id === selectedSkill.id);
  const visibleMarketItems = marketItems.filter((item) => {
    const normalizedQuery = marketQuery.trim().toLowerCase();
    const localQueryFilter = marketMode === "leaderboard" ? normalizedQuery : "";
    const matchesQuery =
      !localQueryFilter ||
      item.name.toLowerCase().includes(localQueryFilter) ||
      item.skillId.toLowerCase().includes(localQueryFilter) ||
      item.source.toLowerCase().includes(localQueryFilter);
    const matchesStatus =
      marketStatusFilter === "全部状态" ||
      (marketStatusFilter === "未安装" && !item.installedDirectoryName && item.installable) ||
      (marketStatusFilter === "已安装" && Boolean(item.installedDirectoryName)) ||
      (marketStatusFilter === "可更新" && item.updateStatus === "update_available") ||
      (marketStatusFilter === "不可安装" && !item.installable);
    return matchesQuery && matchesStatus;
  });
  const selectedMarketItem = visibleMarketItems.find((item) => `${item.source}/${item.skillId}` === selectedMarketKey) ?? visibleMarketItems[0];
  const marketStats = buildMarketStats(marketItems);
  const updateableStatuses = updateStatuses.filter((status) => status.status === "update_available");
  const selectedUpdateableNames = selectedUpdateNames.filter((directoryName) =>
    updateableStatuses.some((status) => status.source.directoryName === directoryName)
  );

  useEffect(() => {
    if (activeSkillsTab !== "market" || marketItems.length > 0 || marketLoading) return;
    void loadMarketItems();
  }, [activeSkillsTab]);

  useEffect(() => {
    if (activeSkillsTab !== "updates" || updateStatuses.length > 0 || checkingUpdates) return;
    void loadSkillUpdates(false);
  }, [activeSkillsTab]);

  useEffect(() => {
    if (activeSkillsTab !== "market" || !marketInstallTask || marketInstallTask.status === "running") return;
    const marker = `${marketInstallTask.key}:${marketInstallTask.status}`;
    if (handledMarketInstallRef.current === marker) return;
    handledMarketInstallRef.current = marker;
    if (marketInstallTask.status === "succeeded") {
      void loadMarketItems("", true);
      void loadSkillUpdates(false);
      return;
    }
    setMarketError(marketInstallTask.error || "Skill 安装失败");
  }, [activeSkillsTab, marketInstallTask?.key, marketInstallTask?.status, marketInstallTask?.error]);

  useEffect(() => {
    setLocalPage(1);
  }, [query, categoryFilter, statusFilter, toolFilter, projectFilter, localPageSize]);

  useEffect(() => {
    setExpandedToolSkillId("");
  }, [activeSkillsTab, query, categoryFilter, statusFilter, toolFilter, projectFilter, localCurrentPage]);

  useEffect(() => {
    if (!importMenuOpen) return;
    function closeImportMenuOnOutsidePointerDown(event: PointerEvent) {
      if (importMenuRef.current?.contains(event.target as Node)) return;
      setImportMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeImportMenuOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeImportMenuOnOutsidePointerDown);
  }, [importMenuOpen]);

  useEffect(() => {
    if (localPage !== localCurrentPage) setLocalPage(localCurrentPage);
  }, [localCurrentPage, localPage]);

  useEffect(() => {
    if (activeSkillsTab !== "local" || pagedSkills.length === 0) return;
    if (pagedSkills.some((skill) => skill.id === selectedSkill.id)) return;
    onSelect(pagedSkills[0].id);
  }, [activeSkillsTab, onSelect, pagedSkills, selectedSkill.id]);

  useEffect(() => {
    if (!selectedMarketItem) {
      setMarketDetail(null);
      return;
    }
    const key = `${selectedMarketItem.source}/${selectedMarketItem.skillId}`;
    if (marketDetail && `${marketDetail.item.source}/${marketDetail.item.skillId}` === key) return;
    void loadMarketDetail(selectedMarketItem);
  }, [selectedMarketItem?.source, selectedMarketItem?.skillId]);

  function applyMarketResponse(response: SkillMarketResponse) {
    setMarketItems(response.items);
    setMarketMode(response.mode);
    setMarketActiveQuery(response.query);
    setMarketLoaded(response.loaded);
    setMarketHasMore(response.hasMore);
    setMarketLimit(response.limit ?? null);
    setSelectedMarketKey((current) => {
      if (current && response.items.some((item) => `${item.source}/${item.skillId}` === current)) return current;
      return response.items[0] ? `${response.items[0].source}/${response.items[0].skillId}` : "";
    });
  }

  async function loadMarketItems(query = marketQuery, force = false, limit?: number) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery && skillMarketRuntimeCache && !force) {
      applyMarketResponse(skillMarketRuntimeCache.response);
      return skillMarketRuntimeCache.response;
    }
    setMarketLoading(true);
    setMarketError("");
    try {
      if (normalizedQuery && normalizedQuery.length < 2) {
        throw new Error("搜索关键词至少需要 2 个字符");
      }
      const requestLimit = normalizedQuery ? limit ?? MARKET_DEFAULT_SEARCH_LIMIT : undefined;
      const response = normalizeMarketResponse(
        await workbenchApi.listSkillMarket(normalizedQuery, requestLimit) as SkillMarketResponse | SkillMarketItem[],
        normalizedQuery,
        requestLimit
      );
      applyMarketResponse(response);
      if (!normalizedQuery) {
        skillMarketRuntimeCache = { response, updatedAt: Date.now() };
      }
      return response;
    } catch (error) {
      setMarketError(String(error));
      return null;
    } finally {
      setMarketLoading(false);
    }
  }

  async function searchMarketItems() {
    const normalizedQuery = marketQuery.trim();
    const limit = normalizedQuery ? MARKET_DEFAULT_SEARCH_LIMIT : undefined;
    await loadMarketItems(normalizedQuery, true, limit);
  }

  async function refreshMarketItems() {
    const query = marketMode === "search" ? marketActiveQuery : "";
    await loadMarketItems(query, true, query ? marketLimit ?? MARKET_DEFAULT_SEARCH_LIMIT : undefined);
  }

  async function loadMoreMarketItems(targetPage: number, pageSize: number) {
    if (marketMode !== "search" || !marketActiveQuery || marketLoadingMore) return;
    const currentLimit = marketLimit ?? MARKET_DEFAULT_SEARCH_LIMIT;
    const batchSize = marketSearchBatchSize(pageSize);
    const nextLimit = Math.min(
      MARKET_MAX_SEARCH_LIMIT,
      Math.max(currentLimit + batchSize, targetPage * pageSize)
    );
    if (nextLimit <= currentLimit) return;

    setMarketLoadingMore(true);
    try {
      await loadMarketItems(marketActiveQuery, true, nextLimit);
    } finally {
      setMarketLoadingMore(false);
    }
  }

  async function loadMarketDetail(item: SkillMarketItem) {
    setMarketError("");
    if (!item.installable) {
      setMarketDetail(localMarketDetail(item));
      return;
    }
    try {
      setMarketDetail(await workbenchApi.getSkillMarketDetail(item.source, item.skillId));
    } catch (error) {
      setMarketDetail(null);
      setMarketError(String(error));
    }
  }

  async function uninstallMarketSkill(item: SkillMarketItem) {
    const directoryName = item.installedDirectoryName || item.skillId;
    const key = `${item.source}/${item.skillId}`;
    setUninstallingMarketKey(key);
    setMarketError("");
    try {
      await workbenchApi.deleteSkill(directoryName);
      skillMarketRuntimeCache = null;
      setSelectedUpdateNames((current) => current.filter((name) => name !== directoryName));
      await loadMarketItems("", true);
      await loadSkillUpdates(false);
      await onRefresh();
    } catch (error) {
      setMarketError(String(error));
    } finally {
      setUninstallingMarketKey("");
    }
  }

  async function loadSkillUpdates(checkRemote: boolean) {
    setCheckingUpdates(true);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const statuses = checkRemote ? await workbenchApi.checkSkillUpdates() : await workbenchApi.listSkillUpdates();
      setUpdateStatuses(statuses);
      setSelectedUpdateNames((current) =>
        current.filter((directoryName) => statuses.some((status) => status.source.directoryName === directoryName))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUpdateResults([{ directoryName: checkRemote ? "更新检查" : "更新列表", status: "check_failed", message }]);
      if (activeSkillsTab === "market") {
        setMarketError(`更新状态刷新失败：${message}`);
      }
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function updateSelectedSkills(directoryNames: string[]) {
    const targets = directoryNames.filter((directoryName) =>
      updateStatuses.some((status) => status.source.directoryName === directoryName && status.status === "update_available")
    );
    if (targets.length === 0) return;
    setUpdatingNames(targets);
    setUpdateProgressByName(Object.fromEntries(targets.map((directoryName) => [directoryName, 8])));
    try {
      const results = await workbenchApi.updateMarketSkills(targets, (directoryName, progress) => {
        setUpdateProgressByName((current) => ({ ...current, [directoryName]: progress }));
      });
      setUpdateResults(results);
      await loadSkillUpdates(false);
      await onRefresh();
      setSelectedUpdateNames([]);
    } finally {
      setUpdatingNames([]);
      setUpdateProgressByName({});
    }
  }

  return (
    <section className="view">
      <header className="skills-header">
        <div className="skills-title">
          <h1>Skills</h1>
          <p>统一根目录 · {skills.length} 个 Skills</p>
        </div>
        <div className="skills-subnav" role="tablist" aria-label="Skills 子视图">
          <button className={activeSkillsTab === "local" ? "active" : ""} onClick={() => setActiveSkillsTab("local")}>本地 Skills</button>
          <button className={activeSkillsTab === "market" ? "active" : ""} onClick={() => setActiveSkillsTab("market")}>技能市场</button>
          <button className={activeSkillsTab === "updates" ? "active" : ""} onClick={() => setActiveSkillsTab("updates")}>
            更新{updateableStatuses.length > 0 ? ` ${updateableStatuses.length}` : ""}
          </button>
        </div>
      </header>
      {activeSkillsTab === "local" && (
        <>
          <div className="root-bar">
            <span><strong>统一根目录</strong>{settings.skillsRoot}</span>
            <div className="root-bar-actions">
              <Button disabled={isSyncingSkills} onClick={onSyncSkills}><RefreshCcw className={isSyncingSkills ? "spin" : ""} size={15} />{isSyncingSkills ? "同步中" : "同步 Skills"}</Button>
              <Button onClick={onManageCategories}><Settings size={15} />管理分类</Button>
              <div className="import-control" ref={importMenuRef}>
                <Button variant="primary" onClick={() => setImportMenuOpen(!importMenuOpen)}>
                  <Download size={15} />导入 Skills<ChevronDown size={14} />
                </Button>
                {importMenuOpen && (
                  <div className="import-menu">
                    <button onClick={() => { setImportMenuOpen(false); void onImport("zip"); }}>选择 ZIP 文件</button>
                    <button onClick={() => { setImportMenuOpen(false); void onImport("folder"); }}>选择已解压文件夹</button>
                    <button onClick={() => { setImportMenuOpen(false); onImportGithub?.(); }}>GitHub 链接</button>
                  </div>
                )}
              </div>
              <Button onClick={() => void workbenchApi.openLocalPath(settings.skillsRoot)}><FolderOpen size={15} />打开目录</Button>
            </div>
          </div>
          <Toolbar>
            <SearchInput placeholder="搜索名称或描述" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="按分类筛选 Skills" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <select aria-label="按状态筛选 Skills" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>全部状态</option>
              <option>已启用</option>
              <option>内容冲突</option>
              <option>未启用</option>
            </select>
            <select aria-label="按启用项目筛选 Skills" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
              <option value="全部项目">全部项目</option>
              {projects.map((project) => <option key={project.path} value={project.path}>{project.name}</option>)}
            </select>
            <select aria-label="按启用工具筛选 Skills" value={toolFilter} onChange={(event) => setToolFilter(event.target.value as ToolKey | "全部工具")}>
              <option value="全部工具">全部工具</option>
              {settings.toolTargets.map((tool) => <option key={tool.key} value={tool.key}>{tool.name}</option>)}
            </select>
          </Toolbar>
          <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head skills-grid"><span>Skill</span><span>分类</span><span>全局启用</span><span className="table-action-heading">操作</span></div>
          <div className="list-body">
            {pagedSkills.map((skill) => (
              <div
                key={skill.id}
                className={`table-row skills-grid ${selectedSkill.id === skill.id ? "selected" : ""}`}
                role="group"
                aria-label={`${skill.name} Skill`}
                aria-current={selectedSkill.id === skill.id ? "true" : undefined}
                tabIndex={0}
                onClick={() => onSelect(skill.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(skill.id);
                }}
              >
                <span className="title-cell"><strong>{skill.name}</strong><small>{skill.description}</small></span>
                <SkillCategorySelect
                  skillName={skill.name}
                  categoryId={skill.categoryId}
                  categories={skillCategories}
                  onSave={(categoryId) => onCategorySkill(skill.directoryName, categoryId)}
                  onCreate={(name) => onCreateCategorySkill(skill.directoryName, name)}
                />
                <GlobalToolIcons
                  skill={skill}
                  tools={settings.toolTargets}
                  expanded={expandedToolSkillId === skill.id}
                  onExpandedChange={(expanded) => setExpandedToolSkillId(expanded ? skill.id : "")}
                  onToggle={(tool, enabled) => onToggleSkillGlobal(skill.directoryName, tool, enabled)}
                />
                <ActionGroup align="start" className="row-actions table-actions">
                  <IconButton
                    title="打开 SKILL.md"
                    onClick={(event) => {
                      event.stopPropagation();
                      void workbenchApi.openLocalPath(skill.skillPath);
                    }}
                  >
                    <FileText size={14} />
                  </IconButton>
                  <IconButton
                    variant="danger"
                    title="删除 Skill"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteSkill(skill.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </ActionGroup>
              </div>
            ))}
            {visibleSkills.length === 0 && (
              <div className="empty-state">
                <strong>{skills.length === 0 ? "暂无 Skills" : "没有匹配的 Skill"}</strong>
                <small>{skills.length === 0 ? "配置统一根目录并扫描后，可以在这里管理 Skills。" : "调整搜索、分类、状态、项目或工具筛选后重试。"}</small>
              </div>
            )}
          </div>
          {visibleSkills.length > localPageSize && (
            <PaginationBar
              total={visibleSkills.length}
              page={localCurrentPage}
              pageSize={localPageSize}
              label="本地 Skills 分页"
              onPageChange={setLocalPage}
              onPageSizeChange={setLocalPageSize}
            />
          )}
        </Panel>

        <Panel className="detail-panel">
          {visibleSelectedSkill ? (
            <>
              <DetailHeader title={visibleSelectedSkill.name} />
              <p className="description">{visibleSelectedSkill.description}</p>
              {visibleSelectedSkill.sourceUrl && (
                <div className="form-grid">
                  <label className="full">
                    来源
                    <span className="field-with-action">
                      <input value={visibleSelectedSkill.sourceUrl} readOnly />
                      <IconButton title="查看来源" onClick={() => onOpenSource(visibleSelectedSkill.sourceUrl)}>
                        <ExternalLink size={15} />
                      </IconButton>
                    </span>
                  </label>
                </div>
              )}
              {visibleSelectedSkill.globalToolStates.some((state) => state.status === "conflict") && (
                <SkillConflictPanel skill={visibleSelectedSkill} settings={settings} onResolve={onResolve} />
              )}
              <div className="file-block"><span>SKILL.md</span><code>{visibleSelectedSkill.skillPath}</code></div>
            </>
          ) : (
            <div className="empty-state detail-empty">
              <strong>选择一个 Skill</strong>
              <small>查看文件路径。</small>
            </div>
          )}
        </Panel>
      </div>
        </>
      )}
      {activeSkillsTab === "market" && (
        <SkillsMarketView
          items={visibleMarketItems}
          selectedItem={selectedMarketItem}
          detail={marketDetail}
          query={marketQuery}
          statusFilter={marketStatusFilter}
          stats={marketStats}
          currentCount={visibleMarketItems.length}
          loadedCount={marketLoaded}
          mode={marketMode}
          hasMore={marketHasMore}
          loadingMore={marketLoadingMore}
          loading={marketLoading}
          error={marketError}
          installTask={marketInstallTask ?? null}
          uninstallingKey={uninstallingMarketKey}
          onQueryChange={setMarketQuery}
          onStatusFilterChange={setMarketStatusFilter}
          onRefresh={() => void refreshMarketItems()}
          onSearch={() => void searchMarketItems()}
          onLoadMore={(targetPage, pageSize) => loadMoreMarketItems(targetPage, pageSize)}
          onSelect={(item) => setSelectedMarketKey(`${item.source}/${item.skillId}`)}
          onInstall={handleMarketInstall}
          onUninstall={setDeletingMarketItem}
          onOpenSource={onOpenSource}
        />
      )}
      {activeSkillsTab === "updates" && (
        <SkillUpdatesView
          statuses={updateStatuses}
          selectedNames={selectedUpdateNames}
          checking={checkingUpdates}
          updatingNames={updatingNames}
          updateProgressByName={updateProgressByName}
          results={updateResults}
          onCheck={() => void loadSkillUpdates(true)}
          onSelectNames={setSelectedUpdateNames}
          onUpdateSelected={() => void updateSelectedSkills(selectedUpdateableNames)}
          onUpdateAll={() => void updateSelectedSkills(updateableStatuses.map((status) => status.source.directoryName))}
          onUpdateOne={(directoryName) => void updateSelectedSkills([directoryName])}
          onOpenMarket={() => setActiveSkillsTab("market")}
        />
      )}
      {deletingMarketItem && (
        <DeleteMarketSkillDialog
          item={deletingMarketItem}
          onClose={() => setDeletingMarketItem(null)}
          onConfirm={() => {
            const target = deletingMarketItem;
            setDeletingMarketItem(null);
            void uninstallMarketSkill(target);
          }}
        />
      )}
    </section>
  );
}

export function GlobalToolIcons({
  skill,
  tools,
  expanded,
  onExpandedChange,
  onToggle
}: {
  skill: Skill;
  tools: ToolTarget[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onToggle: (tool: ToolKey, enabled: boolean) => void;
}) {
  const moreRef = useRef<HTMLSpanElement>(null);
  const visibleTools = tools.slice(0, 4);
  const hiddenTools = tools.slice(4);

  useEffect(() => {
    if (!expanded) return;
    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (moreRef.current?.contains(event.target as Node)) return;
      onExpandedChange(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [expanded, onExpandedChange]);

  const renderToolButton = (tool: ToolTarget) => {
    const state = skill.globalToolStates.find((entry) => entry.tool === tool.key);
    const enabled = state?.status === "managed";
    const conflict = state?.status === "conflict";
    return (
      <button
        className={`${enabled ? "managed" : ""} ${conflict ? "conflict" : ""}`}
        key={tool.key}
        title={`${tool.name} · ${globalStatusLabel(state)}`}
        onClick={(event) => {
          event.stopPropagation();
          if (!conflict) onToggle(tool.key, !enabled);
        }}
      >
        <ToolIcon tool={tool} />
      </button>
    );
  };

  return (
    <span className="tool-icons">
      {visibleTools.map(renderToolButton)}
      {hiddenTools.length > 0 && (
        <span className="tool-more" ref={moreRef}>
          <button
            className="more"
            title="显示全部工具"
            onClick={(event) => {
              event.stopPropagation();
              onExpandedChange(!expanded);
            }}
          >
            +{hiddenTools.length}
          </button>
          {expanded && (
            <span className="tool-more-popover" onClick={(event) => event.stopPropagation()}>
              {tools.map((tool) => (
                <span className="tool-more-row" key={tool.key}>
                  {renderToolButton(tool)}
                  <small>{tool.name}</small>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function SkillCategorySelect({
  skillName,
  categoryId,
  categories,
  onSave,
  onCreate
}: {
  skillName: string;
  categoryId: string;
  categories: SkillCategory[];
  onSave: (categoryId: string) => void;
  onCreate: (name: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue("");
    setCreating(false);
  }, [categoryId]);

  function save() {
    const next = value.trim();
    setCreating(false);
    if (next) onCreate(next);
  }

  if (creating) {
    return (
      <input
        className="inline-category-input"
        aria-label="新分类名称"
        autoFocus
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            setValue("");
            setCreating(false);
          }
        }}
      />
    );
  }

  return (
    <select
      className="inline-category-select"
      aria-label={`${skillName} 分类`}
      value={categoryId}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        if (event.target.value === "__new__") {
          setValue("");
          setCreating(true);
          return;
        }
        onSave(event.target.value);
      }}
    >
      {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      <option value="__new__">新建分类...</option>
    </select>
  );
}

export function SkillConflictPanel({
  skill,
  settings,
  onResolve
}: {
  skill: Skill;
  settings: AppSettings;
  onResolve: (source: SkillVersionSource) => void;
}) {
  const [selectedSource, setSelectedSource] = useState<SkillVersionSource>("workbench");
  const candidates = [
    {
      source: "workbench" as const,
      label: ".workbench",
      path: skill.skillPath.replace(/[\\/][^\\/]+$/, ""),
      available: true
    },
    ...settings.toolTargets.map((tool) => {
      const state = skill.globalToolStates.find((entry) => entry.tool === tool.key);
      return {
        source: tool.key as SkillVersionSource,
        label: `.${tool.key}`,
        path: `${tool.globalSkillsDir}\\${skill.directoryName}`,
        available: Boolean(state && state.status !== "disabled")
      };
    })
  ];

  useEffect(() => {
    if (!candidates.some((candidate) => candidate.source === selectedSource && candidate.available)) {
      setSelectedSource("workbench");
    }
  }, [candidates, selectedSource]);

  const selectedCandidate = candidates.find((candidate) => candidate.source === selectedSource);
  return (
    <div className="skill-conflict-panel">
      <div className="conflict-panel-title">
        <span>
          <strong>检测到多个版本不一致</strong>
          <small>选择一个版本作为唯一来源，应用后会统一同步到已存在的全局工具目录。</small>
        </span>
        <StatusBadge tone="danger">内容冲突</StatusBadge>
      </div>
      <div className="version-options">
        {candidates.map((candidate) => (
          <label key={candidate.source} className={!candidate.available ? "disabled" : ""}>
            <input
              type="radio"
              name={`${skill.id}-version-source`}
              checked={selectedSource === candidate.source}
              disabled={!candidate.available}
              onChange={() => setSelectedSource(candidate.source)}
            />
            <span>
              <strong>{candidate.label}</strong>
              <small>{candidate.available ? candidate.path : "不存在或未启用"}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="conflict-panel-actions">
        <Button
          variant="primary"
          disabled={!selectedCandidate?.available}
          onClick={() => onResolve(selectedSource)}
        >
          应用选择
        </Button>
        <button onClick={() => void workbenchApi.openSkillSourceDirectory(skill.directoryName)}>打开 .workbench</button>
      </div>
    </div>
  );
}
