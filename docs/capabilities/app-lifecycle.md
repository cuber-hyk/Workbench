---
artifact_type: capability
status: current
created: 2026-06-18
updated: 2026-06-28
source_of_truth: src-tauri/src/lib.rs; src-tauri/src/app_lifecycle.rs
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
- `app_settings.start_hidden_to_tray` 记录启动后是否自动隐藏主窗口到托盘；默认关闭。
- 开机自启动由 Tauri autostart 插件管理，设置页读取系统自启动状态作为实际状态；默认关闭。
- 开发版不允许开启开机自启动，避免 Windows 登录后启动依赖本地 `devUrl` 的调试 exe 并显示 WebView2/Edge 错误页；正式安装包可开启。
- 设置页“应用行为”面板可修改关闭窗口行为。
- 设置页“应用行为”面板可切换开机自启动和启动后隐藏到托盘。
- 托盘菜单提供“显示 Workbench”和“退出应用”。

## Ownership

- 前端弹窗、设置项和关闭请求监听位于 `src/App.tsx`。
- 前端 API 边界位于 `src/lib/api/workbenchApi.ts`。
- 领域类型位于 `src/lib/types/domain.ts`。
- 后端命令、托盘菜单和窗口隐藏/退出逻辑位于 `src-tauri/src/lib.rs`。
- 开机自启动命令位于 `src-tauri/src/app_lifecycle.rs`。
- 关闭行为持久化复用 `src-tauri/src/skills.rs` 中的 `app_settings` 读写逻辑。

## Boundaries

- 最小化按钮不受影响，仍使用系统默认行为。
- 隐藏到托盘不代表后台任务调度；应用进程继续存在，等待用户从托盘恢复或退出。
- 开机自启动只负责系统登录后启动 Workbench，不触发 Radar 同步、Skills 更新、项目启动或 Agent 自动执行。
- 开机自启动应由正式安装包启用；开发版可关闭已有自启动项，但不能创建新的自启动项。
- 启动后隐藏到托盘和开机自启动互相独立；用户手动启动 Workbench 时也会应用该隐藏偏好。
- 退出应用通过后端 `exit_app` 命令执行，不通过前端隐藏窗口模拟。

## Verification

- 前端测试覆盖设置页关闭行为选项。
- 前端测试覆盖设置页开机自启动和启动后隐藏到托盘开关。
- Rust 测试覆盖 `close_behavior` 默认值、读取、旧值兼容和非法值拒绝，并覆盖布尔设置读取。
- `pnpm verify` 覆盖前端构建、前端测试、Rust fmt、Rust 测试和 Clippy。
