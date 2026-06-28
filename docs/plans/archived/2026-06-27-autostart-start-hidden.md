---
artifact_type: plan
status: archived
created: 2026-06-27
updated: 2026-06-27
owner: codex
---

# 开机自启动与启动后隐藏到托盘计划

## Goal

在设置页“应用行为”中增加两个独立偏好：开机时启动 Workbench、启动后隐藏到托盘，并让偏好通过 Tauri 后端与系统自启动能力真实生效。

## Scope

- 增加“开机时启动 Workbench”开关，默认关闭。
- 增加“启动后隐藏到托盘”开关，默认关闭。
- 两个开关互相独立；启动后隐藏到托盘只影响应用启动后的主窗口可见性，不自动启用系统开机自启动。
- 使用 Tauri autostart 插件承载系统自启动注册、取消注册和状态读取。
- 将两个偏好纳入现有 `AppSettings` / `SkillsState.settings` 设置流。
- 更新设置页、前端 API、预览 mock、后端命令、生命周期文档和必要测试。

## Non-goals

- 不增加后台任务调度。
- 不在开机后自动同步 Radar、更新 Skills、启动项目或执行 Agent。
- 不改变现有关闭窗口行为，`close_behavior` 仍只控制用户关闭主窗口时隐藏到托盘或退出应用。
- 不做跨平台定制 UI；第一版使用同一设置项，底层能力由 Tauri 插件处理。

## Assumptions And Decisions

- 用户已确认两个功能都做。
- 两个开关默认关闭，避免安装或升级后静默改变用户开机体验。
- “开机自启动”以系统 autostart 注册状态为实际来源；保存设置时必须调用插件 enable/disable，读取设置时应尽量反映系统真实状态。
- “启动后隐藏到托盘”是 Workbench 自身偏好，持久化到 SQLite `app_settings.start_hidden_to_tray`。
- 如果用户开启“启动后隐藏到托盘”但没有开启“开机时启动 Workbench”，仍应允许；它适用于用户手动打开后也想直接进托盘的场景。
- 不新增 App Shell 主导航项；设置仍放在“应用行为”分类。

## Fact Sources

- `AGENTS.md`：中文沟通、外科手术式修改、文档路由、禁止直接 push。
- `CONTEXT.md`：Workbench 是本地优先桌面工作台，设置已接入 SQLite。
- `docs/ai/context-map.md`：设置页、生命周期能力和相关代码入口。
- `DESIGN.md`：设置页使用左侧分类导航 + 右侧单一表单内容区；应用行为设置单独分类管理。
- `docs/capabilities/app-lifecycle.md`：现有关闭窗口、托盘和退出行为边界。
- `docs/ARCHITECTURE.md`：`app_settings` 保存应用设置，关闭窗口流程由前端监听和后端命令共同完成。
- `src/views/settings/SettingsView.tsx`：设置页“应用行为”当前只包含关闭窗口行为。
- `src/App.tsx`：应用壳拥有全局 settings、关闭窗口监听和托盘提示编排。
- `src/lib/api/workbenchApi.ts`：前端到 Tauri commands 的 API 边界。
- `src/lib/types/domain.ts`：前端 `AppSettings` 类型。
- `src-tauri/src/lib.rs`：Tauri command 注册、托盘、隐藏主窗口和退出命令。
- `src-tauri/src/skills.rs`、`src-tauri/src/skills/db.rs`、`src-tauri/src/skills/types.rs`：`app_settings` 读写和 `SkillsSettings` 序列化。
- Tauri 官方 autostart 文档：`https://v2.tauri.app/plugin/autostart/`。

## Split Guidance

- Required: yes, completed as planning classification.
- Source: `/dev-split` lightweight scan and owner review.
- Classification: no split for this task.
- Scan result: large-file candidates are `src/App.test.tsx`、`src-tauri/src/skills.rs`、`src/App.tsx`; `WorkbenchApp` is a large top-level block.
- Code-placement constraints:
  - Autostart system integration belongs in a focused Tauri lifecycle owner, preferably a new `src-tauri/src/app_lifecycle.rs` module or equivalent clearly named owner module.
  - `src-tauri/src/lib.rs` should remain the Tauri builder, tray setup, and command registration entry point; do not put autostart business logic there beyond plugin initialization and command registration.
  - `src/App.tsx` may only coordinate app-level startup side effects and settings state updates; do not add deterministic autostart enable/disable logic there.
  - `src/views/settings/SettingsView.tsx` owns visible settings rows only; do not move persistence or Tauri plugin calls into the view.
  - `src-tauri/src/skills.rs` may keep settings aggregation if current project convention is preserved, but new lifecycle commands should not be added there unless implementation proves they must return full `SkillsState`.
- Deferred split trigger: if implementation requires more than simple startup-side-effect coordination in `src/App.tsx`, extract a named app lifecycle hook or owner module before continuing.

## Steps And Verification

| ID | Status | Step | Verification |
| --- | --- | --- | --- |
| PLAN-1 | done | Add Tauri autostart dependency, initialize the plugin, and add lifecycle commands for reading/toggling autostart state. | `cargo check` passed. |
| PLAN-2 | done | Extend settings domain with `launchAtStartup` and `startHiddenToTray`, including backend `SkillsSettings`, frontend `AppSettings`, mock data, and normalization defaults. | `src/App.test.tsx` passed through local Vitest binary; Rust bool-setting test extended. |
| PLAN-3 | done | Persist `start_hidden_to_tray` in SQLite `app_settings`; keep `launch_at_startup` synchronized with system autostart state instead of relying only on stored JSON. | `launchAtStartup` is hydrated from `is_launch_at_startup_enabled`; `start_hidden_to_tray` uses `app_settings`. |
| PLAN-4 | done | Add Settings UI rows in “应用行为”：两个 independent toggle/checkbox controls with concise Chinese labels and current-state text. | Frontend test covers both settings toggles. |
| PLAN-5 | done | Wire front-end API and app shell handlers: toggling autostart calls backend command; toggling hidden start persists setting; startup effect hides main window when `startHiddenToTray` is true in Tauri. | Frontend test covers settings callbacks; `cargo check` covers backend command wiring. |
| PLAN-6 | done | Update durable docs for lifecycle/settings: `docs/capabilities/app-lifecycle.md`, `docs/ARCHITECTURE.md`, and `docs/PRD.md`; add changelog entry if user-visible change is completed. | Docs updated; doc validation still pending in PLAN-7. |
| PLAN-7 | done | Run final verification. | `cargo check`; local Vitest `src/App.test.tsx`; `cargo fmt --check`; `cargo test`; `tsc --noEmit`; `cargo clippy --all-targets -- -D warnings`; `vite build`; `cargo build --release`. `pnpm verify` and `tauri build --no-bundle` were blocked by local pnpm ignored-build approval for `esbuild`, while their component commands were verified directly. |

## Acceptance Criteria

- 设置页“应用行为”展示“开机时启动 Workbench”和“启动后隐藏到托盘”两个独立开关。
- 新安装或升级后的默认状态都是关闭。
- 开启/关闭开机自启动会调用系统 autostart 能力并刷新设置状态。
- 开启“启动后隐藏到托盘”后，应用启动时主窗口自动隐藏到托盘；关闭后正常显示主窗口。
- 关闭窗口行为仍按现有 `close_behavior` 工作，不被新设置替代。
- 没有后台同步、自动项目启动或 Agent 自动执行副作用。
- 前端和后端验证通过，相关生命周期文档更新。

## Risks

- Tauri autostart 插件可能需要 capabilities/permissions 或平台特定配置；实现时以当前 Tauri 2 官方文档和项目版本为准。
- 开机启动后的隐藏窗口行为需要真实桌面环境验证；自动化测试只能覆盖调用路径和状态流。
- `src/App.tsx` 已是应用壳大文件；实现必须限制为 app-level 副作用编排，避免继续承载可独立拥有的生命周期逻辑。
- 当前工作区 `src-tauri/Cargo.toml` 有换行符状态变化但内容 diff 为空；实施前应再次检查，避免把无关格式变化混入功能 diff。

## Artifact Routing

- Plan: `docs/plans/2026-06-27-autostart-start-hidden.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: update `docs/capabilities/app-lifecycle.md`
- Architecture/PRD docs: update `docs/ARCHITECTURE.md` and `docs/PRD.md`
- Changelog: needed; this is user-visible settings/lifecycle behavior.
- Distill: needed after implementation; lifecycle capability and active plan should be closed out.
- ADR gate: maybe; likely not needed if Tauri autostart is only a local plugin integration, but `/dev-distill` should re-check because this changes app lifecycle behavior.
- Design system impact: none expected; reuse existing Settings form/row pattern and compact controls.

## Completion

Complete when all non-deferred steps are done, verification results are recorded, docs are updated, and no lifecycle behavior remains only partially wired.
