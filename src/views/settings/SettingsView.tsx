import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Download, Edit3, Eye, EyeOff, FolderOpen, KeyRound, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { AppUpdatePanel } from "../../components/AppUpdatePanel";
import { Button, IconButton, Modal, PageHeader, StatusBadge } from "../../components/ui";
import {
  createLocalDataBackup,
  getAutoBackupSettings,
  inspectLocalDataBackup,
  restoreLocalDataBackup,
  selectLocalDataBackupFile,
  setAutoBackupSettings,
  type AutoBackupSettings,
  type LocalDataBackupSummary,
  type LocalDataRestoreInspection,
  type LocalDataRestoreSummary
} from "../../lib/api/dataBackupApi";
import { ToolIcon } from "../../lib/ui/toolIcons";
import type { AppSettings, CloseBehavior, ProjectOpenProfile, ToolKey, ToolTarget } from "../../lib/types/domain";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { SettingsContentHeader, SettingsRow, SettingsSection } from "./settingsLayout";
import { closeBehaviorLabel, projectOpenProfileSummary } from "./settingsFormatters";

type SettingsCategory = "general" | "skills" | "tools" | "profiles" | "data" | "behavior" | "diagnostics" | "appearance";

const settingsCategories: Array<{ key: SettingsCategory; label: string; description: string }> = [
  { key: "general", label: "常规", description: "更新与基础状态" },
  { key: "skills", label: "Skills", description: "统一根目录与映射" },
  { key: "tools", label: "工具目录", description: "全局 Skills 目标" },
  { key: "profiles", label: "项目打开方式", description: "外部工具入口" },
  { key: "data", label: "本地数据", description: "工作台数据位置" },
  { key: "behavior", label: "应用行为", description: "窗口与生命周期" },
  { key: "diagnostics", label: "诊断", description: "运行信息与日志" },
  { key: "appearance", label: "外观", description: "主题显示" }
];

const autoBackupRetentions: AutoBackupSettings["retention"][] = [10, 20, 30];

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
  onLaunchAtStartupChange,
  onStartHiddenToTrayChange,
  onSaveGithubToken = async () => undefined,
  onClearGithubToken = async () => undefined,
  onTestGithubToken = async () => undefined,
  onOpenPath,
  onOpenDirectory = onOpenPath,
  onNotify = () => undefined,
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
  onLaunchAtStartupChange: (enabled: boolean) => void;
  onStartHiddenToTrayChange: (enabled: boolean) => void;
  onSaveGithubToken?: (token: string) => void | Promise<void>;
  onClearGithubToken?: () => void | Promise<void>;
  onTestGithubToken?: (token?: string) => void | Promise<void>;
  onOpenPath: (path: string) => void;
  onOpenDirectory?: (path: string) => void | Promise<void>;
  onNotify?: (message: string, tone?: "success" | "warning" | "danger") => void;
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
            onSaveGithubToken={onSaveGithubToken}
            onClearGithubToken={onClearGithubToken}
            onTestGithubToken={onTestGithubToken}
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
        return (
          <LocalDataSettings
            settings={settings}
            onOpenPath={onOpenPath}
            onOpenDirectory={onOpenDirectory}
            onNotify={onNotify}
          />
        );
      case "behavior":
        return (
          <BehaviorSettings
            settings={settings}
            onCloseBehaviorChange={onCloseBehaviorChange}
            onLaunchAtStartupChange={onLaunchAtStartupChange}
            onStartHiddenToTrayChange={onStartHiddenToTrayChange}
          />
        );
      case "diagnostics":
        return (
          <DiagnosticsSettings
            settings={settings}
            onOpenPath={onOpenPath}
            onOpenDirectory={onOpenDirectory}
            onNotify={onNotify}
          />
        );
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
  onRootChange,
  onSaveGithubToken,
  onClearGithubToken,
  onTestGithubToken
}: {
  settings: AppSettings;
  inspectingRootMigration: boolean;
  onInspectRootMigration: () => void;
  onOpenPath: (path: string) => void;
  onRootChange: (path: string) => void;
  onSaveGithubToken: (token: string) => void | Promise<void>;
  onClearGithubToken: () => void | Promise<void>;
  onTestGithubToken: (token?: string) => void | Promise<void>;
}) {
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [githubTokenBusy, setGithubTokenBusy] = useState<"save" | "clear" | "test" | null>(null);
  const [showGithubToken, setShowGithubToken] = useState(false);

  async function runGithubTokenAction(action: "save" | "clear" | "test") {
    setGithubTokenBusy(action);
    try {
      if (action === "save") {
        await onSaveGithubToken(githubTokenInput);
        setGithubTokenInput("");
      } else if (action === "clear") {
        await onClearGithubToken();
        setGithubTokenInput("");
      } else {
        await onTestGithubToken(githubTokenInput.trim() ? githubTokenInput : undefined);
      }
    } finally {
      setGithubTokenBusy(null);
    }
  }

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
      <SettingsSection title="GitHub 来源" description="Token 仅用于 public GitHub API 请求，未配置时继续使用本机 Git 浅克隆。">
        <SettingsRow
          className="github-token-row"
          title="GitHub Token"
          description="保存后不回显明文；诊断信息不会复制 token。"
          status={<StatusBadge tone={settings.githubTokenConfigured ? "success" : "neutral"}>{settings.githubTokenConfigured ? "已配置" : "未配置"}</StatusBadge>}
        >
          <span className="github-token-control">
            <span className="github-token-input-row">
              <input
                aria-label="GitHub Token"
                type={showGithubToken ? "text" : "password"}
                value={githubTokenInput}
                placeholder={settings.githubTokenConfigured ? "输入新 Token 可替换当前配置" : "粘贴 GitHub Token"}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setGithubTokenInput(event.target.value)}
              />
              <IconButton
                title={showGithubToken ? "隐藏 Token" : "显示 Token"}
                onClick={() => setShowGithubToken((visible) => !visible)}
              >
                {showGithubToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </IconButton>
            </span>
            <span className="github-token-button-row">
              <Button disabled={githubTokenBusy !== null} onClick={() => void runGithubTokenAction("test")}>
                <RefreshCcw className={githubTokenBusy === "test" ? "spin" : ""} size={15} />{githubTokenBusy === "test" ? "测试中" : "测试"}
              </Button>
              <Button disabled={githubTokenBusy !== null} onClick={() => void runGithubTokenAction("save")}>
                <KeyRound size={15} />{githubTokenBusy === "save" ? "保存中" : "保存"}
              </Button>
              <Button disabled={githubTokenBusy !== null || (!settings.githubTokenConfigured && !githubTokenInput.trim())} onClick={() => void runGithubTokenAction("clear")}>
                清除
              </Button>
            </span>
          </span>
        </SettingsRow>
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
              <span className="settings-row-status">
                <StatusBadge tone={tool.source === "custom" ? "attention" : "neutral"}>{tool.source === "custom" ? "自定义" : "内置"}</StatusBadge>
                <StatusBadge tone={tool.available ? "accent" : "neutral"}>{tool.available ? "可用" : "不可用"}</StatusBadge>
              </span>
              <span className="settings-row-actions">
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
                <span className="settings-row-status">
                  <StatusBadge tone={profile.enabled ? "accent" : "neutral"}>{profile.enabled ? "启用" : "停用"}</StatusBadge>
                  <StatusBadge tone={profile.kind === "terminal" ? "attention" : "neutral"}>{profile.kind === "terminal" ? "终端" : "应用"}</StatusBadge>
                </span>
                <span className="settings-row-actions">
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

function LocalDataSettings({
  settings,
  onOpenPath,
  onOpenDirectory,
  onNotify
}: {
  settings: AppSettings;
  onOpenPath: (path: string) => void;
  onOpenDirectory: (path: string) => void | Promise<void>;
  onNotify: (message: string, tone?: "success" | "warning" | "danger") => void;
}) {
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [backupSummary, setBackupSummary] = useState<LocalDataBackupSummary | null>(null);
  const [restoreInspection, setRestoreInspection] = useState<LocalDataRestoreInspection | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<LocalDataRestoreSummary | null>(null);
  const [autoBackupSettings, setAutoBackupSettingsState] = useState<AutoBackupSettings | null>(null);
  const [loadingAutoBackup, setLoadingAutoBackup] = useState(true);
  const [savingAutoBackup, setSavingAutoBackup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingAutoBackup(true);
    getAutoBackupSettings()
      .then((nextSettings) => {
        if (!cancelled) setAutoBackupSettingsState(nextSettings);
      })
      .catch((error) => {
        if (!cancelled) onNotify(error instanceof Error ? error.message : String(error), "danger");
      })
      .finally(() => {
        if (!cancelled) setLoadingAutoBackup(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onNotify]);

  const createBackup = async () => {
    setCreatingBackup(true);
    try {
      const summary = await createLocalDataBackup();
      setBackupSummary(summary);
      onNotify("本地数据备份已创建", "success");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error), "danger");
    } finally {
      setCreatingBackup(false);
    }
  };

  const chooseBackupForRestore = async () => {
    try {
      const path = await selectLocalDataBackupFile();
      if (!path) return;
      setRestoreInspection(await inspectLocalDataBackup(path));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error), "danger");
    }
  };

  const confirmRestore = async () => {
    if (!restoreInspection) return;
    setRestoringBackup(true);
    try {
      const summary = await restoreLocalDataBackup(restoreInspection.backupPath);
      setRestoreSummary(summary);
      setRestoreInspection(null);
      onNotify("本地数据已恢复，请重启 Workbench", "warning");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error), "danger");
    } finally {
      setRestoringBackup(false);
    }
  };

  const saveAutoBackupSettings = async (
    enabled: boolean,
    retention: AutoBackupSettings["retention"],
    successMessage = "自动备份设置已保存"
  ) => {
    setSavingAutoBackup(true);
    try {
      const nextSettings = await setAutoBackupSettings(enabled, retention);
      setAutoBackupSettingsState(nextSettings);
      onNotify(successMessage, "success");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error), "danger");
    } finally {
      setSavingAutoBackup(false);
    }
  };

  const currentAutoBackupSettings = autoBackupSettings ?? { enabled: false, retention: 10, lastBackupAt: null };

  return (
    <div className="settings-form">
      <SettingsContentHeader title="本地数据" description="项目、分类和资源 Radar 数据保存在系统应用数据目录。" />
      <SettingsSection title="数据位置">
        <SettingsRow
          title="Workbench 根目录"
          description={settings.workbenchRoot}
          status={<StatusBadge tone="neutral">本地</StatusBadge>}
        >
          <IconButton title="打开 Workbench 根目录" onClick={() => onOpenPath(settings.workbenchRoot)}><FolderOpen size={15} /></IconButton>
        </SettingsRow>
        <SettingsRow
          title="SQLite 数据库"
          description={`${settings.workbenchRoot}\\workbench.sqlite`}
          status={<StatusBadge tone="neutral">SQLite</StatusBadge>}
        >
          <IconButton title="打开数据库所在目录" onClick={() => onOpenPath(settings.workbenchRoot)}><FolderOpen size={15} /></IconButton>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="备份与恢复" description="仅处理 SQLite 数据库和备份清单，不包含 Skills 实体目录、项目文件夹或日志。">
        <SettingsRow
          title="自动备份"
          description={
            currentAutoBackupSettings.lastBackupAt
              ? `最近自动备份：${formatBackupTimestamp(currentAutoBackupSettings.lastBackupAt)}`
              : "写入本地数据成功后延迟 5 分钟备份；两次自动备份至少间隔 30 分钟。"
          }
          status={<StatusBadge tone={currentAutoBackupSettings.enabled ? "accent" : "neutral"}>{currentAutoBackupSettings.enabled ? "已开启" : "已关闭"}</StatusBadge>}
        >
          <input
            className="settings-switch"
            type="checkbox"
            aria-label="自动备份"
            checked={currentAutoBackupSettings.enabled}
            disabled={loadingAutoBackup || savingAutoBackup}
            onChange={(event) =>
              void saveAutoBackupSettings(
                event.target.checked,
                currentAutoBackupSettings.retention,
                event.target.checked ? "自动备份已开启" : "自动备份已关闭"
              )
            }
          />
        </SettingsRow>
        <SettingsRow
          title="自动备份保留"
          description="只清理旧的自动备份 zip，手动创建的备份不会被自动删除。"
          status={<StatusBadge tone="neutral">{currentAutoBackupSettings.retention} 份</StatusBadge>}
        >
          <select
            aria-label="自动备份保留数量"
            className="settings-select"
            value={currentAutoBackupSettings.retention}
            disabled={loadingAutoBackup || savingAutoBackup}
            onChange={(event) =>
              void saveAutoBackupSettings(
                currentAutoBackupSettings.enabled,
                Number(event.target.value) as AutoBackupSettings["retention"],
                "自动备份保留数量已更新"
              )
            }
          >
            {autoBackupRetentions.map((retention) => (
              <option key={retention} value={retention}>最近 {retention} 份</option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow
          title="创建数据备份"
          description={backupSummary ? `最近备份：${backupSummary.backupPath}` : "生成包含 workbench.sqlite 和 manifest.json 的 zip 备份。"}
          status={<StatusBadge tone={backupSummary ? "accent" : "neutral"}>{backupSummary ? "已创建" : "手动"}</StatusBadge>}
        >
          <IconButton title="打开备份目录" onClick={() => void onOpenDirectory(`${settings.workbenchRoot}\\backups`)}>
            <FolderOpen size={15} />
          </IconButton>
          <Button disabled={creatingBackup} onClick={() => void createBackup()}>
            <Download size={15} />{creatingBackup ? "备份中" : "创建备份"}
          </Button>
        </SettingsRow>
        <SettingsRow
          title="恢复数据备份"
          description="恢复前会自动保存当前 SQLite 副本；恢复成功后需要重启 Workbench。"
          status={<StatusBadge tone="warning">需确认</StatusBadge>}
        >
          <Button disabled={restoringBackup} onClick={() => void chooseBackupForRestore()}>
            <Upload size={15} />选择备份
          </Button>
        </SettingsRow>
        {restoreSummary && (
          <div className="notice settings-notice">
            已恢复 SQLite 数据库。当前数据库替换前已保存为：{restoreSummary.previousDatabaseBackupPath}。请重启 Workbench 后继续使用。
          </div>
        )}
      </SettingsSection>
      {restoreInspection && (
        <RestoreLocalDataDialog
          inspection={restoreInspection}
          restoring={restoringBackup}
          onClose={() => setRestoreInspection(null)}
          onConfirm={() => void confirmRestore()}
        />
      )}
    </div>
  );
}

function RestoreLocalDataDialog({
  inspection,
  restoring,
  onClose,
  onConfirm
}: {
  inspection: LocalDataRestoreInspection;
  restoring: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="恢复本地数据"
      description="恢复会替换当前 SQLite 数据库。"
      onClose={onClose}
      footer={<><Button disabled={restoring} onClick={onClose}>取消</Button><Button disabled={restoring} variant="danger" onClick={onConfirm}>{restoring ? "恢复中" : "确认恢复"}</Button></>}
    >
      <div className="danger-notice notice">恢复前会自动保存当前数据库副本；恢复成功后需要重启 Workbench。Skills 实体目录不会被恢复或覆盖。</div>
      <div className="settings-definition-list">
        <div><small>备份文件</small><strong>{inspection.backupPath}</strong></div>
        <div><small>创建时间</small><strong>{formatBackupTimestamp(inspection.manifest.createdAt)}</strong></div>
        <div><small>SQLite 大小</small><strong>{formatBytes(inspection.manifest.sqliteSizeBytes)}</strong></div>
        <div><small>包含 Skills</small><strong>{inspection.manifest.includesSkillsDirectory ? "是" : "否"}</strong></div>
      </div>
    </Modal>
  );
}

function formatBackupTimestamp(value: string) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return value;
  const date = new Date(timestamp);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "unknown";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function BehaviorSettings({
  settings,
  onCloseBehaviorChange,
  onLaunchAtStartupChange,
  onStartHiddenToTrayChange
}: {
  settings: AppSettings;
  onCloseBehaviorChange: (behavior: CloseBehavior) => void;
  onLaunchAtStartupChange: (enabled: boolean) => void;
  onStartHiddenToTrayChange: (enabled: boolean) => void;
}) {
  return (
    <div className="settings-form">
      <SettingsContentHeader title="应用行为" description="控制 Workbench 启动、窗口关闭和托盘行为。" />
      <SettingsSection title="启动" description="这些选项只控制应用启动后的可见状态，不会自动同步 Skills 或启动项目。">
        <SettingsRow
          title="开机时启动 Workbench"
          description="系统登录后自动启动应用；不会自动运行项目或 Agent。"
          status={<StatusBadge tone={settings.launchAtStartup ? "accent" : "neutral"}>{settings.launchAtStartup ? "已开启" : "已关闭"}</StatusBadge>}
        >
          <input
            className="settings-switch"
            type="checkbox"
            aria-label="开机时启动 Workbench"
            checked={settings.launchAtStartup}
            onChange={(event) => onLaunchAtStartupChange(event.target.checked)}
          />
        </SettingsRow>
        <SettingsRow
          title="启动后隐藏到托盘"
          description="应用启动后直接进入托盘，可从托盘菜单恢复主窗口。"
          status={<StatusBadge tone={settings.startHiddenToTray ? "accent" : "neutral"}>{settings.startHiddenToTray ? "已开启" : "已关闭"}</StatusBadge>}
        >
          <input
            className="settings-switch"
            type="checkbox"
            aria-label="启动后隐藏到托盘"
            checked={settings.startHiddenToTray}
            onChange={(event) => onStartHiddenToTrayChange(event.target.checked)}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="窗口" description="关闭按钮只处理主窗口，不改变最小化按钮和系统托盘菜单。">
        <SettingsRow
          title="关闭窗口时"
          description="选择点击窗口关闭按钮后的处理方式。"
          status={<StatusBadge tone="accent">{closeBehaviorLabel(settings.closeBehavior)}</StatusBadge>}
        >
          <select
            aria-label="关闭窗口时"
            className="settings-select"
            value={settings.closeBehavior}
            onChange={(event) => onCloseBehaviorChange(event.target.value as CloseBehavior)}
          >
            <option value="hide_to_tray">隐藏到托盘</option>
            <option value="exit">退出应用</option>
          </select>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

function AppearanceSettings({ theme, onThemeToggle }: { theme: "light" | "dark"; onThemeToggle: () => void }) {
  return (
    <div className="settings-form">
      <SettingsContentHeader title="外观" description="切换 Workbench 的浅色或深色界面。" />
      <SettingsSection title="主题">
        <SettingsRow
          title="当前主题"
          description="App Shell 和设置页使用同一主题状态。"
          status={<StatusBadge tone="accent">{theme === "dark" ? "深色主题" : "浅色主题"}</StatusBadge>}
        >
          <Button onClick={onThemeToggle}>切换主题</Button>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
