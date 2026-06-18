---
artifact_type: plan
status: archived
created: 2026-06-18
updated: 2026-06-18
owner: codex
---

# Close To Tray Preference Plan

## Goal

实现关闭窗口时的可配置行为：窗口关闭按钮默认隐藏到托盘并首次提示；用户可在设置页切换为关闭窗口时退出应用。

## Scope

- 拦截主窗口关闭请求。
- 增加首次隐藏到托盘提示弹窗。
- 记录首次托盘提示是否已确认。
- 增加系统托盘入口，支持显示主窗口和退出应用。
- 在设置页增加关闭窗口行为配置。
- 将关闭行为偏好持久化到本地 SQLite `app_settings`。

## Non-Goals

- 不改变最小化按钮行为；最小化仍按系统默认进入任务栏。
- 不实现后台任务调度或常驻服务。
- 不新增多窗口生命周期管理。
- 不改变已有主题、Skills、项目、Radar 数据模型语义。

## Assumptions And Decisions

- 关闭行为枚举为 `exit`、`hide_to_tray`。
- 默认行为为 `hide_to_tray`，首次关闭窗口时展示一次托盘提示。
- 隐藏到托盘时必须存在托盘入口，避免用户无法恢复窗口。
- 首次托盘提示确认后写入 `app_settings.close_tray_hint_dismissed`。
- 设置页提供同一偏好的修改入口，避免用户记住选择后无法恢复询问。
- 托盘菜单至少包含“显示 Workbench”和“退出应用”。
- ADR gate：暂不需要。该行为是桌面交互偏好，不改变核心数据所有权或长期架构；实现完成后通过 dev-distill 判断是否需要记录能力文档。

## Fact Sources

- `AGENTS.md`：中文文档、简单优先、外科手术式修改、不直接 push。
- `CONTEXT.md`：Workbench 是本地优先桌面工作台，设置与本地数据已接入 SQLite。
- `docs/ai/context-map.md`：相关入口为 `src/App.tsx`、`src/lib/types/domain.ts`、`src/lib/api/workbenchApi.ts`、`src-tauri/src/lib.rs`、`src-tauri/src/skills.rs`。
- `DESIGN.md`：设置页使用纵向堆叠面板，弹窗承载聚焦任务，UI 默认中文。
- `src-tauri/tauri.conf.json`：当前只配置主窗口，没有托盘配置。
- `src-tauri/src/lib.rs`：当前没有关闭事件拦截或托盘逻辑。
- `src-tauri/Cargo.toml`：当前 `tauri` 未启用 tray 图标所需的 image feature。
- `docs/ARCHITECTURE.md`：`app_settings` 是应用设置表，当前已有 `skills_root`、`tool_target_order`、`project_open_profiles_seeded`。
- Tauri 2 官方文档：`@tauri-apps/api/window` 提供 `onCloseRequested`，Tauri tray/menu API 支持托盘和菜单；实现时需按官方权限与 feature 要求确认。

## Implementation Steps

1. Verify Current Behavior
   - Status: done
   - Work: 用现有代码确认关闭窗口未被拦截，托盘能力不存在。
   - Verification: `rg` 能定位没有 close handler / tray setup；必要时运行应用做一次手工验证。

2. Add Close Preference Model And Persistence
   - Status: done
   - Work: 在前端 `AppSettings` 增加关闭行为字段和托盘提示确认字段；后端从 `app_settings.close_behavior` 读取默认 `hide_to_tray`；增加保存命令。
   - Verification: Rust 单测覆盖默认值、合法值保存、非法值拒绝；前端类型编译通过。

3. Add Close Request Interception
   - Status: done
   - Work: 在前端主 App 生命周期注册 Tauri `onCloseRequested`；根据偏好执行退出、首次提示或隐藏。
   - Verification: 前端测试覆盖设置页关闭行为选项；构建通过。

4. Add Tray Support
   - Status: done
   - Work: 按 Tauri 2 API 增加托盘图标和菜单；菜单支持显示主窗口与退出应用；更新必要权限和 Cargo feature。
   - Verification: `cargo test`、`cargo clippy` 通过；手工验证隐藏后可从托盘恢复和退出。

5. Add Settings UI
   - Status: done
   - Work: 在设置页增加“关闭窗口时”选项：隐藏到托盘、退出应用。
   - Verification: 前端测试覆盖设置变更调用保存 API；视觉检查默认窗口下布局不溢出。

6. Update Documentation And Changelog
   - Status: done
   - Work: 更新 `CHANGELOG.md`、`DESIGN.md`、`docs/PRD.md`，必要时更新 `docs/capabilities/app-update.md` 或新增/更新应用设置相关能力文档。
   - Verification: `dev-flow validate-docs` 通过；文档不包含未确认分支方案。

7. Final Verification And Review
   - Status: done
   - Work: 运行 `pnpm verify`，再做手工桌面验证。
   - Verification: `pnpm verify` 通过；关闭询问、记住退出、记住隐藏、托盘显示、托盘退出均通过。

## Risks

- Tauri tray API 和 window close API 可能需要额外权限或 Cargo feature；实现时以 Tauri 2 官方文档和当前依赖版本为准。
- 如果关闭事件完全放在前端处理，必须保证注册生命周期稳定，避免组件重渲染造成重复监听。
- “退出应用”与“隐藏到托盘”都涉及进程生命周期，必须避免隐藏后没有可见恢复入口。

## Acceptance Criteria

- 默认首次点击窗口关闭按钮会出现托盘提示弹窗。
- 用户可在设置页选择关闭窗口时退出应用或隐藏到托盘。
- 用户确认首次托盘提示后，下次关闭直接隐藏到托盘。
- 设置页可修改关闭窗口行为。
- 隐藏到托盘后，托盘菜单可显示主窗口，也可退出应用。
- 最小化按钮行为不受影响。
- `pnpm verify` 通过。

## Artifact Routing

- Plan: `docs/plans/2026-06-18-close-to-tray-preference.md`
- Implementation: `src/App.tsx`、`src/lib/types/domain.ts`、`src/lib/api/workbenchApi.ts`、`src-tauri/src/lib.rs`、`src-tauri/src/skills.rs`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/capabilities/default.json`
- Tests: `src/App.test.tsx`、`src-tauri/src/skills.rs` tests 或新增应用设置相关 tests
- Docs: `CHANGELOG.md`、`DESIGN.md`、`docs/PRD.md`，必要时更新 `docs/ARCHITECTURE.md` 和 capability 文档
- Design system impact: update
- ADR gate: not required by default; run dev-distill after implementation to confirm

## Execution Readiness

Ready. The route is confirmed, source files are known, and verification path is defined.
