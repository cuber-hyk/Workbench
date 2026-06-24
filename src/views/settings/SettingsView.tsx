import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Edit3, FolderOpen, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { AppUpdatePanel } from "../../components/AppUpdatePanel";
import { Button, IconButton, PageHeader, StatusBadge } from "../../components/ui";
import { ToolIcon } from "../../lib/ui/toolIcons";
import type { AppSettings, CloseBehavior, ProjectOpenProfile, ToolKey, ToolTarget } from "../../lib/types/domain";
import { closeBehaviorLabel, projectOpenProfileSummary } from "./settingsFormatters";

type SettingsCategory = "general" | "skills" | "tools" | "profiles" | "data" | "behavior" | "appearance";

const settingsCategories: Array<{ key: SettingsCategory; label: string; description: string }> = [
  { key: "general", label: "常规", description: "更新与基础状态" },
  { key: "skills", label: "Skills", description: "统一根目录与映射" },
  { key: "tools", label: "工具目录", description: "全局 Skills 目标" },
  { key: "profiles", label: "项目打开方式", description: "外部工具入口" },
  { key: "data", label: "本地数据", description: "工作台数据位置" },
  { key: "behavior", label: "应用行为", description: "窗口与生命周期" },
  { key: "appearance", label: "外观", description: "主题显示" }
];

export function SettingsView({
  settings,
  theme,
  onOpenUpdateDetails,
  onThemeToggle,
  onRootChange,
  onInspectRootMigration = () => undefined,
  inspectingRootMigration = false,
  onReorderToolTargets,
  onAddCustomTool,
  onEditCustomTool,
  onDeleteCustomTool,
  onCloseBehaviorChange,
  onOpenPath,
  onAddProjectOpenProfile,
  onEditProjectOpenProfile,
  onDeleteProjectOpenProfile
}: {
  settings: AppSettings;
  theme: "light" | "dark";
  onOpenUpdateDetails: () => void;
  onThemeToggle: () => void;
  onRootChange: (path: string) => void;
  onInspectRootMigration?: () => void;
  inspectingRootMigration?: boolean;
  onReorderToolTargets: (toolKeys: ToolKey[]) => void;
  onAddCustomTool: () => void;
  onEditCustomTool: (tool: ToolTarget) => void;
  onDeleteCustomTool: (tool: ToolTarget) => void;
  onCloseBehaviorChange: (behavior: CloseBehavior) => void;
  onOpenPath: (path: string) => void;
  onAddProjectOpenProfile: () => void;
  onEditProjectOpenProfile: (profile: ProjectOpenProfile) => void;
  onDeleteProjectOpenProfile: (profile: ProjectOpenProfile) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("general");

  const moveToolTarget = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= settings.toolTargets.length) return;
    const nextTools = [...settings.toolTargets];
    [nextTools[index], nextTools[nextIndex]] = [nextTools[nextIndex], nextTools[index]];
    onReorderToolTargets(nextTools.map((tool) => tool.key));
  };

  const renderActiveCategory = () => {
    switch (activeCategory) {
      case "general":
        return <GeneralSettings onOpenUpdateDetails={onOpenUpdateDetails} />;
      case "skills":
        return (
          <SkillsStorageSettings
            settings={settings}
            inspectingRootMigration={inspectingRootMigration}
            onInspectRootMigration={onInspectRootMigration}
            onOpenPath={onOpenPath}
            onRootChange={onRootChange}
          />
        );
      case "tools":
        return (
          <ToolDirectorySettings
            settings={settings}
            moveToolTarget={moveToolTarget}
            onAddCustomTool={onAddCustomTool}
            onEditCustomTool={onEditCustomTool}
            onDeleteCustomTool={onDeleteCustomTool}
            onOpenPath={onOpenPath}
          />
        );
      case "profiles":
        return (
          <ProjectOpenProfileSettings
            settings={settings}
            onAddProjectOpenProfile={onAddProjectOpenProfile}
            onEditProjectOpenProfile={onEditProjectOpenProfile}
            onDeleteProjectOpenProfile={onDeleteProjectOpenProfile}
          />
        );
      case "data":
        return <LocalDataSettings settings={settings} onOpenPath={onOpenPath} />;
      case "behavior":
        return <BehaviorSettings settings={settings} onCloseBehaviorChange={onCloseBehaviorChange} />;
      case "appearance":
        return <AppearanceSettings theme={theme} onThemeToggle={onThemeToggle} />;
      default:
        return null;
    }
  };

  return (
    <section className="view">
      <PageHeader title="设置" description="管理 Workbench 的本地路径、工具、行为和更新" />
      <div className="settings-layout">
        <nav className="settings-category-nav" aria-label="设置分类">
          {settingsCategories.map((category) => (
            <button
              key={category.key}
              type="button"
              className={category.key === activeCategory ? "active" : ""}
              aria-pressed={category.key === activeCategory}
              onClick={() => setActiveCategory(category.key)}
            >
              <strong>{category.label}</strong>
              <small>{category.description}</small>
            </button>
          ))}
        </nav>
        <div className="settings-content" aria-live="polite">
          {renderActiveCategory()}
        </div>
      </div>
    </section>
  );
}

function GeneralSettings({ onOpenUpdateDetails }: { onOpenUpdateDetails: () => void }) {
  return (
    <div className="settings-form">
      <SettingsContentHeader title="常规" description="查看软件更新和 Workbench 基础状态。" />
      <AppUpdatePanel onOpenDetails={onOpenUpdateDetails} />
    </div>
  );
}

function SkillsStorageSettings({
  settings,
  inspectingRootMigration,
  onInspectRootMigration,
  onOpenPath,
  onRootChange
}: {
  settings: AppSettings;
  inspectingRootMigration: boolean;
  onInspectRootMigration: () => void;
  onOpenPath: (path: string) => void;
  onRootChange: (path: string) => void;
}) {
  return (
    <div className="settings-form">
      <SettingsContentHeader title="Skills" description="统一管理 Workbench Skills 的真实来源和链接关系。" />
      <SettingsSection title="Skills 存储" description="Workbench Skills 根目录是所有 Skill 的唯一真实来源。">
        <div className="settings-row settings-path-row">
          <div className="settings-path-field">
            <label htmlFor="settings-skills-root">统一 Skills 根目录</label>
            <span className="settings-path-control settings-path-control-with-action">
              <input
                id="settings-skills-root"
                key={settings.skillsRoot}
                defaultValue={settings.skillsRoot}
                onBlur={(event) => {
                  const path = event.target.value.trim();
                  if (path && path !== settings.skillsRoot) onRootChange(path);
                }}
              />
              <IconButton title="打开 Skills 根目录" onClick={() => onOpenPath(settings.skillsRoot)}><FolderOpen size={15} /></IconButton>
              <Button disabled={inspectingRootMigration} onClick={onInspectRootMigration}>
                <RefreshCcw className={inspectingRootMigration ? "spin" : ""} size={15} />
                {inspectingRootMigration ? "检查中" : "检查迁移"}
              </Button>
            </span>
            {settings.previousSkillsRoot && settings.previousSkillsRoot !== settings.skillsRoot && (
              <small>上一个根目录：{settings.previousSkillsRoot}</small>
            )}
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title="Skills 路径映射" description="真实副本、全局链接和项目链接保持单一来源关系。">
        <div className="settings-definition-list">
          <div><small>真实副本</small><strong>{settings.skillsRoot}\\*\\SKILL.md</strong></div>
          <div><small>全局链接</small><strong>工具全局 skills 目录中的符号链接</strong></div>
          <div><small>项目链接</small><strong>受支持项目内工具 skills 目录中的符号链接</strong></div>
        </div>
      </SettingsSection>
      <div className="notice settings-notice">符号链接目标已存在时，Workbench 不会覆盖或删除已有内容。</div>
    </div>
  );
}

function ToolDirectorySettings({
  settings,
  moveToolTarget,
  onAddCustomTool,
  onEditCustomTool,
  onDeleteCustomTool,
  onOpenPath
}: {
  settings: AppSettings;
  moveToolTarget: (index: number, direction: -1 | 1) => void;
  onAddCustomTool: () => void;
  onEditCustomTool: (tool: ToolTarget) => void;
  onDeleteCustomTool: (tool: ToolTarget) => void;
  onOpenPath: (path: string) => void;
}) {
  return (
    <div className="settings-form">
      <SettingsContentHeader
        title="工具目录"
        description="Workbench 通过符号链接为以下工具启用 Skills，展示顺序会影响 Skills 表格的全局工具列。"
        actions={<Button onClick={onAddCustomTool}><Plus size={15} />添加工具</Button>}
      />
      <SettingsSection title="支持的工具目录">
        <div className="settings-table" role="list" aria-label="支持的工具目录">
          {settings.toolTargets.map((tool, index) => (
            <div className="settings-table-row" role="listitem" key={tool.key}>
              <span className="settings-tool-identity">
                <span className="settings-tool-icon"><ToolIcon tool={tool} /></span>
                <span>
                  <strong>{tool.name}</strong>
                  <small>{tool.globalSkillsDir}</small>
                </span>
              </span>
              <span className="settings-row-actions">
                <StatusBadge tone={tool.source === "custom" ? "attention" : "neutral"}>{tool.source === "custom" ? "自定义" : "内置"}</StatusBadge>
                <StatusBadge tone={tool.available ? "accent" : "neutral"}>{tool.available ? "可用" : "不可用"}</StatusBadge>
                <IconButton title={`上移 ${tool.name}`} disabled={index === 0} onClick={() => moveToolTarget(index, -1)}><ArrowUp size={15} /></IconButton>
                <IconButton title={`下移 ${tool.name}`} disabled={index === settings.toolTargets.length - 1} onClick={() => moveToolTarget(index, 1)}><ArrowDown size={15} /></IconButton>
                <IconButton title={`打开 ${tool.name} Skills 目录`} onClick={() => onOpenPath(tool.globalSkillsDir)}><FolderOpen size={15} /></IconButton>
                {tool.source === "custom" && <IconButton title={`编辑 ${tool.name}`} onClick={() => onEditCustomTool(tool)}><Edit3 size={15} /></IconButton>}
                {tool.source === "custom" && <IconButton variant="danger" title={`删除 ${tool.name}`} onClick={() => onDeleteCustomTool(tool)}><Trash2 size={15} /></IconButton>}
              </span>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

function ProjectOpenProfileSettings({
  settings,
  onAddProjectOpenProfile,
  onEditProjectOpenProfile,
  onDeleteProjectOpenProfile
}: {
  settings: AppSettings;
  onAddProjectOpenProfile: () => void;
  onEditProjectOpenProfile: (profile: ProjectOpenProfile) => void;
  onDeleteProjectOpenProfile: (profile: ProjectOpenProfile) => void;
}) {
  return (
    <div className="settings-form">
      <SettingsContentHeader
        title="项目打开方式"
        description="配置项目列表中的“用工具打开”菜单。命令会优先使用 PATH，也可以选择 exe 作为兜底。"
        actions={<Button onClick={onAddProjectOpenProfile}><Plus size={15} />添加</Button>}
      />
      <SettingsSection title="打开方式">
        {settings.projectOpenProfiles.length > 0 ? (
          <div className="settings-table" role="list" aria-label="项目打开方式">
            {settings.projectOpenProfiles.map((profile) => (
              <div className="settings-table-row" role="listitem" key={profile.id}>
                <span>
                  <strong>{profile.name}</strong>
                  <small>{projectOpenProfileSummary(profile)}</small>
                </span>
                <span className="settings-row-actions">
                  <StatusBadge tone={profile.enabled ? "accent" : "neutral"}>{profile.enabled ? "启用" : "停用"}</StatusBadge>
                  <StatusBadge tone={profile.kind === "terminal" ? "attention" : "neutral"}>{profile.kind === "terminal" ? "终端" : "应用"}</StatusBadge>
                  <IconButton title={`编辑 ${profile.name}`} onClick={() => onEditProjectOpenProfile(profile)}><Edit3 size={15} /></IconButton>
                  <IconButton variant="danger" title={`删除 ${profile.name}`} onClick={() => onDeleteProjectOpenProfile(profile)}><Trash2 size={15} /></IconButton>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <strong>暂无打开方式</strong>
            <small>添加 VS Code、Trae 或 Claude Code 等工具后，可以从项目列表快速打开。</small>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function LocalDataSettings({ settings, onOpenPath }: { settings: AppSettings; onOpenPath: (path: string) => void }) {
  return (
    <div className="settings-form">
      <SettingsContentHeader title="本地数据" description="项目、分类和资源 Radar 数据保存在系统应用数据目录。" />
      <SettingsSection title="数据位置">
        <div className="settings-row">
          <span><small>Workbench 根目录</small>{settings.workbenchRoot}</span>
          <IconButton title="打开 Workbench 根目录" onClick={() => onOpenPath(settings.workbenchRoot)}><FolderOpen size={15} /></IconButton>
        </div>
        <div className="settings-row">
          <span><small>SQLite 数据库</small>{settings.workbenchRoot}\\workbench.sqlite</span>
          <IconButton title="打开数据库所在目录" onClick={() => onOpenPath(settings.workbenchRoot)}><FolderOpen size={15} /></IconButton>
        </div>
      </SettingsSection>
    </div>
  );
}

function BehaviorSettings({
  settings,
  onCloseBehaviorChange
}: {
  settings: AppSettings;
  onCloseBehaviorChange: (behavior: CloseBehavior) => void;
}) {
  return (
    <div className="settings-form">
      <SettingsContentHeader title="应用行为" description="控制窗口关闭时的处理方式。" />
      <SettingsSection title="窗口">
        <div className="settings-row">
          <span><small>关闭窗口时</small><strong>{closeBehaviorLabel(settings.closeBehavior)}</strong></span>
          <select
            aria-label="关闭窗口时"
            className="settings-select"
            value={settings.closeBehavior}
            onChange={(event) => onCloseBehaviorChange(event.target.value as CloseBehavior)}
          >
            <option value="hide_to_tray">隐藏到托盘</option>
            <option value="exit">退出应用</option>
          </select>
        </div>
      </SettingsSection>
    </div>
  );
}

function AppearanceSettings({ theme, onThemeToggle }: { theme: "light" | "dark"; onThemeToggle: () => void }) {
  return (
    <div className="settings-form">
      <SettingsContentHeader title="外观" description="切换 Workbench 的浅色或深色界面。" />
      <SettingsSection title="主题">
        <div className="settings-row">
          <span><small>当前主题</small><strong>{theme === "dark" ? "深色主题" : "浅色主题"}</strong></span>
          <Button onClick={onThemeToggle}>切换主题</Button>
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingsContentHeader({
  title,
  description,
  actions
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="settings-content-header">
      <span>
        <h2>{title}</h2>
        <p>{description}</p>
      </span>
      {actions}
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-title">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}
