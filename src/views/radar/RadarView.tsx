import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Edit3, ExternalLink, Plus, RefreshCcw, Star, Trash2 } from "lucide-react";
import { ActionGroup, Button, ConfirmDeleteModal, DetailHeader, FilterMore, IconButton, Modal, PageHeader, PaginationBar, Panel, SearchInput, StatusBadge, Toolbar } from "../../components/ui";
import type { RadarCategory, RadarDuplicateGroup, RadarItem } from "../../lib/types/domain";
import { clampPage, DEFAULT_PAGE_SIZE, paginateItems } from "../../lib/ui/pagination";

const radarDomains = ["未分类", "Skills", "Agent", "RAG", "AI 基础", "开发工具", "文档工具", "算法与数据结构", "教程与资源", "前端开发", "Android 开发", "桌面应用", "音视频工具", "安全与网络", "其他"];

export function RadarView({
  items,
  duplicateGroups,
  selectedItem,
  loading,
  loadError,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenLink,
  syncingGithubStars,
  onSyncGithubStars,
  onMergeDuplicateGroup
}: {
  items: RadarItem[];
  duplicateGroups: RadarDuplicateGroup[];
  selectedItem?: RadarItem;
  loading: boolean;
  loadError: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (item: RadarItem) => void;
  onDelete: (item: RadarItem) => void;
  onToggleFavorite: (item: RadarItem) => void;
  onOpenLink: (url: string) => void;
  syncingGithubStars: boolean;
  onSyncGithubStars: () => void;
  onMergeDuplicateGroup: (groupId: string, primaryItemId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部分类");
  const [domain, setDomain] = useState("全部领域");
  const [source, setSource] = useState("全部来源");
  const [language, setLanguage] = useState("全部语言");
  const [sourceState, setSourceState] = useState("全部状态");
  const [duplicateState, setDuplicateState] = useState("全部重复状态");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const categories = useMemo(() => ["全部分类", "项目", "资讯", "论文", "其他"], []);
  const domains = useMemo(() => ["全部领域", ...Array.from(new Set([...radarDomains, ...items.map((item) => item.domain || "未分类")]))], [items]);
  const languages = useMemo(
    () => ["全部语言", ...Array.from(new Set(items.map((item) => item.sourceMetadata.language).filter(Boolean))).sort()],
    [items]
  );
  const duplicateCandidateIds = useMemo(
    () => new Set(duplicateGroups.flatMap((group) => group.candidateIds)),
    [duplicateGroups]
  );
  const filteredItems = items.filter((item) => {
    const displayTags = [...new Set([...item.tags, ...item.sourceMetadata.topics])];
    const itemSources = item.sources.length > 0 ? item.sources : [item.source];
    const isDuplicateCandidate = duplicateCandidateIds.has(item.id);
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.note.toLowerCase().includes(normalizedQuery) ||
      item.sourceDescription.toLowerCase().includes(normalizedQuery) ||
      displayTags.some((itemTag) => itemTag.toLowerCase().includes(normalizedQuery));
    return (
      matchesQuery &&
      (category === "全部分类" || item.category === category) &&
      (domain === "全部领域" || item.domain === domain) &&
      (source === "全部来源" || itemSources.includes(source as RadarItem["source"])) &&
      (language === "全部语言" || item.sourceMetadata.language === language) &&
      (sourceState === "全部状态" || (sourceState === "来源有效" ? item.sourceActive : !item.sourceActive)) &&
      (duplicateState === "全部重复状态" || (duplicateState === "待合并" ? isDuplicateCandidate : !isDuplicateCandidate)) &&
      (!favoritesOnly || item.favorite)
    );
  });
  const currentPage = clampPage(page, filteredItems.length, pageSize);
  const pagedItems = paginateItems(filteredItems, currentPage, pageSize);
  const visibleSelectedItem = pagedItems.find((item) => item.id === selectedItem?.id);

  useEffect(() => {
    setPage(1);
  }, [query, category, domain, source, language, sourceState, duplicateState, favoritesOnly, pageSize]);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

  useEffect(() => {
    if (loading || loadError || pagedItems.length === 0) return;
    if (pagedItems.some((item) => item.id === selectedItem?.id)) return;
    onSelect(pagedItems[0].id);
  }, [loading, loadError, onSelect, pagedItems, selectedItem?.id]);

  return (
    <section className="view">
      <PageHeader
        title="资源 Radar"
        description={`${items.length} 条本地记录`}
        actions={<div className="header-actions"><Button disabled={syncingGithubStars} onClick={onSyncGithubStars}><RefreshCcw className={syncingGithubStars ? "spin" : ""} size={15} />{syncingGithubStars ? "同步中" : "同步 GitHub Stars"}</Button><Button variant="primary" onClick={onAdd}><Plus size={15} />添加条目</Button></div>}
      />
      <Toolbar>
        <SearchInput placeholder="搜索名称、标签或备注" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="按分类筛选" value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select aria-label="按领域筛选" value={domain} onChange={(event) => setDomain(event.target.value)}>
          {domains.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select aria-label="按来源筛选" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="全部来源">全部来源</option>
          <option value="manual">手动添加</option>
          <option value="github_star">GitHub Stars</option>
        </select>
        <FilterMore expanded={showMoreFilters} onToggle={() => setShowMoreFilters((value) => !value)}>
              <select aria-label="按语言筛选" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {languages.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select aria-label="按来源状态筛选" value={sourceState} onChange={(event) => setSourceState(event.target.value)}>
                <option>全部状态</option>
                <option>来源有效</option>
                <option>来源失效</option>
              </select>
              <select aria-label="按重复状态筛选" value={duplicateState} onChange={(event) => setDuplicateState(event.target.value)}>
                <option>全部重复状态</option>
                <option>待合并</option>
                <option>非重复项</option>
              </select>
        </FilterMore>
        <Button
          className={`favorite-filter ${favoritesOnly ? "active" : ""}`}
          aria-label={favoritesOnly ? "显示全部资源" : "仅显示收藏资源"}
          title={favoritesOnly ? "显示全部资源" : "仅显示收藏资源"}
          onClick={() => setFavoritesOnly((value) => !value)}
        >
          <Star size={16} fill="currentColor" />
        </Button>
      </Toolbar>
      {duplicateGroups.length > 0 && (
        <div className="radar-duplicate-stack" aria-label="待合并来源">
          {duplicateGroups.map((group) => (
            <section key={group.id} className="skill-conflict-panel radar-duplicate-panel">
              <div className="conflict-panel-title">
                <span>
                  <strong>发现可能重复的 GitHub Stars 来源</strong>
                  <small>{group.externalId} 匹配到 {group.candidates.length} 个手动资源。选择保留的主资源后，来源、标签、备注和收藏会合并。</small>
                </span>
              </div>
              <div className="version-options">
                {group.candidates.map((candidate) => (
                  <label key={candidate.id}>
                    <input type="radio" name={`duplicate-${group.id}`} defaultChecked={candidate.id === group.candidateIds[0]} readOnly />
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>{candidate.category} · {candidate.domain || "未分类"} · {candidate.url || "无链接"}</small>
                    </span>
                    <Button onClick={() => onMergeDuplicateGroup(group.id, candidate.id)}>合并到此</Button>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="split-layout">
        <Panel className="list-panel">
          <div className="list-body card-list-body">
            {loading && (
              <div className="empty-state">
                <strong>正在加载资源 Radar</strong>
                <small>正在读取 Workbench 本地数据库。</small>
              </div>
            )}
            {!loading && loadError && (
              <div className="empty-state">
                <strong>资源 Radar 加载失败</strong>
                <small>{loadError}</small>
              </div>
            )}
            {!loading && !loadError && filteredItems.length === 0 && (
              <div className="empty-state">
                <strong>{items.length === 0 ? "暂无资源条目" : "没有匹配的条目"}</strong>
                <small>{items.length === 0 ? "点击“添加条目”记录资源，或同步 GitHub Stars。" : "调整搜索词或筛选条件后重试。"}</small>
              </div>
            )}
            {!loading && !loadError && pagedItems.map((item) => (
              <div
                key={item.id}
                className={`row-card ${visibleSelectedItem?.id === item.id ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(item.id);
                  }
                }}
              >
                <span className="row-main">
                  <strong>{item.name}</strong>
                  <ActionGroup className="row-actions">
                    <button
                      className={`favorite-star ${item.favorite ? "active" : ""}`}
                      aria-label={item.favorite ? `取消收藏 ${item.name}` : `收藏 ${item.name}`}
                      title={item.favorite ? "取消收藏" : "收藏"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(item);
                      }}
                    >
                      <Star size={15} fill="currentColor" />
                    </button>
                    <IconButton
                      variant="danger"
                      title="删除条目"
                      aria-label={`删除 ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(item);
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </ActionGroup>
                </span>
                <span className="meta-line">{item.category} · {item.domain || "未分类"} · {radarSourceLabel(item)}{item.sourceMetadata.language ? ` · ${item.sourceMetadata.language}` : ""}{item.source === "github_star" ? ` · ★ ${item.sourceMetadata.stars}` : ""} · {item.updatedAt}</span>
                <p>{item.note || item.sourceDescription}</p>
                {!item.sourceActive && <StatusBadge tone="danger">GitHub Stars 来源已失效</StatusBadge>}
                {duplicateCandidateIds.has(item.id) && <StatusBadge tone="warning">待合并重复来源</StatusBadge>}
              </div>
            ))}
          </div>
          {!loading && !loadError && filteredItems.length > pageSize && (
            <PaginationBar
              total={filteredItems.length}
              page={currentPage}
              pageSize={pageSize}
              label="资源 Radar 分页"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </Panel>
        <Panel className="detail-panel">
          {visibleSelectedItem ? (
            <>
              <DetailHeader
                title={visibleSelectedItem.name}
                description={`${visibleSelectedItem.category} · ${visibleSelectedItem.domain || "未分类"} · ${radarSourceLabel(visibleSelectedItem)}${visibleSelectedItem.sourceActive ? "" : " · 来源已失效"}`}
                actions={
                  <IconButton
                    title="编辑条目"
                    aria-label="编辑条目"
                    onClick={() => onEdit(visibleSelectedItem)}
                  >
                    <Edit3 size={15} />
                  </IconButton>
                }
              />
              <div className="form-grid">
                <label>名称<input value={visibleSelectedItem.name} readOnly /></label>
                <label>分类<input value={visibleSelectedItem.category} readOnly /></label>
                <label>领域<input value={visibleSelectedItem.domain || "未分类"} readOnly /></label>
                <label>来源<input value={radarSourceLabel(visibleSelectedItem)} readOnly /></label>
                <label className="full">链接<span className="field-with-action"><input value={visibleSelectedItem.url} readOnly /><IconButton title="打开链接" aria-label="打开链接" onClick={() => onOpenLink(visibleSelectedItem.url)} disabled={!visibleSelectedItem.url}><ExternalLink size={15} /></IconButton></span></label>
                <label>标签<input value={visibleSelectedItem.tags.join(", ")} readOnly /></label>
                <label>更新时间<input value={visibleSelectedItem.updatedAt} readOnly /></label>
                {visibleSelectedItem.source === "github_star" && <><label>语言<input value={visibleSelectedItem.sourceMetadata.language || "未知"} readOnly /></label><label>GitHub Stars<input value={visibleSelectedItem.sourceMetadata.stars} readOnly /></label><label className="full">GitHub Topics<input value={visibleSelectedItem.sourceMetadata.topics.join(", ")} readOnly /></label><label className="full">来源描述<textarea rows={3} value={visibleSelectedItem.sourceDescription} readOnly /></label></>}
                <label className="full">备注<textarea rows={5} value={visibleSelectedItem.note} readOnly /></label>
              </div>
            </>
          ) : (
            <div className="empty-state detail-empty">
              <strong>选择一个资源条目</strong>
              <small>查看详情、收藏或打开链接。</small>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

export function RadarDialog({
  item,
  onSubmit,
  onClose
}: {
  item?: RadarItem;
  onSubmit: (item: RadarItem) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<RadarCategory>(item?.category ?? "项目");
  const [domain, setDomain] = useState(item?.domain ?? "未分类");
  const [url, setUrl] = useState(item?.url ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [formError, setFormError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      setFormError("条目名称不能为空");
      return;
    }
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setFormError("链接必须使用 http:// 或 https://");
      return;
    }
    onSubmit({
      id: item?.id ?? createRadarId(trimmedName),
      name: trimmedName,
      category,
      domain,
      url: trimmedUrl,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      note: note.trim(),
      favorite: item?.favorite ?? false,
      updatedAt: item?.updatedAt ?? new Date().toISOString().slice(0, 10),
      source: item?.source ?? "manual",
      sources: item?.sources ?? [item?.source ?? "manual"],
      externalId: item?.externalId ?? "",
      sourceDescription: item?.sourceDescription ?? "",
      sourceMetadata: item?.sourceMetadata ?? { language: "", topics: [], stars: 0, repositoryUpdatedAt: "" },
      sourceActive: item?.sourceActive ?? true,
      lastSyncedAt: item?.lastSyncedAt ?? ""
    });
  }

  return (
    <Modal
      title={item ? "编辑资源条目" : "添加资源条目"}
      description={item?.source === "github_star" ? "编辑用户维护的分类、标签、备注和收藏状态" : "手动记录本地资源条目"}
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button form="radar-form" type="submit" variant="primary">{item ? "保存" : "添加条目"}</Button></>}
    >
      <form id="radar-form" className="dialog-form" onSubmit={handleSubmit}>
        {formError && <p className="field-error">{formError}</p>}
        <label>名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="条目名称" autoFocus readOnly={item?.source === "github_star"} /></label>
        <label>分类<select value={category} onChange={(event) => setCategory(event.target.value as RadarCategory)}><option>项目</option><option>资讯</option><option>论文</option><option>其他</option></select></label>
        <label>领域<select value={domain} onChange={(event) => setDomain(event.target.value)}>{radarDomains.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label>链接<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" readOnly={item?.source === "github_star"} /></label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="使用逗号分隔" /></label>
        <label>备注<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      </form>
    </Modal>
  );
}

export function DeleteRadarDialog({
  item,
  onClose,
  onConfirm
}: {
  item: RadarItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除资源条目"
      description={`确认删除 ${item.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除条目"
    >
      <p>删除后，该条目将从本地 Workbench 数据库中移除。</p>
      {item.url && <div className="file-block"><span>链接</span><code>{item.url}</code></div>}
    </ConfirmDeleteModal>
  );
}

function createRadarId(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "") || "radar";
  return `${base}-${Date.now().toString(36)}`;
}

function radarSourceLabel(item: RadarItem) {
  const sources = item.sources.length > 0 ? item.sources : [item.source];
  return sources.map((source) => source === "github_star" ? "GitHub Stars" : "手动添加").join(" + ");
}
