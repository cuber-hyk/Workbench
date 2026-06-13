import { useEffect, useMemo, useState } from "react";
import {
  Box,
  ChevronDown,
  CircleDot,
  Download,
  Edit3,
  FolderOpen,
  Moon,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Sparkles,
  Sun
} from "lucide-react";
import { Button, IconButton, Modal, PageHeader, Panel, SearchInput, TagList } from "./components/ui";
import { workbenchApi } from "./lib/api/workbenchApi";
import type { AppSettings, Project, RadarItem, Skill, ViewKey } from "./lib/types/domain";

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
  const [activeDialog, setActiveDialog] = useState<"project" | "skills-import" | "radar" | null>(null);

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
  const selectedRadar = radarItems.find((item) => item.id === selectedRadarId) ?? radarItems[0];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
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
              <b>Symlink</b>
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
            onSelect={setSelectedSkillId}
            onImport={() => setActiveDialog("skills-import")}
          />
        )}
        {activeView === "radar" && selectedRadar && (
          <RadarView items={radarItems} selectedItem={selectedRadar} onSelect={setSelectedRadarId} onAdd={() => setActiveDialog("radar")} />
        )}
        {activeView === "settings" && settings && (
          <SettingsView settings={settings} theme={theme} onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
        )}
      </main>

      {toast && <div className="toast show">{toast}</div>}
      {activeDialog === "project" && <ProjectDialog onClose={() => setActiveDialog(null)} />}
      {activeDialog === "skills-import" && <SkillsImportDialog onClose={() => setActiveDialog(null)} />}
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
  onSelect,
  onImport
}: {
  skills: Skill[];
  selectedSkill: Skill;
  settings: AppSettings;
  onSelect: (id: string) => void;
  onImport: () => void;
}) {
  return (
    <section className="view">
      <PageHeader
        title="Skills"
        description={`统一根目录 · ${skills.length} 个 Skills`}
        actions={<div className="header-actions"><Button><RefreshCcw size={15} />扫描</Button><Button variant="primary" onClick={onImport}><Download size={15} />导入 Skills</Button></div>}
      />
      <div className="root-bar">
        <span><strong>统一根目录</strong>{settings.skillsRoot}</span>
        <Button><FolderOpen size={15} />打开目录</Button>
      </div>
      <div className="toolbar">
        <SearchInput placeholder="搜索名称或描述" />
        <Button>全部分类<ChevronDown size={14} /></Button>
        <Button>全部启用状态<ChevronDown size={14} /></Button>
      </div>
      <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head skills-grid"><span>Skill</span><span>分类</span><span>全局启用</span><span>项目启用</span></div>
          {skills.map((skill) => (
            <button
              key={skill.id}
              className={`table-row skills-grid ${selectedSkill.id === skill.id ? "selected" : ""}`}
              onClick={() => onSelect(skill.id)}
            >
              <span className="title-cell"><strong>{skill.name}</strong><small>{skill.description}</small></span>
              <TagList tags={[skill.category]} />
              <span className="tool-icons">{skill.enabledTools.map((tool) => <b key={tool}>{toolLabel(tool)}</b>)}</span>
              <span>{skill.enabledProjects.length ? `${skill.enabledProjects.length} 个项目` : "未启用"}</span>
            </button>
          ))}
        </Panel>

        <Panel className="detail-panel">
          <div className="detail-title">
            <div>
              <h2>{selectedSkill.name}</h2>
              <p>分类：{selectedSkill.category}</p>
            </div>
            <Button><FolderOpen size={15} />打开目录</Button>
          </div>
          <p className="description">{selectedSkill.description}</p>
          <div className="setting-group">
            <h3>全局工具启用</h3>
            {settings.toolTargets.map((tool) => (
              <label key={tool.key}>
                <span>{tool.name}<small>{tool.globalSkillsDir}</small></span>
                <input type="checkbox" checked={selectedSkill.enabledTools.includes(tool.key)} readOnly />
                <span className="switch" />
              </label>
            ))}
          </div>
          <div className="setting-group">
            <h3>项目启用</h3>
            {selectedSkill.enabledProjects.length ? selectedSkill.enabledProjects.map((entry) => (
              <label key={`${entry.projectName}-${entry.tool}`}>
                <span>{entry.projectName}<small>{toolLabel(entry.tool)}</small></span>
                <input type="checkbox" checked readOnly />
                <span className="switch" />
              </label>
            )) : <p className="muted">暂未在项目中启用。</p>}
          </div>
          <div className="file-block"><span>SKILL.md</span><code>{selectedSkill.skillPath}</code></div>
          <div className="header-actions"><Button>打开文件</Button><Button>修改分类</Button></div>
        </Panel>
      </div>
    </section>
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
  onThemeToggle
}: {
  settings: AppSettings;
  theme: "light" | "dark";
  onThemeToggle: () => void;
}) {
  return (
    <section className="view">
      <PageHeader title="设置" description="管理本地路径、工具目录与主题" />
      <div className="settings-stack">
        <section className="settings-panel">
          <h2>Skills 存储</h2>
          <p>Workbench Skills 根目录是所有 Skill 的唯一真实来源。</p>
          <div className="settings-row"><span><small>统一 Skills 根目录</small>{settings.skillsRoot}</span><Button>更改</Button></div>
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
          <div className="settings-row"><span><small>数据存储位置</small>{settings.dataDir}</span><Button><FolderOpen size={15} />打开目录</Button></div>
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

function toolLabel(tool: string) {
  if (tool === "claude") return "Cl";
  if (tool === "opencode") return "O";
  return "C";
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

function SkillsImportDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="导入 Skills"
      description="从 ZIP 文件或已解压文件夹导入到统一根目录"
      onClose={onClose}
      large
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary">导入 3 个 Skills</Button></>}
    >
      <div className="source-actions"><Button variant="primary">选择 ZIP 文件</Button><Button>选择文件夹</Button></div>
      <div className="path-box">C:\Users\dev\Downloads\skills-pack.zip</div>
      <div className="dialog-section-title"><strong>发现 4 个可导入 Skills</strong><Button>重新扫描</Button></div>
      <div className="import-list">
        {["database-business-guard", "design-doc-mermaid", "humanizer"].map((skill) => (
          <label key={skill}><input type="checkbox" defaultChecked /><span><strong>{skill}</strong><small>可导入 Skill</small></span><i>可导入</i></label>
        ))}
        <label><input type="checkbox" disabled /><span><strong>security-review</strong><small>统一根目录中已存在同名 Skill</small></span><em>跳过</em></label>
      </div>
      <div className="warning">同名 Skill 不会覆盖或合并。security-review 将跳过导入。</div>
    </Modal>
  );
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
