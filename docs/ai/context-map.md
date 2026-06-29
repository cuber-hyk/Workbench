# Context Map

本文档用于快速定位 Workbench 的长期上下文。

Do not read `docs/plans/`, `docs/audits/`, or archived directories by default.

## 产品与范围

- `docs/PRD.md`：当前能力基线、产品原则、非目标和后续方向。
- `README.md`：项目状态、运行方式和模块概览。
- `CONTEXT.md`：当前阶段、关键边界和模块状态。

## 架构与实现

- `docs/ARCHITECTURE.md`：技术栈、目录结构、核心模块、数据模型和关键流程。
- `src/App.tsx`：当前前端应用壳、全局状态和主要交互入口。
- `src/views/projects/ProjectsView.tsx`：项目列表、详情、启动项面板和本次启动日志前端视图。
- `src/views/projects/ProjectAddMenu.tsx`：项目页添加入口下拉，分流本地导入和 GitHub/Gitee 导入。
- `src/views/projects/launchState.ts`：项目启动状态、启动事件归并、停止状态标记和启动配置筛选的前端纯逻辑。
- `src/views/radar/RadarView.tsx`：资源 Radar 前端列表、详情、筛选和增删弹窗。
- `src/views/settings/SettingsView.tsx`：设置页分类导航和视图编排入口。
- `src/views/settings/DiagnosticsSettings.tsx`：设置页“诊断”入口，展示运行信息、本地路径、日志目录、复制诊断信息和手动健康检查操作。
- `src/views/settings/SettingsView.tsx`：设置页分类视图，包含 Skills 根目录、工具目录、自定义工具和 GitHub Token 配置入口。
- `src/views/settings/settingsLayout.tsx`、`src/views/settings/settingsFormatters.ts`：设置页专用布局组件和展示格式化逻辑。
- `src/views/skills/SkillsView.tsx`：Skills 本地列表、项目启用、市场/更新子视图编排和 Skills 前端交互入口。
- `src/views/skills/SkillsMarketView.tsx`：skills.sh 市场前端列表、详情、安装和卸载入口。
- `src/views/skills/SkillUpdatesView.tsx`：远程来源 Skill 的更新检查和批量更新视图，当前覆盖 skills.sh 与 GitHub 分支来源。
- `src/views/skills/skillFilters.ts`、`src/views/skills/skillMarketFormatters.ts`、`src/views/skills/SkillStatusIndicator.tsx`：Skills 筛选、展示格式化与状态标识。
- `src/components/dialogs/projects/`：项目编辑、启动配置、GitHub/Gitee 远程导入和项目记录删除确认弹窗。
- `src/components/dialogs/settings/`：设置页相关的自定义工具、项目打开方式、托盘提示和目录创建弹窗。
- `src/components/dialogs/skills/`：Skills 分类、ZIP/文件夹导入、GitHub 导入、迁移、删除和市场卸载弹窗。
- `src/lib/ui/toolIcons.tsx`：Agent 工具图标资源映射、自定义图标路径转换和图标回退显示。
- `src/lib/ui/pagination.ts`：项目、Skills、市场、更新和资源 Radar 列表分页的纯计算规则。
- `src/lib/types/domain.ts`：前端领域类型。
- `src/lib/api/workbenchApi.ts`：前端到 Tauri commands 的 API 边界。
- `src/lib/api/diagnosticsApi.ts`：设置诊断页的运行环境读取、健康检查 API 和 Web preview fallback。
- `src/lib/api/dataBackupApi.ts`：设置本地数据页的 SQLite 备份、恢复检查、恢复和自动备份设置 API。
- `src-tauri/src/lib.rs`：Tauri command 注册入口。
- `src-tauri/src/data_backup.rs`：本地数据备份、恢复和延迟自动备份 command，只处理 `workbench.sqlite` 与 `manifest.json`，不备份 Skills 实体目录。
- `src-tauri/src/diagnostics.rs`、`src-tauri/src/diagnostics/health.rs`：诊断页使用的系统平台、处理器类型和本机依赖健康检查 command。
- `src-tauri/src/app_update.rs`：应用更新弹窗的 GitHub Releases notes 读取、旧版 Workbench App 安装检测和旧快捷方式清理 command。
- `src-tauri/src/projects.rs`、`src-tauri/src/projects/`：项目 command facade、类型、SQLite 持久化、项目记录删除、GitHub/Gitee 远程导入、项目打开方式 Profiles 和启动会话进程管理。
- `docs/capabilities/project-management.md`：项目管理当前能力、启动项、外部工具打开 Profiles、数据所有权和错误边界。
- `docs/adr/2026-06-16-project-open-profiles.md`：项目打开方式使用全局 Profiles、并与启动配置分离的决策。
- `docs/capabilities/app-update.md`：应用更新入口、累计更新说明、Tauri updater 配置、GitHub Releases 更新来源和发布签名边界。
- `src-tauri/src/app_lifecycle.rs`：开机自启动状态读取和切换命令。
- `docs/capabilities/app-lifecycle.md`：主窗口关闭行为、启动后隐藏到托盘、开机自启动、系统托盘显示和退出入口。
- `src-tauri/src/radar.rs`、`src-tauri/src/radar/`：资源 Radar command facade、类型、SQLite 持久化、GitHub Stars 手动同步、URL/source 规范化、重复组合并、校验和链接打开逻辑。
- `docs/capabilities/resource-radar.md`：资源 Radar 当前能力、领域分类、数据所有权、同步规则和重复组合并规则。
- `docs/adr/2026-06-16-resource-radar-duplicate-merge.md`：资源 Radar 重复组合并后删除副资源的长期决策。
- `src-tauri/src/skills.rs`、`src-tauri/src/skills/`：Skills command 入口、类型、SQLite、GitHub Token 设置、文件系统同步、工具目标、分类、自定义工具目标、ZIP/文件夹导入、GitHub 导入、根目录迁移、受管目标重建、skills.sh 市场/CLI、来源更新、启用、冲突和删除逻辑。
- `docs/capabilities/skills-management.md`：Skills 当前能力、外部同步接管、根目录迁移、skills.sh 与 GitHub 来源、GitHub Token API 优先路径、自定义工具目标、分类与筛选语义、数据所有权、同步边界和验证。
- `docs/adr/2026-06-18-skill-categories-table.md`：Skills 分类使用独立分类表和 `category_id` 的长期决策。
- `docs/adr/2026-06-20-skills-sh-cli-adapter.md`：skills.sh 市场安装/更新通过官方 CLI 临时提取、Workbench 统一落盘和记录的决策。
- `docs/references/skills-manager-engineering-lessons.md`：从 `E:\Development\12-工具-Utility\Agent\skills-manager` 提炼的工程借鉴，不是当前能力事实。
- `docs/references/skills-manager-feature-lessons.md`：从 `skills-manager` 提炼的功能借鉴和取舍，不是 PRD 承诺范围。

## 设计

- `DESIGN.md`：设计系统规则和 UI 模式。
- `design-tokens.json`：设计 token 精确值。
- `UI/`：讨论用静态原型，不是正式构建入口。

## Dev Flow

- `AGENTS.md`：项目级 Agent 工作规则。
- `docs/plans/`：当前开发计划。
- `docs/audits/`：审核记录。
- `docs/adr/`：架构决策记录。
