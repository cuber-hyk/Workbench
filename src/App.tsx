import { useEffect, useMemo, useState } from "react";
import {
  Box,
  ChevronDown,
  CircleDot,
  Download,
  Edit3,
  FileText,
  FolderOpen,
  Moon,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Sparkles,
  Sun,
  Trash2
} from "lucide-react";
import { Button, IconButton, Modal, PageHeader, Panel, SearchInput, TagList } from "./components/ui";
import { workbenchApi } from "./lib/api/workbenchApi";
import type { AppSettings, ImportResult, Project, RadarItem, Skill, SkillVersionSource, ToolTarget, ViewKey } from "./lib/types/domain";

const views: Array<{ key: ViewKey; label: string; icon: JSX.Element }> = [
  { key: "projects", label: "项目", icon: <Box size={16} /> },
  { key: "skills", label: "Skills", icon: <Sparkles size={16} /> },
  { key: "radar", label: "AI Radar", icon: <CircleDot size={16} /> },
  { key: "settings", label: "设置", icon: <Settings size={16} /> }
];

export function App() {
  const [activeView, setActiveView] = useState<ViewKey>("projects");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("workbench-theme") as "light" | "dark") || "light";
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [radarItems, setRadarItems] = useState<RadarItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("workbench");
  const [selectedSkillId, setSelectedSkillId] = useState("security-review");
  const [selectedRadarId, setSelectedRadarId] = useState("mcp");
  const [toast, setToast] = useState("");
  const [activeDialog, setActiveDialog] = useState<"project" | "skills-import" | "skill-delete" | "radar" | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [deleteSkillId, setDeleteSkillId] = useState("");

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("workbench-theme", theme);
  }, [theme]);

  useEffect(() => {
    void Promise.all([
      workbenchApi.listProjects().then(setProjects),
      workbenchApi.listSkills().then(setSkills),
      workbenchApi.listRadarItems().then(setRadarItems),
      workbenchApi.getSettings().then(setSettings)
    ]);
  }, []);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) ?? skills[0];
  const deleteSkill = skills.find((skill) => skill.id === deleteSkillId) ?? selectedSkill;
  const selectedRadar = radarItems.find((item) => item.id === selectedRadarId) ?? radarItems[0];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  async function refreshSkills() {
    const state = await workbenchApi.getSkillsState();
    setSkills(state.skills);
    setSettings(state.settings);
    if (!state.skills.some((skill) => skill.id === selectedSkillId)) {
      setSelectedSkillId(state.skills[0]?.id ?? "");
    }
  }

  async function runSkillAction(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      await refreshSkills();
      showToast(success);
    } catch (error) {
      showToast(String(error));
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <strong>Workbench</strong>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {views.map((view) => (
            <button
              key={view.key}
              className={`nav-item ${activeView === view.key ? "active" : ""}`}
              onClick={() => setActiveView(view.key)}
            >
              {view.icon}
              {view.label}
            </button>
          ))}
        </nav>

        <section className="local-strip" aria-label="本机工作区状态">
          <strong>本机工作区</strong>
          <div>
            <span>
              <b>SQLite</b>
              <small>本地数据</small>
            </span>
            <span>
              <b>Auto</b>
              <small>Skills 启用</small>
            </span>
            <span>
              <b>Tauri</b>
              <small>桌面壳</small>
            </span>
          </div>
        </section>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {theme === "dark" ? "深色主题" : "浅色主题"}
          </button>
          <div className="local-status">
            <span className="status-dot" />
            <span>本地模式</span>
          </div>
        </div>
      </aside>

      <main className="main">
        {activeView === "projects" && selectedProject && (
          <ProjectsView
            projects={projects}
            selectedProject={selectedProject}
            onSelect={setSelectedProjectId}
            onLaunch={() => showToast("已在新的系统终端窗口中启动项目")}
            onAdd={() => setActiveDialog("project")}
          />
        )}
        {activeView === "skills" && selectedSkill && settings && (
          <SkillsView
            skills={skills}
            selectedSkill={selectedSkill}
            settings={settings}
            projects={projects}
            onSelect={setSelectedSkillId}
            onImport={async (kind) => {
              try {
                const source = await workbenchApi.selectSkillImportSource(kind);
                if (!source) return;
                const results =
                  kind === "zip"
                    ? await workbenchApi.importSkillsFromZip(source)
                    : await workbenchApi.importSkillsFromFolder(source);
                setImportResults(results);
                setActiveDialog("skills-import");
                await refreshSkills();
              } catch (error) {
                showToast(String(error));
              }
            }}
            onRefresh={() => void runSkillAction(refreshSkills, "Skills 已重新扫描")}
            onToggle={(tool, enabled, project) =>
              void runSkillAction(
                () =>
                  workbenchApi.setSkillEnabled(
                    selectedSkill.directoryName,
                    tool,
                    enabled,
                    project ? "project" : "global",
                    project?.name,
                    project?.path
                  ),
                enabled ? "Skill 已启用" : "Skill 已停用"
              )
            }
            onToggleSkillGlobal={(directoryName, tool, enabled) =>
              void runSkillAction(
                () => workbenchApi.setSkillEnabled(directoryName, tool, enabled, "global"),
                enabled ? "Skill 已启用" : "Skill 已停用"
              )
            }
            onToggleProjectAll={(project, enabled) =>
              void runSkillAction(
                () =>
                  Promise.all(
                    settings.toolTargets
                      .filter((tool) => {
                        const isEnabled = selectedSkill.enabledProjects.some(
                          (entry) => entry.projectPath === project.path && entry.tool === tool.key
                        );
                        return enabled ? !isEnabled : isEnabled;
                      })
                      .map((tool) =>
                        workbenchApi.setSkillEnabled(
                          selectedSkill.directoryName,
                          tool.key,
                          enabled,
                          "project",
                          project.name,
                          project.path
                        )
                      )
                  ),
                enabled ? "项目工具已全部启用" : "项目工具已全部关闭"
              )
            }
            onCategory={(category) =>
              void runSkillAction(
                () => workbenchApi.setSkillCategory(selectedSkill.directoryName, category),
                "分类已更新"
              )
            }
            onCategorySkill={(directoryName, category) =>
              void runSkillAction(
                () => workbenchApi.setSkillCategory(directoryName, category),
                "分类已更新"
              )
            }
            onResolve={(source) =>
              void runSkillAction(
                () =>
                  workbenchApi.resolveSkillConflict(
                    selectedSkill.directoryName,
                    source
                  ),
                "冲突已统一解决并完成备份"
              )
            }
            onDeleteSkill={(skillId) => {
              setDeleteSkillId(skillId);
              setActiveDialog("skill-delete");
            }}
          />
        )}
        {activeView === "radar" && selectedRadar && (
          <RadarView items={radarItems} selectedItem={selectedRadar} onSelect={setSelectedRadarId} onAdd={() => setActiveDialog("radar")} />
        )}
        {activeView === "settings" && settings && (
          <SettingsView
            settings={settings}
            theme={theme}
            onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
            onRootChange={(path) => void runSkillAction(() => workbenchApi.setSkillsRoot(path), "Skills 根目录已更新")}
          />
        )}
      </main>

      {toast && <div className="toast show">{toast}</div>}
      {activeDialog === "project" && <ProjectDialog onClose={() => setActiveDialog(null)} />}
      {activeDialog === "skills-import" && (
        <SkillsImportDialog
          results={importResults}
          skillsRoot={settings?.skillsRoot ?? ""}
          onClose={() => {
            setActiveDialog(null);
            setImportResults([]);
          }}
        />
      )}
      {activeDialog === "skill-delete" && deleteSkill && (
        <DeleteSkillDialog
          skill={deleteSkill}
          onClose={() => {
            setActiveDialog(null);
            setDeleteSkillId("");
          }}
          onConfirm={() => {
            setActiveDialog(null);
            const target = deleteSkill;
            setDeleteSkillId("");
            void runSkillAction(() => workbenchApi.deleteSkill(target.directoryName), "Skill 已删除");
          }}
        />
      )}
      {activeDialog === "radar" && <RadarDialog onClose={() => setActiveDialog(null)} />}
    </div>
  );
}

function ProjectsView({
  projects,
  selectedProject,
  onSelect,
  onLaunch,
  onAdd
}: {
  projects: Project[];
  selectedProject: Project;
  onSelect: (id: string) => void;
  onLaunch: () => void;
  onAdd: () => void;
}) {
  return (
    <section className="view">
      <PageHeader title="项目" description="管理本地开发项目并快速启动" actions={<Button variant="primary" onClick={onAdd}><Plus size={15} />添加项目</Button>} />
      <div className="toolbar">
        <SearchInput placeholder="搜索项目名称或路径" />
        <Button>全部标签<ChevronDown size={14} /></Button>
      </div>
      <div className="split-layout">
        <Panel className="list-panel card-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`row-card ${selectedProject.id === project.id ? "selected" : ""}`}
              onClick={() => onSelect(project.id)}
            >
              <span className="row-main">
                <strong>{project.name}</strong>
                <i>{project.status === "missing-command" ? "未配置命令" : project.status === "reference" ? "参考项目" : "已配置启动"}</i>
              </span>
              <span className="meta-line">
                {project.path} {project.launchCommand && <code>cmd: {project.launchCommand}</code>}
              </span>
              <TagList tags={project.tags} />
            </button>
          ))}
        </Panel>

        <Panel className="detail-panel">
          <div className="detail-title">
            <div>
              <h2>{selectedProject.name}</h2>
              <p>{selectedProject.note}</p>
            </div>
            <IconButton title="编辑"><Edit3 size={15} /></IconButton>
          </div>
          <Button full><FolderOpen size={15} />打开目录</Button>
          <div className="form-grid">
            <label>项目路径<input value={selectedProject.path} readOnly /></label>
            <label>标签<input value={selectedProject.tags.join(", ")} readOnly /></label>
            <label>启动命令<input value={selectedProject.launchCommand || "未配置"} readOnly /></label>
            <label>启动工作目录<input value={selectedProject.launchWorkdir} readOnly /></label>
            <label className="full">备注<textarea rows={4} value={selectedProject.note} readOnly /></label>
          </div>
          <div className="command-box">
            <span>在新的系统终端窗口执行：<code>{selectedProject.launchCommand || "未配置启动命令"}</code></span>
            <Button variant="primary" onClick={onLaunch} disabled={!selectedProject.launchCommand}><Play size={15} />启动</Button>
          </div>
          <div className="boundary-note">
            <span className="status-dot" />
            <p>Workbench 不捕获日志，也不停止或重启进程；重复启动由用户在系统终端中自行处理。</p>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function SkillsView({
  skills,
  selectedSkill,
  settings,
  projects,
  onSelect,
  onImport,
  onRefresh,
  onToggle,
  onToggleSkillGlobal,
  onToggleProjectAll,
  onCategory,
  onCategorySkill,
  onResolve,
  onDeleteSkill
}: {
  skills: Skill[];
  selectedSkill: Skill;
  settings: AppSettings;
  projects: Project[];
  onSelect: (id: string) => void;
  onImport: (kind: "zip" | "folder") => Promise<void>;
  onRefresh: () => void;
  onToggle: (tool: ToolTarget["key"], enabled: boolean, project?: Project) => void;
  onToggleSkillGlobal: (directoryName: string, tool: ToolTarget["key"], enabled: boolean) => void;
  onToggleProjectAll: (project: Project, enabled: boolean) => void;
  onCategory: (category: string) => void;
  onCategorySkill: (directoryName: string, category: string) => void;
  onResolve: (source: SkillVersionSource) => void;
  onDeleteSkill: (skillId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部分类");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const categories = ["全部分类", ...Array.from(new Set(skills.map((skill) => skill.category))).sort()];
  const visibleSkills = skills.filter((skill) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery);
    const matchesCategory = categoryFilter === "全部分类" || skill.category === categoryFilter;
    const matchesStatus = skillMatchesStatusFilter(skill, statusFilter);
    return matchesQuery && matchesCategory && matchesStatus;
  });

  return (
    <section className="view">
      <PageHeader
        title="Skills"
        description={`统一根目录 · ${skills.length} 个 Skills`}
        actions={
          <div className="header-actions">
            <Button onClick={onRefresh}><RefreshCcw size={15} />扫描</Button>
            <div className="import-control">
              <Button variant="primary" onClick={() => setImportMenuOpen(!importMenuOpen)}>
                <Download size={15} />导入 Skills<ChevronDown size={14} />
              </Button>
              {importMenuOpen && (
                <div className="import-menu">
                  <button onClick={() => { setImportMenuOpen(false); void onImport("zip"); }}>选择 ZIP 文件</button>
                  <button onClick={() => { setImportMenuOpen(false); void onImport("folder"); }}>选择已解压文件夹</button>
                </div>
              )}
            </div>
          </div>
        }
      />
      <div className="root-bar">
        <span><strong>统一根目录</strong>{settings.skillsRoot}</span>
        <Button onClick={() => void workbenchApi.openLocalPath(settings.skillsRoot)}><FolderOpen size={15} />打开目录</Button>
      </div>
      <div className="toolbar">
        <SearchInput placeholder="搜索名称或描述" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option>全部状态</option>
          <option>已启用</option>
          <option>内容冲突</option>
          <option>未启用</option>
        </select>
      </div>
      <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head skills-grid"><span>Skill</span><span>分类</span><span>全局启用</span><span>项目启用</span><span>操作</span></div>
          {visibleSkills.map((skill) => (
            <div
              key={skill.id}
              className={`table-row skills-grid ${selectedSkill.id === skill.id ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(skill.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(skill.id);
              }}
            >
              <span className="title-cell"><strong>{skill.name}</strong><small>{skill.description}</small></span>
              <InlineCategory
                category={skill.category}
                onSave={(category) => onCategorySkill(skill.directoryName, category)}
              />
              <GlobalToolIcons
                skill={skill}
                tools={settings.toolTargets}
                onToggle={(tool, enabled) => onToggleSkillGlobal(skill.directoryName, tool, enabled)}
              />
              <span>{skill.enabledProjects.length ? `${skill.enabledProjects.length} 个项目` : "未启用"}</span>
              <span className="row-actions">
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
                  className="danger-icon"
                  title="删除 Skill"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteSkill(skill.id);
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </span>
            </div>
          ))}
        </Panel>

        <Panel className="detail-panel">
          <div className="detail-title">
            <div>
              <h2>{selectedSkill.name}</h2>
              <p>分类：{selectedSkill.category}</p>
            </div>
          </div>
          <p className="description">{selectedSkill.description}</p>
          {selectedSkill.globalToolStates.some((state) => state.status === "conflict") && (
            <SkillConflictPanel skill={selectedSkill} settings={settings} onResolve={onResolve} />
          )}
          <div className="setting-group">
            <h3>项目启用</h3>
            {projects.map((project) => (
              <div className="project-skill-row" key={project.id}>
                <div className="project-skill-head">
                  <span><strong>{project.name}</strong><small>{project.path}</small></span>
                  <SwitchControl
                    checked={settings.toolTargets.every((tool) =>
                      selectedSkill.enabledProjects.some(
                        (entry) => entry.projectPath === project.path && entry.tool === tool.key
                      )
                    )}
                    onChange={(enabled) => onToggleProjectAll(project, enabled)}
                    title={`${project.name} 全部工具启用`}
                  />
                </div>
                <div className="project-tool-toggles">
                  {settings.toolTargets.map((tool) => {
                    const enablement = selectedSkill.enabledProjects.find(
                      (entry) => entry.projectPath === project.path && entry.tool === tool.key
                    );
                    const enabled = Boolean(enablement);
                    return (
                      <label key={tool.key} title={`${project.name} · ${tool.name}`}>
                        <small>{tool.name}{enablement ? ` · ${syncMethodLabel(enablement.syncMethod)}` : ""}</small>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) => onToggle(tool.key, event.target.checked, project)}
                        />
                        <span className="switch" />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="file-block"><span>SKILL.md</span><code>{selectedSkill.skillPath}</code></div>
          <label className="category-field">
            <span>分类</span>
            <input
              key={`${selectedSkill.id}-${selectedSkill.category}`}
              defaultValue={selectedSkill.category}
              onBlur={(event) => {
                const category = event.target.value.trim() || "未分类";
                if (category !== selectedSkill.category) onCategory(category);
              }}
              placeholder="例如：文档"
            />
          </label>
        </Panel>
      </div>
    </section>
  );
}

function SwitchControl({
  checked,
  onChange,
  title
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <label className="switch-control" title={title}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch" />
    </label>
  );
}

function GlobalToolIcons({
  skill,
  tools,
  onToggle
}: {
  skill: Skill;
  tools: ToolTarget[];
  onToggle: (tool: ToolTarget["key"], enabled: boolean) => void;
}) {
  return (
    <span className="tool-icons">
      {tools.map((tool) => {
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
            <ToolIcon tool={tool.key} />
          </button>
        );
      })}
    </span>
  );
}

function InlineCategory({
  category,
  onSave
}: {
  category: string;
  onSave: (category: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(category);

  useEffect(() => {
    setValue(category);
  }, [category]);

  function save() {
    const next = value.trim() || "未分类";
    setEditing(false);
    if (next !== category) onSave(next);
  }

  if (editing) {
    return (
      <input
        className="inline-category-input"
        autoFocus
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            setValue(category);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      className="inline-category-tag"
      title="双击编辑分类"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {category}
    </button>
  );
}

function SkillConflictPanel({
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
        <b className="status-badge conflict">内容冲突</b>
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

function RadarView({
  items,
  selectedItem,
  onSelect,
  onAdd
}: {
  items: RadarItem[];
  selectedItem: RadarItem;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const categories = useMemo(() => ["全部分类", "项目", "资讯", "论文", "其他"], []);
  return (
    <section className="view">
      <PageHeader title="AI Radar" description={`${items.length} 条本地记录`} actions={<Button variant="primary" onClick={onAdd}><Plus size={15} />添加条目</Button>} />
      <div className="toolbar">
        <SearchInput placeholder="搜索名称、标签或备注" />
        <Button>{categories[0]}<ChevronDown size={14} /></Button>
        <Button>全部标签<ChevronDown size={14} /></Button>
        <Button>☆ 仅收藏</Button>
      </div>
      <div className="split-layout">
        <Panel className="list-panel card-list">
          {items.map((item) => (
            <button key={item.id} className={`row-card ${selectedItem.id === item.id ? "selected" : ""}`} onClick={() => onSelect(item.id)}>
              <span className="row-main"><strong>{item.name}</strong><i>{item.favorite ? "★ 已收藏" : "☆"}</i></span>
              <span className="meta-line">{item.category} · {item.tags.join(" · ")} · {item.updatedAt}</span>
              <p>{item.note}</p>
            </button>
          ))}
        </Panel>
        <Panel className="detail-panel">
          <div className="detail-title">
            <div>
              <h2>{selectedItem.name}</h2>
              <p>{selectedItem.category} · {selectedItem.favorite ? "已收藏" : "未收藏"}</p>
            </div>
            <Button>打开链接</Button>
          </div>
          <div className="form-grid">
            <label>名称<input value={selectedItem.name} readOnly /></label>
            <label>分类<input value={selectedItem.category} readOnly /></label>
            <label className="full">链接<input value={selectedItem.url} readOnly /></label>
            <label>标签<input value={selectedItem.tags.join(", ")} readOnly /></label>
            <label>更新时间<input value={selectedItem.updatedAt} readOnly /></label>
            <label className="full">备注<textarea rows={5} value={selectedItem.note} readOnly /></label>
          </div>
          <Button>编辑条目</Button>
        </Panel>
      </div>
    </section>
  );
}

function SettingsView({
  settings,
  theme,
  onThemeToggle,
  onRootChange
}: {
  settings: AppSettings;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  onRootChange: (path: string) => void;
}) {
  return (
    <section className="view">
      <PageHeader title="设置" description="管理本地路径、工具目录与主题" />
      <div className="settings-stack">
        <section className="settings-panel">
          <h2>Skills 存储</h2>
          <p>Workbench Skills 根目录是所有 Skill 的唯一真实来源。</p>
          <div className="settings-row">
            <label className="settings-path-field">
              <small>统一 Skills 根目录</small>
              <input
                key={settings.skillsRoot}
                defaultValue={settings.skillsRoot}
                onBlur={(event) => {
                  const path = event.target.value.trim();
                  if (path && path !== settings.skillsRoot) onRootChange(path);
                }}
              />
            </label>
          </div>
        </section>
        <section className="settings-panel">
          <h2>支持的工具目录</h2>
          <p>Workbench 通过符号链接为以下工具启用 Skills。</p>
          {settings.toolTargets.map((tool) => (
            <div className="settings-row" key={tool.key}>
              <span><strong>{tool.name}</strong><small>{tool.globalSkillsDir}</small></span>
              <i className="available">{tool.available ? "可用" : "不可用"}</i>
            </div>
          ))}
        </section>
        <section className="settings-panel">
          <h2>Skills 路径映射</h2>
          <p>真实副本、全局链接和项目链接保持单一来源关系。</p>
          <div className="path-map">
            <div><small>真实副本</small><strong>{settings.skillsRoot}\\*\\SKILL.md</strong></div>
            <div><small>全局链接</small><strong>工具全局 skills 目录中的符号链接</strong></div>
            <div><small>项目链接</small><strong>受支持项目内工具 skills 目录中的符号链接</strong></div>
          </div>
        </section>
        <section className="settings-panel">
          <h2>本地数据</h2>
          <p>项目、分类和 AI Radar 数据保存在系统应用数据目录。</p>
          <div className="settings-row"><span><small>数据存储位置</small>{settings.workbenchRoot}</span></div>
        </section>
        <section className="settings-panel">
          <h2>主题背景</h2>
          <p>切换 Workbench 的浅色或深色界面。</p>
          <div className="settings-row"><span><small>当前主题</small><strong>{theme === "dark" ? "深色主题" : "浅色主题"}</strong></span><Button onClick={onThemeToggle}>切换主题</Button></div>
        </section>
        <div className="notice">符号链接目标已存在时，Workbench 不会覆盖或删除已有内容。</div>
      </div>
    </section>
  );
}

function ToolIcon({ tool }: { tool: ToolTarget["key"] }) {
  if (tool === "claude") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
      </svg>
    );
  }
  if (tool === "opencode") {
    return (
      <svg viewBox="0 0 240 300" aria-hidden="true">
        <path d="M180 240H60V120H180V240Z" />
        <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954l4.572-2.604a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763l4.571 2.608c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41v5.212a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773l-4.572-2.608a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954l-4.571 2.603a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z" />
    </svg>
  );
}

function ProjectDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="添加项目"
      description="记录本地项目路径和启动方式"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary">添加项目</Button></>}
    >
      <div className="dialog-form">
        <label>项目路径<input defaultValue="E:\\Development\\NewProject" /></label>
        <label>项目名称<input defaultValue="NewProject" /></label>
        <label>启动命令<input placeholder="例如 pnpm dev" /></label>
        <label>启动工作目录<input placeholder="默认使用项目路径" /></label>
      </div>
    </Modal>
  );
}

function SkillsImportDialog({
  results,
  skillsRoot,
  onClose
}: {
  results: ImportResult[];
  skillsRoot: string;
  onClose: () => void;
}) {
  const importedCount = results.filter((result) => result.status === "imported").length;
  const conflictCount = results.filter((result) => result.status === "conflict").length;
  const invalidCount = results.filter((result) => result.status === "invalid").length;
  return (
    <Modal
      title="导入 Skills"
      description="从 ZIP 文件或已解压文件夹导入到统一根目录"
      onClose={onClose}
      large
      footer={
        <>
          <Button onClick={() => void workbenchApi.openLocalPath(skillsRoot)}><FolderOpen size={15} />打开统一根目录</Button>
          <Button variant="primary" onClick={onClose}>完成</Button>
        </>
      }
    >
      {results.length > 0 && (
        <>
          <div className="import-summary">
            <strong>导入完成</strong>
            <span>成功 {importedCount} 个 · 跳过 {conflictCount} 个 · 无效 {invalidCount} 个</span>
          </div>
          <div className="import-list">
            {results.map((result) => (
              <div className={`import-result ${result.status}`} key={result.directoryName}>
                <span><strong>{result.directoryName}</strong><small>{result.message}</small></span>
                <i>{importStatusLabel(result.status)}</i>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="warning">同名 Skill 会跳过；导入来源保持不变。已导入的 Skills 默认不会自动启用。</div>
    </Modal>
  );
}

function importStatusLabel(status: ImportResult["status"]) {
  if (status === "imported") return "已导入";
  if (status === "invalid") return "无效";
  return "已跳过";
}

function DeleteSkillDialog({
  skill,
  onClose,
  onConfirm
}: {
  skill: Skill;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="删除 Skill"
      description={`确认删除 ${skill.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button className="danger" onClick={onConfirm}>删除 Skill</Button>
        </>
      }
    >
      <div className="delete-summary">
        <p>将删除统一根目录中的 Skill，并清理 Workbench 管理的全局和项目启用记录。</p>
        <div className="file-block">
          <span>目录</span>
          <code>{skill.skillPath.replace(/[\\/][^\\/]+$/, "")}</code>
        </div>
        <div className="warning">不会删除未被 Workbench 管理的外部工具目录内容。</div>
      </div>
    </Modal>
  );
}

function syncMethodLabel(method: "symlink" | "copy") {
  return method === "symlink" ? "Symlink" : "Copy";
}

function skillMatchesStatusFilter(skill: Skill, filter: string) {
  if (filter === "全部状态") return true;
  const hasGlobalManaged = skill.globalToolStates.some((state) => state.status === "managed");
  const hasConflict = skill.globalToolStates.some((state) => state.status === "conflict");
  const hasProjectEnablement = skill.enabledProjects.length > 0;
  const enabled = hasGlobalManaged || hasProjectEnablement;
  if (filter === "已启用") return enabled;
  if (filter === "内容冲突") return hasConflict;
  if (filter === "未启用") return !enabled && !hasConflict;
  return true;
}

function globalStatusLabel(
  state: Skill["globalToolStates"][number] | undefined
) {
  if (!state || state.status === "disabled") return "未启用";
  if (state.status === "conflict") return "内容冲突";
  return `Workbench 管理 · ${syncMethodLabel(state.syncMethod ?? "copy")}`;
}

function RadarDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="添加 Radar 条目"
      description="手动记录本地 AI 信息条目"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary">添加条目</Button></>}
    >
      <div className="dialog-form">
        <label>名称<input placeholder="条目名称" /></label>
        <label>分类<select defaultValue="项目"><option>项目</option><option>资讯</option><option>论文</option><option>其他</option></select></label>
        <label>链接<input placeholder="https://" /></label>
        <label>标签<input placeholder="使用逗号分隔" /></label>
        <label>备注<textarea rows={4} /></label>
      </div>
    </Modal>
  );
}
