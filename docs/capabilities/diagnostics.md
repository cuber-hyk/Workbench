---
artifact_type: capability
status: current
updated: 2026-07-02
source_of_truth: src/lib/api/diagnosticsApi.ts; src-tauri/src/diagnostics.rs; src-tauri/src/diagnostics/
---

# 诊断与本机状态

## Current Behavior

Workbench 的诊断能力分为设置页完整诊断和 App Shell 摘要状态。

设置页“诊断”展示 Workbench 版本、运行环境、系统平台、本地数据目录、SQLite 数据库、Skills 根目录和日志目录。用户可以复制低敏诊断信息，也可以手动执行健康检查。健康检查覆盖 Node/npm/npx、GitHub CLI、skills.sh 依赖链路、符号链接权限和工具目录可写性，不修改用户配置或真实工具目录。

左侧栏“本机工作区”展示摘要级本机状态，包括健康、内存、项目数量和 Skills 数量。内存由 Tauri 诊断命令读取；项目数量和 Skills 数量来自 App Shell 已加载的项目列表和 Skills 状态。

本机状态默认每 1 分钟刷新一次；设置页“应用行为”可以将刷新间隔改为关闭、30 秒、1 分钟或 5 分钟。关闭自动刷新后，侧栏只在组件挂载或间隔设置变更时读取一次。

Web preview 环境不会执行本机命令，诊断 API 返回稳定 fallback，保证 App Shell 和设置页可预览。

## Ownership

- 前端 API 边界：`src/lib/api/diagnosticsApi.ts`
- 设置页诊断 UI：`src/views/settings/DiagnosticsSettings.tsx`
- 左侧栏本机状态 UI：`src/components/LocalWorkspaceStatus.tsx`
- App Shell 挂载：`src/App.tsx`
- Tauri command facade：`src-tauri/src/diagnostics.rs`
- 健康检查实现：`src-tauri/src/diagnostics/health.rs`
- 系统资源摘要实现：`src-tauri/src/diagnostics/system.rs`

## Boundaries

- 左侧栏只展示摘要级状态，不是完整硬件监控器。
- 不常驻展示 CPU 曲线、GPU、温度、网络或进程级资源。
- 刷新间隔只使用预设值，不提供任意秒数输入。
- 资源采集失败不阻断应用启动；前端应降级为不可用或 fallback 状态。
- 复制诊断信息不包含 token、环境变量或项目列表。
- 健康检查是手动排障操作，不替代启动时的静默状态摘要。

## Verification

- 前端测试覆盖设置页诊断信息、Web preview fallback、本机工作区状态摘要和刷新间隔设置。
- Rust 测试覆盖健康检查行为。
- `pnpm verify` 覆盖前端构建、前端测试、Rust 格式、Rust 测试和 Clippy。
