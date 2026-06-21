import { ArrowDown, ArrowUp, Edit3, FolderOpen, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { AppUpdatePanel } from "../../components/AppUpdatePanel";
import { Button, IconButton, PageHeader, StatusBadge } from "../../components/ui";
import { ToolIcon } from "../../lib/ui/toolIcons";
import type { AppSettings, CloseBehavior, ProjectOpenProfile, ToolKey, ToolTarget } from "../../lib/types/domain";
import { closeBehaviorLabel, projectOpenProfileSummary } from "./settingsFormatters";

export function SettingsView({
  settings,
  theme,
  onOpenUpdateDetails,
  onThemeToggle,
  onRootChange,
  onInspectRootMigration = () => undefined,
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
  const moveToolTarget = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= settings.toolTargets.length) return;
    const nextTools = [...settings.toolTargets];
    [nextTools[index], nextTools[nextIndex]] = [nextTools[nextIndex], nextTools[index]];
    onReorderToolTargets(nextTools.map((tool) => tool.key));
  };

  return (
    <section className="view">
      <PageHeader title="设置" description="管理本地路径、工具目录与主题" />
      <div className="settings-stack">
        <AppUpdatePanel onOpenDetails={onOpenUpdateDetails} />
        <section className="settings-panel">
          <h2>Skills 存储</h2>
          <p>Workbench Skills 根目录是所有 Skill 的唯一真实来源。</p>
          <div className="settings-row path-setting-row">
            <div className="settings-path-field">
              <label htmlFor="settings-skills-root">统一 Skills 根目录</label>
              <span className="settings-path-control">
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
              </span>
              {settings.previousSkillsRoot && settings.previousSkillsRoot !== settings.skillsRoot && (
                <small>上一个根目录：{settings.previousSkillsRoot}</small>
              )}
            </div>
            <span className="settings-row-actions">
              <Button onClick={onInspectRootMigration}><RefreshCcw size={15} />检查迁移</Button>
            </span>
          </div>
        </section>
        <section className="settings-panel">
          <div className="settings-panel-title">
            <span>
              <h2>支持的工具目录</h2>
              <p>Workbench 通过符号链接为以下工具启用 Skills，展示顺序会影响 Skills 表格的全局工具列。</p>
            </span>
            <Button onClick={onAddCustomTool}><Plus size={15} />添加工具</Button>
          </div>
          {settings.toolTargets.map((tool, index) => (
            <div className="settings-row" key={tool.key}>
              <span className="settings-tool-identity">
                <span className="settings-tool-icon"><ToolIcon tool={tool} /></span>
                <span>
                  <strong>{tool.name}</strong>
                  <small>{tool.globalSkillsDir}</small>
                </span>
              </span>
              <span className="settings-row-actions">
                <StatusBadge tone={tool.source === "custom" ? "attention" : "neutral"}>{tool.source === "custom" ? "自定义" : "内置"}</StatusBadge>
                <IconButton title={`上移 ${tool.name}`} disabled={index === 0} onClick={() => moveToolTarget(index, -1)}><ArrowUp size={15} /></IconButton>
                <IconButton title={`下移 ${tool.name}`} disabled={index === settings.toolTargets.length - 1} onClick={() => moveToolTarget(index, 1)}><ArrowDown size={15} /></IconButton>
                <IconButton title={`打开 ${tool.name} Skills 目录`} onClick={() => onOpenPath(tool.globalSkillsDir)}><FolderOpen size={15} /></IconButton>
                {tool.source === "custom" && <IconButton title={`编辑 ${tool.name}`} onClick={() => onEditCustomTool(tool)}><Edit3 size={15} /></IconButton>}
                {tool.source === "custom" && <IconButton variant="danger" title={`删除 ${tool.name}`} onClick={() => onDeleteCustomTool(tool)}><Trash2 size={15} /></IconButton>}
                <StatusBadge tone={tool.available ? "accent" : "neutral"}>{tool.available ? "可用" : "不可用"}</StatusBadge>
              </span>
            </div>
          ))}
        </section>
        <section className="settings-panel">
          <div className="settings-panel-title">
            <span>
              <h2>项目打开方式</h2>
              <p>配置项目列表中的“用工具打开”菜单。命令会优先使用 PATH，也可以选择 exe 作为兜底。</p>
            </span>
            <Button onClick={onAddProjectOpenProfile}><Plus size={15} />添加</Button>
          </div>
          {settings.projectOpenProfiles.map((profile) => (
            <div className="settings-row" key={profile.id}>
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
          {settings.projectOpenProfiles.length === 0 && (
            <div className="empty-state compact-empty">
              <strong>暂无打开方式</strong>
              <small>添加 VS Code、Trae 或 Claude Code 等工具后，可从项目列表快速打开。</small>
            </div>
          )}
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
          <p>项目、分类和资源 Radar 数据保存在系统应用数据目录。</p>
          <div className="settings-row">
            <span><small>Workbench 根目录</small>{settings.workbenchRoot}</span>
            <IconButton title="打开 Workbench 根目录" onClick={() => onOpenPath(settings.workbenchRoot)}><FolderOpen size={15} /></IconButton>
          </div>
          <div className="settings-row">
            <span><small>SQLite 数据库</small>{settings.workbenchRoot}\\workbench.sqlite</span>
            <IconButton title="打开数据库所在目录" onClick={() => onOpenPath(settings.workbenchRoot)}><FolderOpen size={15} /></IconButton>
          </div>
        </section>
        <section className="settings-panel">
          <h2>应用行为</h2>
          <p>控制关闭窗口时的处理方式。</p>
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
