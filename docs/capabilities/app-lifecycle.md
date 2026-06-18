---
artifact_type: capability
status: current
created: 2026-06-18
updated: 2026-06-18
source_of_truth: src-tauri/src/lib.rs
adr: none
---

# App Lifecycle Capability

## Current Behavior

- 主窗口关闭请求由前端拦截。
- 关闭行为偏好保存在 SQLite `app_settings.close_behavior`。
- `close_behavior` 取值：
  - `exit`：关闭窗口时退出应用。
  - `hide_to_tray`：关闭窗口时隐藏到系统托盘。
- 默认值为 `hide_to_tray`。
- `app_settings.close_tray_hint_dismissed` 记录隐藏到托盘首次提示是否已确认；默认未确认，首次关闭窗口时展示一次轻量提示。
- 设置页“应用行为”面板可修改关闭窗口行为。
- 托盘菜单提供“显示 Workbench”和“退出应用”。

## Ownership

- 前端弹窗、设置项和关闭请求监听位于 `src/App.tsx`。
- 前端 API 边界位于 `src/lib/api/workbenchApi.ts`。
- 领域类型位于 `src/lib/types/domain.ts`。
- 后端命令、托盘菜单和窗口隐藏/退出逻辑位于 `src-tauri/src/lib.rs`。
- 关闭行为持久化复用 `src-tauri/src/skills.rs` 中的 `app_settings` 读写逻辑。

## Boundaries

- 最小化按钮不受影响，仍使用系统默认行为。
- 隐藏到托盘不代表后台任务调度；应用进程继续存在，等待用户从托盘恢复或退出。
- 退出应用通过后端 `exit_app` 命令执行，不通过前端隐藏窗口模拟。

## Verification

- 前端测试覆盖设置页关闭行为选项。
- Rust 测试覆盖 `close_behavior` 默认值、读取、旧值兼容和非法值拒绝，并覆盖布尔设置读取。
- `pnpm verify` 覆盖前端构建、前端测试、Rust fmt、Rust 测试和 Clippy。
