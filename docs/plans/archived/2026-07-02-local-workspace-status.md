---
artifact_type: plan
status: archived
created: 2026-07-02
updated: 2026-07-02
owner: codex
---

# Local Workspace Status

## Goal

将 App Shell 左侧栏现有的“本机工作区”静态信息升级为真实状态摘要，展示对 Workbench 日常使用有判断价值的具体数值和状态。

## Scope

- 在左侧栏 `本机工作区` 区域展示真实摘要：健康、内存、Skills 数量、项目数量、桌面运行环境。
- 资源数值采用轻量轮询或启动读取，不做高频实时监控。
- 正常状态保持克制展示；异常状态使用现有 warning/danger 语义突出。
- 侧栏“本机工作区”只作为静态摘要展示，不提供点击跳转；完整环境、路径和健康检查结果保留在设置页“诊断”分类。
- 保持现有 App Shell、主导航、页面布局和更新提示位置。

## Non-goals

- 不新增全局底部状态栏。
- 不展示 CPU 折线图或完整硬件监控面板。
- 不实现 GPU、温度、网络、进程级资源统计。
- 不改变项目、Skills、Radar、设置页面的信息架构。
- 不把状态采集失败作为阻断应用启动的错误。

## Assumptions And Decisions

- 已确认入口使用左侧栏现有 `本机工作区`，不新增底部栏。
- 首版展示具体数值，但只展示摘要级指标：内存、Skills 数量、项目数量。
- CPU 首版不常驻展示；如后续需要，只能作为简单百分比或诊断详情，不做曲线。
- 侧栏本机状态支持低频自动刷新，刷新间隔只提供关闭、30 秒、1 分钟、5 分钟预设，默认 1 分钟。
- 资源指标来源由 Tauri 后端确定；Web preview 使用稳定 mock/fallback，避免预览环境报错。
- `App.tsx` 只负责挂载状态组件和传入已有列表计数，不承载采集、格式化和状态判定逻辑。

## Fact Sources

- `DESIGN.md`：App Shell 和侧边栏可以展示本机工作区状态；界面应安静、紧凑、清晰。
- `CONTEXT.md`：Workbench 是本地优先 AI 开发工作台，设置页已有诊断入口。
- `docs/ai/context-map.md`：App Shell、诊断和相关 API 的入口。
- `src/App.tsx`：当前左侧栏已有 `local-strip` 和 `local-status`。
- `src/styles.css`：当前侧边栏、状态卡、更新提示、Toast 样式。
- `src/lib/api/diagnosticsApi.ts`：诊断 API 前端边界。
- `src-tauri/src/diagnostics.rs`、`src-tauri/src/diagnostics/health.rs`：诊断命令和健康检查后端入口。
- `src/views/settings/DiagnosticsSettings.tsx`：设置页诊断展示和健康检查交互。
- `src/App.test.tsx`：App Shell、诊断、浅深主题和相关集成测试。

## Split Guidance

Classification: proposed split for the new status summary owner; no broad split of existing large files.

Owner modules:

| Module | Owner responsibility | May depend on | Must not own |
|---|---|---|---|
| `src/components/LocalWorkspaceStatus.tsx` | 左侧栏本机工作区状态摘要 UI、状态行组合 | React、现有 UI/图标组件、状态摘要类型 | Tauri invoke 细节、诊断页完整健康检查、全局 App 状态编排 |
| `src/lib/api/diagnosticsApi.ts` | 前端诊断和本机资源摘要 API 边界 | Tauri `invoke`、Web preview fallback | App Shell UI、状态行布局 |
| `src-tauri/src/diagnostics.rs` | 诊断 command facade，注册资源摘要命令 | `diagnostics/` owner 模块 | UI 语义、前端展示文案 |
| `src-tauri/src/diagnostics/system.rs` | 系统资源摘要采集和阈值无关原始数据 | Rust 标准库或明确依赖 | Workbench 业务计数、前端状态颜色 |
| `src/App.tsx` | 应用壳挂载、传入项目/Skills 数量和诊断入口动作 | `LocalWorkspaceStatus` | 资源采集、格式化、阈值判断、复杂状态行逻辑 |

Code-placement constraints:

- Do not add resource collection or formatting logic to `src/App.tsx`.
- Do not add new generic `utils`、`helpers`、`common` modules.
- Keep `src-tauri/src/diagnostics.rs` as facade; if system resource logic is non-trivial, place it under `src-tauri/src/diagnostics/system.rs`.
- Keep `workbenchApi.ts` growth minimal; prefer extending `diagnosticsApi.ts` for diagnostics/resource commands.
- Tests should verify behavior intent: useful status values render, fallback works, failures degrade quietly, and App Shell layout remains stable.

Deferred split trigger:

- If `LocalWorkspaceStatus` grows beyond the sidebar summary into popover/detail interactions, split the detail view into a responsibility-named sibling component.
- If system resource collection adds platform-specific branches beyond simple memory totals, move platform-specific code under a same-name diagnostics submodule rather than expanding the facade.

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| PLAN-1 | todo | Confirm current baseline: static `local-strip` renders and settings diagnostic API still works before changes. | Run focused existing tests around App Shell/diagnostics or `pnpm test -- --run src/App.test.tsx` if supported. |
| PLAN-2 | todo | Add backend system resource summary command under diagnostics, returning memory values with non-sensitive data only. | Rust unit tests for formatting-independent data behavior where practical; `cargo test` through `pnpm verify` later. |
| PLAN-3 | todo | Extend `src/lib/api/diagnosticsApi.ts` with `getLocalWorkspaceStatus` or equivalent, including Web preview fallback and typed response. | TypeScript build and focused API fallback test if existing test pattern supports it. |
| PLAN-4 | todo | Create `LocalWorkspaceStatus` component for the sidebar summary, using existing sidebar tokens and status semantics. | Component/App test verifies rows for health, memory, Skills count, project count, and runtime render without overflow-prone text. |
| PLAN-5 | todo | Replace static `local-strip` markup in `App.tsx` with the component, passing `projects.length`, `skills.length`, runtime/update context as needed, and a diagnostics navigation action. | App Shell test verifies the sidebar still contains main nav, status summary, theme toggle, update badge behavior, and local mode. |
| PLAN-6 | todo | Add styling only for the new status summary variants, reusing sidebar tokens and avoiding bottom-bar/global layout changes. | Visual/manual check in light and dark theme at minimum desktop width; no main workspace height regression. |
| PLAN-7 | todo | Run full verification and update durable docs only if the implementation establishes a reusable UI rule or new capability fact. | `pnpm verify`; optionally update `DESIGN.md` via `/dev-design-system` if the pattern becomes project-level rule. |

## Acceptance Criteria

- 左侧栏“本机工作区”不再是纯静态文案。
- 用户能看到具体数值：内存、Skills 数量、项目数量。
- 正常状态不喧宾夺主；异常状态有明确文字和 warning/danger 语义。
- 采集失败或 Web preview 环境不会破坏 App Shell 渲染。
- 没有新增底部状态栏、CPU 曲线或装饰性监控面板。
- `App.tsx` 没有承担新增资源采集和格式化逻辑。
- 验证命令通过，或失败原因被明确记录。

## Risks

- 跨平台内存采集可能需要新增 Rust 依赖；应优先选择维护良好、低侵入方案，并确认打包影响。
- 资源数值刷新频率过高会浪费本机资源；首版应低频或手动/启动刷新。
- 侧边栏宽度只有约 220px，数值格式必须短而可截断。
- 诊断页已有健康检查语义，左侧栏只做摘要，避免形成第二套健康系统。

## Artifact Routing

- Plan: `docs/plans/2026-07-02-local-workspace-status.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: maybe `docs/capabilities/app-lifecycle.md` or a new diagnostics capability, only在实现后确认其属于持久能力事实时更新。
- `docs/ai/context-map.md`: maybe，只有新增/调整 diagnostics owner 文件后需要补充。
- Changelog: maybe，用户可见 App Shell 状态能力变化，随实现阶段判断。
- Design system: maybe，经用户确认最终 UI 后可用 `/dev-design-system` 记录“本机工作区状态摘要”模式。
- ADR gate: not needed；当前是可逆 UI/API 增量，不是硬架构决策。
- Distill: maybe；实现完成后若新增诊断能力事实或设计规则，应运行 `/dev-distill`。

## Completion

本计划在所有非延后步骤完成、相关测试和 `pnpm verify` 结果记录、必要文档路由完成后可以关闭或归档。
