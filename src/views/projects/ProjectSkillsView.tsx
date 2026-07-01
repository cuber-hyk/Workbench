import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Columns3, FolderOpen, RefreshCcw, RotateCw, Table2, Trash2, Wrench, Zap } from "lucide-react";
import { ActionGroup, Button, IconButton, Modal, SearchInput, StatusBadge, Toolbar } from "../../components/ui";
import { ToolIcon } from "../../lib/ui/toolIcons";
import type { Project, ProjectSkillAction, ProjectSkillOperationResult, ProjectSkillsState, ProjectSkillTarget, ProjectSkillTargetStatus, ToolKey, ToolTarget } from "../../lib/types/domain";

const DEFAULT_VISIBLE_TOOL_COUNT = 5;

const statusOptions: Array<{ value: "all" | ProjectSkillTargetStatus; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "disabled", label: "未启用" },
  { value: "managed_symlink", label: "符号链接" },
  { value: "managed_copy", label: "Copy" },
  { value: "stale_copy", label: "副本过期" },
  { value: "missing_target", label: "目标缺失" },
  { value: "source_missing", label: "源缺失" },
  { value: "conflict", label: "冲突" },
  { value: "project_missing", label: "项目缺失" }
];

type ProjectSkillRow = {
  directoryName: string;
  skillName: string;
  description: string;
  categoryId: string;
  category: string;
  targets: Map<ToolKey, ProjectSkillTarget>;
};

export function ProjectSkillsView({
  project,
  state,
  loading,
  error,
  busy,
  results,
  onRefresh,
  onApplyAction,
  onBatchRebuild,
  onBatchEnable,
  onOpenPath,
  onOpenSource
}: {
  project: Project;
  state?: ProjectSkillsState | null;
  loading: boolean;
  error: string;
  busy: boolean;
  results: ProjectSkillOperationResult[];
  onRefresh: () => void;
  onApplyAction: (target: ProjectSkillTarget, action: ProjectSkillAction) => void;
  onBatchRebuild: (targets: ProjectSkillTarget[]) => void;
  onBatchEnable: (directoryNames: string[], tools: ToolKey[]) => void;
  onOpenPath: (path: string) => void;
  onOpenSource: (directoryName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectSkillTargetStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedDirectoryNames, setSelectedDirectoryNames] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<ToolKey[]>([]);
  const [visibleToolKeys, setVisibleToolKeys] = useState<ToolKey[]>([]);
  const [selectedToolKey, setSelectedToolKey] = useState<ToolKey>("");
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [viewMode, setViewMode] = useState<"tool" | "matrix">("tool");
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);

  const projectTools = useMemo(() => (state?.tools ?? []).filter((tool) => tool.supportsProjectScope), [state?.tools]);
  const currentTool = useMemo(() => projectTools.find((tool) => tool.key === selectedToolKey) ?? projectTools[0] ?? null, [projectTools, selectedToolKey]);
  const rows = useMemo(
    () => buildRows(state?.targets ?? [], query, statusFilter, categoryFilter, viewMode === "tool" ? currentTool?.key : undefined),
    [categoryFilter, currentTool?.key, query, state?.targets, statusFilter, viewMode]
  );
  const categoryOptions = useMemo(() => projectSkillCategories(state?.targets ?? []), [state?.targets]);
  const visibleTools = useMemo(() => {
    const selected = projectTools.filter((tool) => visibleToolKeys.includes(tool.key));
    return selected.length ? selected : projectTools.slice(0, DEFAULT_VISIBLE_TOOL_COUNT);
  }, [projectTools, visibleToolKeys]);
  const visibleToolKeySet = useMemo(() => new Set(visibleTools.map((tool) => tool.key)), [visibleTools]);
  const selectedTarget = useMemo(() => {
    for (const row of rows) {
      for (const target of row.targets.values()) {
        if (targetKey(target) === selectedTargetKey) return target;
      }
    }
    return viewMode === "tool" && currentTool ? firstToolTarget(rows, currentTool.key) : firstVisibleTarget(rows, visibleTools);
  }, [currentTool, rows, selectedTargetKey, viewMode, visibleTools]);
  const projectMissing = Boolean(state && !state.projectExists);
  const selectedTargets = useMemo(() => {
    const toolsForBatch = viewMode === "tool" && currentTool ? [currentTool] : visibleTools;
    return rows.flatMap((row) =>
      toolsForBatch
        .map((tool) => row.targets.get(tool.key))
        .filter((target): target is ProjectSkillTarget => Boolean(target))
        .filter((target) => selectedDirectoryNames.includes(target.directoryName))
    );
  }, [currentTool, rows, selectedDirectoryNames, viewMode, visibleTools]);
  const rebuildTargets = selectedTargets.filter((target) =>
    target.status === "managed_copy"
    || target.status === "managed_symlink"
    || target.status === "stale_copy"
    || target.status === "missing_target"
  );
  const showInitialLoading = loading && !state;
  const gridStyle = { gridTemplateColumns: `minmax(240px, 1.35fr) repeat(${Math.max(visibleTools.length, 1)}, minmax(128px, .8fr))` };

  useEffect(() => {
    setVisibleToolKeys((current) => {
      const availableKeys = projectTools.map((tool) => tool.key);
      const next = current.filter((key) => availableKeys.includes(key));
      if (next.length > 0) return next;
      return availableKeys.slice(0, DEFAULT_VISIBLE_TOOL_COUNT);
    });
  }, [projectTools]);

  useEffect(() => {
    if (!projectTools.length) {
      setSelectedToolKey("");
      return;
    }
    if (selectedToolKey && projectTools.some((tool) => tool.key === selectedToolKey)) return;
    setSelectedToolKey(projectTools[0].key);
  }, [projectTools, selectedToolKey]);

  useEffect(() => {
    const firstTarget = viewMode === "tool" && currentTool ? firstToolTarget(rows, currentTool.key) : firstVisibleTarget(rows, visibleTools);
    if (!firstTarget) {
      setSelectedTargetKey("");
      return;
    }
    if (selectedTarget && (viewMode === "tool" ? selectedTarget.tool === currentTool?.key : visibleToolKeySet.has(selectedTarget.tool))) return;
    setSelectedTargetKey(targetKey(firstTarget));
  }, [currentTool, rows, selectedTarget, viewMode, visibleToolKeySet, visibleTools]);

  function toggleDirectory(directoryName: string) {
    setSelectedDirectoryNames((current) =>
      current.includes(directoryName)
        ? current.filter((item) => item !== directoryName)
        : [...current, directoryName]
    );
  }

  function toggleTool(tool: ToolKey) {
    setSelectedTools((current) =>
      current.includes(tool)
        ? current.filter((item) => item !== tool)
        : [...current, tool]
    );
  }

  function toggleVisibleTool(tool: ToolKey) {
    setVisibleToolKeys((current) => {
      if (current.includes(tool)) {
        const next = current.filter((item) => item !== tool);
        return next.length ? next : current;
      }
      return [...current, tool];
    });
  }

  function openBatchDialog() {
    const defaultTool = viewMode === "tool" ? currentTool?.key : selectedTarget?.tool;
    setSelectedTools(defaultTool ? [defaultTool] : []);
    setBatchDialogOpen(true);
  }

  return (
    <section className="project-skills-view" aria-label={`${project.name} 项目 Skills`}>
      <Toolbar>
        <SearchInput placeholder="搜索 Skill" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="按项目 Skill 状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select aria-label="按项目 Skill 分类筛选" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">全部分类</option>
          {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <Button aria-pressed={viewMode === "matrix"} onClick={() => setViewMode(viewMode === "tool" ? "matrix" : "tool")}>
          <Table2 size={14} />{viewMode === "tool" ? "跨工具对比" : "工具视图"}
        </Button>
        {viewMode === "matrix" && (
          <ProjectToolPicker
            tools={projectTools}
            visibleToolKeys={visibleToolKeys}
            open={toolPickerOpen}
            onOpenChange={setToolPickerOpen}
            onToggleVisibleTool={toggleVisibleTool}
          />
        )}
        <Button onClick={onRefresh} disabled={busy || loading}><RefreshCcw size={14} />刷新</Button>
        <Button
          variant="primary"
          disabled={busy || projectMissing || selectedDirectoryNames.length === 0}
          onClick={openBatchDialog}
        >
          <Zap size={14} />批量启用
        </Button>
        <Button
          disabled={busy || projectMissing || rebuildTargets.length === 0}
          onClick={() => onBatchRebuild(rebuildTargets)}
        >
          <RotateCw size={14} />重建选中
        </Button>
      </Toolbar>

      {error && <div className="warning" role="alert">{error}</div>}
      {projectMissing && <div className="warning" role="alert">项目路径不存在或不是目录，当前页面只读。</div>}
      {showInitialLoading && (
        <div className="empty-state">
          <strong>正在扫描项目 Skills</strong>
          <small>只读取当前项目目录和启用记录，不创建、不修复。</small>
        </div>
      )}
      {!loading && !state && !error && (
        <div className="empty-state">
          <strong>暂无项目 Skills 状态</strong>
          <small>点击刷新扫描当前项目。</small>
        </div>
      )}
      {state && projectTools.length === 0 && (
        <div className="empty-state">
          <strong>没有支持项目级 Skills 的工具</strong>
          <small>项目 Skills 只管理支持项目目录的工具；全局-only 工具仍在本地 Skills 页管理。</small>
        </div>
      )}
      {state && projectTools.length > 0 && (
        <>
          <div className="project-skills-toolbar">
            <span>
              <strong>{state.projectName}</strong>
              <small>{state.projectPath}</small>
            </span>
            <span className="project-skills-toolbar-summary">
              <small>{viewMode === "tool" ? `当前工具 ${currentTool?.name ?? "-"} · ` : `项目级工具 ${visibleTools.length}/${projectTools.length} · `}已选 {selectedDirectoryNames.length} 个 Skill</small>
            </span>
          </div>
          <div className={`project-skills-workspace ${viewMode === "tool" ? "tool-mode" : "matrix-mode"}`}>
            {viewMode === "tool" && currentTool ? (
              <>
                <ProjectToolSidebar tools={projectTools} selectedToolKey={currentTool.key} onSelectTool={setSelectedToolKey} />
                <ProjectToolSkillTable
                  rows={rows}
                  tool={currentTool}
                  busy={busy || projectMissing}
                  selectedDirectoryNames={selectedDirectoryNames}
                  selectedTarget={selectedTarget}
                  onToggleDirectory={toggleDirectory}
                  onSelectTarget={(target) => setSelectedTargetKey(targetKey(target))}
                  onApplyAction={onApplyAction}
                />
              </>
            ) : (
              <ProjectSkillsMatrix
                rows={rows}
                visibleTools={visibleTools}
                gridStyle={gridStyle}
                busy={busy || projectMissing}
                selectedDirectoryNames={selectedDirectoryNames}
                selectedTarget={selectedTarget}
                onToggleDirectory={toggleDirectory}
                onSelectTarget={(target) => setSelectedTargetKey(targetKey(target))}
                onApplyAction={onApplyAction}
              />
            )}
            <ProjectSkillInspector
              target={selectedTarget}
              busy={busy || projectMissing}
              onApplyAction={onApplyAction}
              onOpenPath={onOpenPath}
              onOpenSource={onOpenSource}
            />
          </div>
        </>
      )}
      {batchDialogOpen && (
        <BatchEnableDialog
          tools={projectTools}
          selectedTools={selectedTools}
          selectedSkillCount={selectedDirectoryNames.length}
          busy={busy}
          onToggleTool={toggleTool}
          onClose={() => setBatchDialogOpen(false)}
          onConfirm={() => {
            onBatchEnable(selectedDirectoryNames, selectedTools);
            setBatchDialogOpen(false);
          }}
        />
      )}
    </section>
  );
}

function ProjectToolSidebar({
  tools,
  selectedToolKey,
  onSelectTool
}: {
  tools: ToolTarget[];
  selectedToolKey: ToolKey;
  onSelectTool: (tool: ToolKey) => void;
}) {
  return (
    <aside className="project-tools-sidebar" aria-label="项目级工具">
      <header>
        <strong>项目级工具</strong>
        <small>{tools.length} 个</small>
      </header>
      <div className="project-tool-list">
        {tools.map((tool) => (
          <button
            type="button"
            key={tool.key}
            className={tool.key === selectedToolKey ? "selected" : ""}
            aria-pressed={tool.key === selectedToolKey}
            onClick={() => onSelectTool(tool.key)}
          >
            <ToolIcon tool={tool} />
            <span>
              <strong>{tool.name}</strong>
              <small>{tool.available ? "可用" : "未检测"}</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function ProjectToolSkillTable({
  rows,
  tool,
  busy,
  selectedDirectoryNames,
  selectedTarget,
  onToggleDirectory,
  onSelectTarget,
  onApplyAction
}: {
  rows: ProjectSkillRow[];
  tool: ToolTarget;
  busy: boolean;
  selectedDirectoryNames: string[];
  selectedTarget?: ProjectSkillTarget | null;
  onToggleDirectory: (directoryName: string) => void;
  onSelectTarget: (target: ProjectSkillTarget) => void;
  onApplyAction: (target: ProjectSkillTarget, action: ProjectSkillAction) => void;
}) {
  return (
    <div className="project-tool-skill-table" role="table" aria-label={`${tool.name} 项目 Skills`}>
      <div className="project-tool-skill-row project-tool-skill-head" role="row">
        <span role="columnheader">Skill</span>
        <span role="columnheader">状态</span>
        <span role="columnheader">同步方式</span>
      </div>
      {rows.map((row) => {
        const target = row.targets.get(tool.key);
        if (!target) return null;
        const selected = selectedTarget ? targetKey(target) === targetKey(selectedTarget) : false;
        return (
          <div
            className={`project-tool-skill-row ${selected ? "selected" : ""}`}
            role="row"
            tabIndex={0}
            key={row.directoryName}
            onClick={() => onSelectTarget(target)}
            onKeyDown={(event) => {
              if (event.target instanceof HTMLInputElement) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectTarget(target);
              }
            }}
          >
            <span className="project-tool-skill-name" role="cell">
              <input
                type="checkbox"
                aria-label={`选择 ${row.skillName}`}
                checked={selectedDirectoryNames.includes(row.directoryName)}
                onChange={() => onToggleDirectory(row.directoryName)}
                onClick={(event) => event.stopPropagation()}
                disabled={busy}
              />
              <span>
                <strong>{row.skillName}</strong>
                <small><b>{row.category}</b>{row.description ? ` · ${row.description}` : ` · ${row.directoryName}`}</small>
              </span>
            </span>
            <span role="cell">
              <ProjectStatusControl target={target} busy={busy} onApplyAction={onApplyAction} />
            </span>
            <span role="cell">{syncMethodLabel(target)}</span>
          </div>
        );
      })}
      {rows.length === 0 && (
        <div className="empty-state">
          <strong>没有匹配的 Skill</strong>
          <small>调整搜索或状态筛选后重试。</small>
        </div>
      )}
    </div>
  );
}

function ProjectSkillsMatrix({
  rows,
  visibleTools,
  gridStyle,
  busy,
  selectedDirectoryNames,
  selectedTarget,
  onToggleDirectory,
  onSelectTarget,
  onApplyAction
}: {
  rows: ProjectSkillRow[];
  visibleTools: ToolTarget[];
  gridStyle: CSSProperties;
  busy: boolean;
  selectedDirectoryNames: string[];
  selectedTarget?: ProjectSkillTarget | null;
  onToggleDirectory: (directoryName: string) => void;
  onSelectTarget: (target: ProjectSkillTarget) => void;
  onApplyAction: (target: ProjectSkillTarget, action: ProjectSkillAction) => void;
}) {
  return (
    <div className="project-skills-matrix" role="table" aria-label="项目 Skills 矩阵">
      <div className="project-skills-row project-skills-head" role="row" style={gridStyle}>
        <span role="columnheader" className="project-skill-sticky-cell">Skill</span>
        {visibleTools.map((tool) => (
          <span key={tool.key} role="columnheader" className="project-skill-tool-head">
            <ToolIcon tool={tool} />
            {tool.name}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div className="project-skills-row" role="row" key={row.directoryName} style={gridStyle}>
          <label className="project-skill-name-cell project-skill-sticky-cell">
            <input
              type="checkbox"
              aria-label={`选择 ${row.skillName}`}
              checked={selectedDirectoryNames.includes(row.directoryName)}
              onChange={() => onToggleDirectory(row.directoryName)}
              disabled={busy}
            />
            <span>
              <strong>{row.skillName}</strong>
              <small><b>{row.category}</b>{row.description ? ` · ${row.description}` : ` · ${row.directoryName}`}</small>
            </span>
          </label>
          {visibleTools.map((tool) => {
            const target = row.targets.get(tool.key);
            return target ? (
              <ProjectSkillCell
                key={tool.key}
                target={target}
                busy={busy}
                selected={selectedTarget ? targetKey(target) === targetKey(selectedTarget) : false}
                onSelect={() => onSelectTarget(target)}
                onApplyAction={onApplyAction}
              />
            ) : <span className="project-skill-cell muted" key={tool.key} role="cell">不支持</span>;
          })}
        </div>
      ))}
      {rows.length === 0 && (
        <div className="empty-state">
          <strong>没有匹配的 Skill</strong>
          <small>调整搜索或状态筛选后重试。</small>
        </div>
      )}
    </div>
  );
}

function ProjectToolPicker({
  tools,
  visibleToolKeys,
  open,
  onOpenChange,
  onToggleVisibleTool
}: {
  tools: ToolTarget[];
  visibleToolKeys: ToolKey[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleVisibleTool: (tool: ToolKey) => void;
}) {
  const pickerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (pickerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [open, onOpenChange]);

  return (
    <span className="project-tool-column-picker" ref={pickerRef}>
      <Button aria-expanded={open} title="显示工具列" onClick={() => onOpenChange(!open)}>
        <Columns3 size={14} />列 {visibleToolKeys.length}/{tools.length}
      </Button>
      {open && (
        <span className="project-tool-column-popover" role="menu" aria-label="项目级工具列">
          <strong>显示工具列</strong>
          {tools.map((tool) => (
            <span className="project-tool-column-row" key={tool.key}>
              <span>
                <ToolIcon tool={tool} />
                <b>{tool.name}</b>
              </span>
              <label>
                <input
                  type="checkbox"
                  aria-label={`显示 ${tool.name}`}
                  checked={visibleToolKeys.includes(tool.key)}
                  onChange={() => onToggleVisibleTool(tool.key)}
                />
                显示
              </label>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function BatchEnableDialog({
  tools,
  selectedTools,
  selectedSkillCount,
  busy,
  onToggleTool,
  onClose,
  onConfirm
}: {
  tools: ToolTarget[];
  selectedTools: ToolKey[];
  selectedSkillCount: number;
  busy: boolean;
  onToggleTool: (tool: ToolKey) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="批量启用项目 Skills"
      description={`将选中的 ${selectedSkillCount} 个 Skill 启用到选定项目级工具。`}
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={busy || selectedTools.length === 0} onClick={onConfirm}><Zap size={14} />启用到 {selectedTools.length} 个工具</Button></>}
    >
      <div className="project-batch-tool-list">
        {tools.map((tool) => (
          <label key={tool.key}>
            <span>
              <ToolIcon tool={tool} />
              <strong>{tool.name}</strong>
            </span>
            <input
              type="checkbox"
              aria-label={`启用到 ${tool.name}`}
              checked={selectedTools.includes(tool.key)}
              onChange={() => onToggleTool(tool.key)}
            />
          </label>
        ))}
      </div>
    </Modal>
  );
}

function ProjectSkillCell({
  target,
  busy,
  selected,
  onSelect,
  onApplyAction
}: {
  target: ProjectSkillTarget;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onApplyAction: (target: ProjectSkillTarget, action: ProjectSkillAction) => void;
}) {
  return (
    <span
      className={`project-skill-cell ${selected ? "selected" : ""}`}
      role="cell"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLButtonElement) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-label={`${target.skillName} ${target.toolName} ${statusLabel(target.status)}`}
    >
      <ProjectStatusControl target={target} busy={busy} compactDisabled onApplyAction={onApplyAction} />
      {projectSkillCellHint(target) && <small>{projectSkillCellHint(target)}</small>}
    </span>
  );
}

function ProjectStatusControl({
  target,
  busy,
  compactDisabled = false,
  onApplyAction
}: {
  target: ProjectSkillTarget;
  busy: boolean;
  compactDisabled?: boolean;
  onApplyAction: (target: ProjectSkillTarget, action: ProjectSkillAction) => void;
}) {
  if (target.status === "disabled" || target.status === "managed_symlink" || target.status === "managed_copy") {
    const enabled = target.status === "managed_symlink" || target.status === "managed_copy";
    return (
      <button
        type="button"
        className={`project-status-action ${enabled ? "enabled" : ""} ${!enabled && compactDisabled ? "compact-disabled" : ""}`}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onApplyAction(target, enabled ? "disable" : "enable");
        }}
      >
        {enabled ? "已启用" : compactDisabled ? "+ 启用" : "未启用"}
      </button>
    );
  }
  return <StatusBadge tone={statusTone(target.status)}>{statusLabel(target.status)}</StatusBadge>;
}

function ProjectSkillInspector({
  target,
  busy,
  onApplyAction,
  onOpenPath,
  onOpenSource
}: {
  target?: ProjectSkillTarget | null;
  busy: boolean;
  onApplyAction: (target: ProjectSkillTarget, action: ProjectSkillAction) => void;
  onOpenPath: (path: string) => void;
  onOpenSource: (directoryName: string) => void;
}) {
  if (!target) {
    return (
      <aside className="project-skill-inspector" aria-label="项目 Skill 详情">
        <div className="empty-state detail-empty">
          <strong>选择一个单元格</strong>
          <small>查看项目级目标路径、状态说明和可执行动作。</small>
        </div>
      </aside>
    );
  }
  const action = primaryActionFor(target.status);
  return (
    <aside className="project-skill-inspector" aria-label="项目 Skill 详情">
      <header>
        <span>
          <h2>{target.skillName}</h2>
          <small>{target.directoryName}</small>
        </span>
        <StatusBadge tone={statusTone(target.status)}>{statusLabel(target.status)}</StatusBadge>
      </header>
      <p>{target.description || "暂无描述。"}</p>
      <div className="project-skill-inspector-fields">
        <div><small>工具</small><strong>{target.toolName}</strong></div>
        <div><small>状态</small><strong>{target.message}</strong></div>
        <div><small>目标路径</small><code>{target.targetPath || "未生成"}</code></div>
        <div><small>同步方式</small><strong>{syncMethodLabel(target)}</strong></div>
      </div>
      <ActionGroup align="start" className="project-skill-inspector-actions">
        <IconButton title="打开目标目录" disabled={!target.targetPath} onClick={() => onOpenPath(target.targetPath)}>
          <FolderOpen size={14} />
        </IconButton>
        <IconButton title="打开统一根目录 Skill" onClick={() => onOpenSource(target.directoryName)}>
          <Wrench size={14} />
        </IconButton>
        {(target.status === "missing_target" || target.status === "source_missing") && (
          <Button disabled={busy} onClick={() => onApplyAction(target, "clear_record")}>清记录</Button>
        )}
        {action && (
          <Button
            variant={action.variant}
            disabled={busy}
            onClick={() => onApplyAction(target, action.action)}
          >
            {action.icon}
            {action.label}
          </Button>
        )}
      </ActionGroup>
    </aside>
  );
}

function buildRows(targets: ProjectSkillTarget[], query: string, statusFilter: "all" | ProjectSkillTargetStatus, categoryFilter: string, statusToolKey?: ToolKey) {
  const byDirectory = new Map<string, ProjectSkillRow>();
  for (const target of targets) {
    const row = byDirectory.get(target.directoryName) ?? {
      directoryName: target.directoryName,
      skillName: target.skillName,
      description: target.description,
      categoryId: target.categoryId,
      category: target.category,
      targets: new Map<ToolKey, ProjectSkillTarget>()
    };
    row.targets.set(target.tool, target);
    byDirectory.set(target.directoryName, row);
  }
  const normalizedQuery = query.trim().toLowerCase();
  return Array.from(byDirectory.values()).filter((row) => {
    const matchesQuery = !normalizedQuery
      || row.skillName.toLowerCase().includes(normalizedQuery)
      || row.directoryName.toLowerCase().includes(normalizedQuery)
      || row.description.toLowerCase().includes(normalizedQuery)
      || row.category.toLowerCase().includes(normalizedQuery);
    const matchesCategory = categoryFilter === "all" || row.categoryId === categoryFilter;
    const statusTargets = statusToolKey ? [row.targets.get(statusToolKey)].filter((target): target is ProjectSkillTarget => Boolean(target)) : Array.from(row.targets.values());
    const matchesStatus = statusFilter === "all" || statusTargets.some((target) => target.status === statusFilter);
    return matchesQuery && matchesCategory && matchesStatus;
  });
}

function projectSkillCategories(targets: ProjectSkillTarget[]) {
  const categories = new Map<string, string>();
  for (const target of targets) {
    categories.set(target.categoryId, target.category);
  }
  return Array.from(categories, ([id, name]) => ({ id, name })).sort((left, right) => {
    if (left.id === "uncategorized") return -1;
    if (right.id === "uncategorized") return 1;
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });
}

function firstToolTarget(rows: ProjectSkillRow[], tool: ToolKey) {
  for (const row of rows) {
    const target = row.targets.get(tool);
    if (target) return target;
  }
  return null;
}

function firstVisibleTarget(rows: ProjectSkillRow[], visibleTools: ToolTarget[]) {
  for (const row of rows) {
    for (const tool of visibleTools) {
      const target = row.targets.get(tool.key);
      if (target) return target;
    }
  }
  return null;
}

function targetKey(target: ProjectSkillTarget) {
  return `${target.directoryName}:${target.tool}`;
}

function primaryActionFor(status: ProjectSkillTargetStatus): { action: ProjectSkillAction; label: string; variant?: "default" | "primary" | "danger"; icon: JSX.Element } | null {
  if (status === "disabled") return { action: "enable", label: "启用", variant: "primary", icon: <Zap size={13} /> };
  if (status === "managed_symlink" || status === "managed_copy") return { action: "disable", label: "停用", variant: "danger", icon: <Trash2 size={13} /> };
  if (status === "stale_copy" || status === "missing_target") return { action: "rebuild", label: "重建", icon: <RotateCw size={13} /> };
  if (status === "conflict") return { action: "use_workbench", label: "接管", variant: "danger", icon: <Wrench size={13} /> };
  return null;
}

function statusLabel(status: ProjectSkillTargetStatus) {
  if (status === "disabled") return "未启用";
  if (status === "managed_symlink" || status === "managed_copy") return "已启用";
  if (status === "stale_copy") return "副本过期";
  if (status === "missing_target") return "目标缺失";
  if (status === "source_missing") return "源缺失";
  if (status === "conflict") return "冲突";
  return "项目缺失";
}

function statusTone(status: ProjectSkillTargetStatus): "neutral" | "accent" | "success" | "danger" | "warning" {
  if (status === "managed_symlink" || status === "managed_copy") return "success";
  if (status === "stale_copy" || status === "missing_target" || status === "source_missing") return "warning";
  if (status === "conflict" || status === "project_missing") return "danger";
  return "neutral";
}

function syncMethodLabel(target: ProjectSkillTarget) {
  if (target.syncMethod === "symlink") return "符号链接";
  if (target.syncMethod === "copy") return "Copy";
  return "未启用";
}

function projectSkillCellHint(target: ProjectSkillTarget) {
  if (target.status === "disabled") return "";
  if (target.syncMethod) return syncMethodLabel(target);
  if (target.status === "missing_target" || target.status === "stale_copy") return "可重建";
  if (target.status === "conflict") return "需处理";
  if (target.status === "source_missing") return "源不可用";
  if (target.status === "project_missing") return "只读";
  return "";
}
