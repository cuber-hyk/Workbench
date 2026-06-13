---
artifact_type: plan
status: active
created: 2026-06-13
updated: 2026-06-13
owner: Codex
---

# Workbench MVP UI First Development Plan

## Goal

先搭建真实的 Tauri + React + TypeScript 应用骨架，并按已确认的 UI 原型实现可运行的前端工作台；随后按模块接入 Tauri commands、SQLite 和本地系统能力，完成 MVP。

## Scope

本计划覆盖 MVP 第一轮实现：

- 初始化正式应用工程。
- 将 `UI/` 静态原型迁移为 React 页面和共享组件。
- 使用 mock data 支撑第一版真实 UI。
- 定义前端到 Tauri commands 的类型边界。
- 按项目管理、AI Radar、Skills、设置的顺序逐步接入真实后端。
- 建立基础验证方式。

## Non-Goals

- 不实现独立 HTTP 后端。
- 不接入 AI Radar 外部数据源。
- 不实现 Agent 配置中心。
- 不实现 Obsidian 连接。
- 不实现 Skills 在线市场、安装或远程同步。
- 不内嵌终端，不捕获项目启动日志，不管理已启动进程。
- 不创建复杂插件系统。

## Assumptions And Decisions

- 已确认 UI 方向，正式实现应遵守 `DESIGN.md` 和 `design-tokens.json`。
- 第一阶段采用 UI 先行：先实现真实 UI 骨架，再逐模块接后端。
- 初期前端可以使用 mock data，但页面结构、字段和交互应贴近真实数据模型。
- Tauri Rust 后端不是独立服务，只通过 Tauri command 暴露本地能力。
- SQLite 是本地数据的持久化来源。
- `UI/` 目录继续作为讨论原型保留，不作为正式前端代码入口。
- 创建项目级 `AGENTS.md`，仅记录 Workbench 项目规则和文档路由。

## Fact Sources

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `DESIGN.md`
- `design-tokens.json`
- `UI/index.html`
- `UI/styles.css`
- `UI/app.js`

## Implementation Steps

### 1. Scaffold Formal App

Status: done

Tasks:

- 初始化 Tauri + React + TypeScript + Vite 工程。
- 建立 `src/` 和 `src-tauri/` 基础目录。
- 配置基础 scripts，例如 `dev`、`build`、`tauri dev`。
- 保留 `UI/` 作为静态原型，不参与正式构建。

Verification:

- `package.json`、`src/`、`src-tauri/` 存在。
- 应用可以通过开发命令启动到空壳页面。
- `UI/` 未被正式构建入口引用。

### 2. Build App Shell And Design Tokens

Status: done

Tasks:

- 将 `design-tokens.json` 中的基础 token 映射为 CSS variables。
- 实现 App Shell：左侧导航、右侧工作区、页面标题区、主题切换。
- 实现浅色和深色主题状态。
- 建立基础共享 UI 组件：Button、IconButton、Panel、Toolbar、SearchInput、Dialog。

Verification:

- 项目、Skills、AI Radar、设置四个导航项可切换。
- 浅色和深色主题可切换并保持布局一致。
- 视觉规则符合 `DESIGN.md`：紧凑、桌面优先、无独立 Dashboard。

### 3. Implement MVP Pages With Mock Data

Status: done

Tasks:

- 实现项目页：列表、详情、添加项目弹窗、启动配置展示。
- 实现 Skills 页：根目录栏、列表、分类、启用状态、详情、导入弹窗。
- 实现 AI Radar 页：列表、搜索筛选、详情、添加条目弹窗。
- 实现设置页：数据位置、Skills 根目录、工具目录、路径映射、主题。
- mock data 放在清晰的临时位置，便于后续替换为 API 调用。

Verification:

- 四个模块页面均可打开并展示有效内容。
- 列表选中态、详情面板和弹窗交互可用。
- 文本、路径、命令不会破坏布局。
- 与 `UI/` 原型相比，功能范围不超出 PRD。

### 4. Define Frontend API Boundary

Status: done

Tasks:

- 在 `src/lib/api/` 定义 Tauri invoke 封装。
- 在 `src/lib/types/` 定义 Project、Skill、SkillCategory、ToolTarget、SkillEnablement、RadarItem、AppSetting 等类型。
- 将页面 mock data 调用收敛到模块级 API adapter，避免组件直接绑定临时数据来源。
- 先定义必要 commands，不实现未进入 MVP 的能力。

Verification:

- 页面通过统一 adapter 获取数据。
- 组件不直接调用 `invoke`。
- 类型字段与 `docs/ARCHITECTURE.md` 数据模型一致。

### 5. Implement Project And Radar Persistence

Status: in_progress

Tasks:

- 初始化 SQLite 连接、迁移和 repository 基础结构。
- 实现项目增删改查、搜索、打开目录和启动配置。
- 实现 AI Radar 增删改查、搜索、分类筛选、标签筛选、收藏和打开链接。
- 将项目页和 Radar 页从 mock data 接入真实 Tauri commands。

Verification:

- 应用重启后项目和 Radar 数据仍然保留。
- 项目目录可打开。
- 配置启动项后，可在新的系统终端窗口执行。
- Radar 条目可新增、搜索、筛选、收藏和打开链接。

### 6. Implement Skills Root, Scan, Import, And Enablement

Status: done

Tasks:

- 实现 Workbench Skills 根目录配置。
- 扫描根目录中的 `SKILL.md` 并解析名称、描述、路径。
- 实现 Skill 分类管理。
- 实现 ZIP 和已解压文件夹导入。
- 实现全局工具和项目级工具的 Auto 启用。
- 默认使用 Auto 同步：优先符号链接，失败时复制；目标冲突时不覆盖、不删除。
- 扫描全局工具目录中的同名 Skill 状态。
- 内容一致的全局工具目录同名 Skill 会在扫描时自动登记为 Workbench 管理。
- 支持选择唯一版本源并备份后解决内容冲突。
- 支持删除 Skill，并清理 Workbench 管理的启用记录和受管目标。

Verification:

- 可扫描并展示根目录下的 Skills。
- 可搜索和按分类筛选 Skills。
- 可从 ZIP 或文件夹导入 Skills。
- 同名 Skill 不覆盖、不合并。
- 全局和项目级启用只创建 Workbench 管理的符号链接或副本，并记录实际方式。
- 停用时只移除 Workbench 管理的链接或完整副本。
- 全局工具目录同名 Skill 可识别为内容一致或内容冲突。
- 内容一致状态扫描后显示为 Workbench 管理。
- 冲突解决前会备份被替换版本，不自动合并目录。
- 内容冲突通过 Skill 级唯一版本源选择解决，不按工具分别解决。
- 删除 Skill 不删除未被 Workbench 管理的工具目录内容。

Implementation note:

- 默认根目录为 `~/.workbench/skills`。
- 已将 `~/.cc-switch/skills` 中 34 个有效 Skills 一次性复制到默认根目录，源目录保持不变。
- 项目和 AI Radar 持久化按用户决定继续延后，未执行步骤 5。

### 7. Finish MVP Verification

Status: todo

Tasks:

- 补齐关键前端交互测试或最小可运行验证脚本。
- 补齐 Rust 后端单元测试或集成测试。
- 使用本机手动验证 Windows 文件系统能力。
- 检查 UI 是否符合 `DESIGN.md`。
- 更新必要文档，不引入双轨说明。

Verification:

- 前端构建通过。
- Rust 测试通过。
- Tauri dev 启动可用。
- Windows 下打开目录、启动配置、创建符号链接均通过手动验证。
- MVP 验收标准逐项满足。

## Risks

- Windows 符号链接权限不足时，Auto 同步会回退为 Copy。
- Tauri、SQLite 和 React 工程初始化可能带来较多配置文件，需要保持目录结构清晰。
- Skills 导入和启用涉及文件系统写入，必须优先保护用户已有文件。
- UI 原型中的视觉细节不能直接照搬为临时硬编码，应通过 token 和共享组件收敛。

## Acceptance Criteria

- 可以启动 Workbench App 桌面应用。
- 左侧导航和基础页面结构可用。
- 项目、Skills、AI Radar、设置四个 MVP 模块可用。
- 项目可以添加、查看、搜索、打开目录和启动配置。
- Skills 可以配置根目录、扫描、分类、导入和通过 Auto 同步启用。
- AI Radar 可以添加、搜索、筛选、收藏和打开链接。
- 数据在应用重启后仍然保留。
- UI 遵守 `DESIGN.md` 和 `design-tokens.json`。

## Artifact Routing

- Plan: `docs/plans/2026-06-13-mvp-ui-first-development.md`
- Product scope: `docs/PRD.md`
- Architecture: `docs/ARCHITECTURE.md`
- Design system: `DESIGN.md` and `design-tokens.json`
- Static visual reference: `UI/`
- Implementation code: `src/` and `src-tauri/`
- ADR: `docs/adr/`
- Changelog: `CHANGELOG.md`
- Context map: `docs/ai/context-map.md`
- Agent guide: `AGENTS.md`

## Execution Readiness

Ready.

Recommended next step: start implementation in a reviewed development branch or continue directly with the first step if the user wants a simple linear workflow.
