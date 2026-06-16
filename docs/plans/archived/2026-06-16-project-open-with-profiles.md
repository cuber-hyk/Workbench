---
artifact_type: plan
status: archived
created: 2026-06-16
updated: 2026-06-16
owner: codex
---

# 项目打开方式 Profiles

## Goal

为项目模块新增“用工具打开”能力，让用户可以从项目列表中用 VS Code、Trae、PowerShell、Claude Code 等外部工具打开当前项目目录，并在 PATH 缺失、可执行文件路径缺失、命令启动失败等边界情况下得到清晰提示。

## Scope

- 新增全局项目打开方式 Profiles，而不是每个项目单独配置。
- 项目列表新增“用工具打开”行级入口，使用菜单展示可用打开方式。
- 设置页新增项目打开方式配置区，支持查看、添加、编辑、删除、启用/停用和选择可执行文件路径。
- 后端新增 Tauri commands 和 SQLite 持久化，负责打开方式的保存、校验和执行。
- GUI App 类型直接启动外部程序；Terminal Command 类型在外部终端中打开交互式命令。
- 前端展示成功、失败、缺失 PATH、缺失项目路径、缺失命令等提示信息。
- 补充前端交互测试、Rust 单元测试和文档更新。

## Non-Goals

- 不把打开方式并入项目启动配置。
- 不把 Claude Code 等交互式 CLI 放入当前内嵌启动会话。
- 不捕获外部工具输出，不管理外部工具进程生命周期。
- 不做在线工具市场、自动安装工具或自动修改用户 PATH。
- 不做项目级默认打开方式覆盖。
- 不在第一版实现复杂模板系统；只支持 `{projectPath}` 占位符。

## Assumptions And Decisions

- 打开方式是全局配置，所有项目共享。
- 默认内置 Profiles 包括 VS Code、Trae、PowerShell 和 Claude Code。
- Profile 支持 `kind: app | terminal`。
- Profile 支持 `command`、可选 `executablePath`、`args`、`workdir`、`enabled`。
- 执行优先级为：配置了 `executablePath` 时使用它；否则使用 `command` 从 PATH 解析。
- GUI App 使用 `executablePath/command + args`，默认参数包含 `{projectPath}`。
- Terminal Command 使用外部终端打开，并把工作目录设为项目路径；Claude Code 默认执行 `claude`。
- PATH 缺失或 spawn 失败不做静默失败，必须返回面向用户的错误文案。
- 当前第一版聚焦 Windows；非 Windows 后端应返回清晰“不支持”提示，保持现有项目定位一致。
- ADR gate: maybe。该功能新增一类持久化配置和外部命令执行边界，实施完成后由 `/dev-distill` 判断是否需要 ADR。

## Fact Sources

- `AGENTS.md`：中文沟通、简单优先、外科手术式修改、Git 规则和验证命令。
- `CONTEXT.md`：Workbench 当前为本地优先桌面工作台，项目模块已接入 SQLite 与 Tauri。
- `docs/ai/context-map.md`：项目入口为 `src/App.tsx`、`src/lib/types/domain.ts`、`src/lib/api/workbenchApi.ts`、`src-tauri/src/projects.rs`。
- `docs/ARCHITECTURE.md`：项目启动配置存储在 `project_launch_configs`，启动会话是非交互式内嵌进程。
- `DESIGN.md`：项目列表使用表格行，行级操作放在操作列；行级图标操作必须阻止行选择；设置页使用纵向配置面板。
- `src/App.tsx`：项目行级操作当前包含打开目录、启动/停止、编辑、归档。
- `src-tauri/src/projects.rs`：项目持久化、启动会话、命令执行和 SQLite 表创建逻辑。
- `src-tauri/src/skills.rs`：现有 `open_local_path` 使用 Windows `explorer`，可作为本地打开能力参考。

## Execution Plan

| ID | Status | Step | Implementation Notes | Verification |
| --- | --- | --- | --- | --- |
| POW-1 | done | 定义领域模型和默认 Profiles | 在前后端新增 `ProjectOpenProfile` 类型，字段包含 `id/name/kind/command/executablePath/args/workdir/enabled/sortOrder`；提供默认 VS Code、Trae、PowerShell、Claude Code。 | `pnpm exec tsc --noEmit` 通过；Rust 测试覆盖默认数据和序列化边界。 |
| POW-2 | done | 增加 SQLite 持久化和 Tauri commands | 在 `projects.rs` 新增 `project_open_profiles` 表；实现 list/save/delete/open/select executable path commands；注册到 `lib.rs`。 | `cargo test` 通过，覆盖默认 seed、保存、删除 seed 不回灌、字段校验。 |
| POW-3 | done | 实现外部打开执行逻辑 | GUI App 根据 `executablePath` 或 `command` 启动并展开 `{projectPath}`；Terminal Command 在外部终端中以项目路径为工作目录启动；命令为空、项目路径不存在、spawn 失败返回明确中文错误。 | `cargo test` 覆盖占位符展开、缺失命令错误；命令启动失败文案由后端集中返回。 |
| POW-4 | done | 扩展前端 API 和状态加载 | 在 `domain.ts`、`workbenchApi.ts` 和 mock 数据中接入 profiles；App 初始化加载项目与 profiles；封装 `openProjectWithProfile(project, profile)` 并统一 toast。 | `pnpm test -- --run` 通过。 |
| POW-5 | done | 项目列表新增“用工具打开”菜单 | 在项目操作列添加紧凑图标菜单；保留“打开目录”独立入口；菜单只展示启用的 profiles；点击菜单项不触发行选择；无可用 profile 时给出提示。 | React 交互测试覆盖菜单打开、点击 profile、阻止行选择。 |
| POW-6 | done | 设置页新增打开方式配置区 | 使用现有设置页面板布局；支持启用/停用、编辑字段、选择 exe、删除和新增；字段文案解释 PATH 优先与 exePath 兜底；错误提示保持简洁。 | React 交互测试覆盖设置页打开方式行操作。 |
| POW-7 | done | 更新设计和架构文档并完成验证 | 更新 `DESIGN.md` 的项目行级操作和设置页配置规则；更新 `docs/ARCHITECTURE.md` 的数据模型、commands 和边界；更新 `CHANGELOG.md`。 | `pnpm test -- --run`、`cargo test` 已通过；完整验证在 review gate 前执行。 |

## Error Handling And User Messages

- 项目路径为空：`项目路径不能为空，无法用外部工具打开。`
- 项目路径不存在：`项目路径不存在，请先检查项目记录。`
- Profile 已停用：`该打开方式已停用。`
- 命令和可执行文件路径都为空：`打开方式未配置命令或可执行文件路径。`
- 可执行文件路径不存在：`可执行文件不存在，请重新选择程序。`
- PATH 缺失或命令无法启动：`无法启动 {profileName}，请检查命令是否已加入 PATH，或在设置中选择可执行文件。`
- 非 Windows 终端打开暂不支持：`当前系统暂不支持该打开方式。`

## UI Layout Notes

- 项目表格操作列新增一个“用工具打开”图标菜单，不把所有工具图标平铺在行内。
- 菜单项使用工具名称和简短状态，不显示长命令。
- 设置页新增“项目打开方式”面板，位于本地工作区/工具目录信息附近。
- 设置页每个 Profile 使用紧凑行：名称、类型、命令摘要、状态、编辑/删除图标。
- 编辑 Profile 使用聚焦弹窗，避免设置页行内编辑撑坏布局。
- exePath 选择按钮与路径输入同高同线，沿用现有路径输入规则。

## Risks

- Windows 上不同工具的命令名称不稳定，尤其 Trae 是否提供 PATH 命令需要用户环境验证。
- Terminal Command 的外部终端选择容易膨胀；第一版应固定为 Windows Terminal 优先、PowerShell fallback，避免配置过多。
- 命令参数如果用字符串拼接容易引入转义问题；实现时应尽量按参数数组处理，只有 shell 启动终端命令时做最小必要转义。
- 操作列空间有限；新增菜单按钮后可能需要调整 `projects-grid` 操作列宽度。

## Acceptance Criteria

- 用户可以从项目列表选择一个项目并用 VS Code、Trae、PowerShell 或 Claude Code 打开。
- Trae 未加入 PATH 时，用户可以在设置中选择 `trae.exe` 作为兜底。
- Claude Code 从外部终端进入项目目录并启动，不进入 Workbench 内嵌启动日志。
- 命令缺失、路径不存在、可执行文件不存在、启动失败都有清楚 toast 或错误提示。
- 行级菜单操作不会触发项目行选择。
- 默认窗口宽度下项目操作列、打开方式菜单和设置页配置区不挤压主要内容。
- 前端测试、Rust 测试、`pnpm verify` 和 `pnpm tauri:verify-build` 通过。

## Artifact Routing

- Plan: `docs/plans/2026-06-16-project-open-with-profiles.md`
- Code: `src/App.tsx`, `src/components/ui.tsx` if menu component需要抽取, `src/lib/types/domain.ts`, `src/lib/api/workbenchApi.ts`, `src/lib/api/mockData.ts`, `src-tauri/src/projects.rs` or a focused new Rust module, `src-tauri/src/lib.rs`
- Tests: `src/App.test.tsx`, Rust unit tests near project open profile logic
- Docs: `DESIGN.md`, `docs/ARCHITECTURE.md`, `CHANGELOG.md`
- Context map: maybe update if a new Rust module is added
- Design system impact: update
- Distill/ADR gate: run during branch closeout; ADR maybe

## Execution Readiness

Ready for `/dev-branch` implementation after user approval.
