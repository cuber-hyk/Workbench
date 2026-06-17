---
artifact_type: plan
status: archived
created: 2026-06-16
updated: 2026-06-16
owner: codex
---

# App 更新能力与左下角更新提示计划

## Goal

为 Workbench 增加基于 GitHub Releases 的应用更新能力：应用启动后静默检查新版本；有更新时在左下角“本地模式”附近显示更新提示；用户点击提示进入设置页确认下载、安装和重启。

## Scope

- 接入 Tauri 2 updater 能力和必要权限配置。
- 在前端建立单一更新状态来源，供侧边栏 Badge 和设置页复用。
- 在侧边栏 footer 中，仅当有新版本时展示紧凑更新 Badge。
- 在设置页新增“软件更新”面板，承载手动检查、版本信息、更新说明、下载安装和重启提示。
- 对更新检查失败、无更新、下载中、安装完成待重启等状态提供明确文案。
- 保持当前本地优先定位，不引入账号、云同步或后台服务。

## Non-Goals

- 不实现在线市场、插件更新、Skills 更新或资源同步更新。
- 不实现自动强制安装或后台静默重启。
- 不改造现有项目、Skills、资源 Radar 的业务逻辑。
- 不在左下角展示失败告警；失败只在设置页手动检查或更新流程中提示。

## Assumptions And Decisions

- 已确认左下角更新提示放在“本地模式”附近。
- 已确认参考 `E:\Development\12-工具-Utility\Agent\cc-switch` 的 UpdateBadge 思路。
- 更新 Badge 是提醒和快捷入口，不直接执行安装；点击后进入设置页“软件更新”面板。
- 下载安装和重启属于用户确认操作，避免打断当前项目运行或编辑状态。
- 无更新时左下角不显示更新 Badge，保持当前侧边栏安静。
- 更新来源使用 GitHub Releases，与当前公开仓库 `https://github.com/cuber-hyk/Workbench` 对齐。
- ADR gate: not needed。该功能使用 Tauri 官方 updater 模式和现有 App Shell，不改变长期架构边界。

## Fact Sources

- `CONTEXT.md`：Workbench 是本地优先桌面软件，设置模块已存在。
- `docs/ai/context-map.md`：主要入口为 `src/App.tsx`、`src/lib/api/workbenchApi.ts`、`src-tauri/src/lib.rs`。
- `DESIGN.md`：侧边栏可展示本机工作区状态；设置页使用纵向面板；attention 色用于注意状态。
- `design-tokens.json`：侧边栏、attention、button 和 icon 尺寸 token。
- `src/App.tsx`：当前左下角结构为 `.sidebar-footer`、`.theme-toggle`、`.local-status`；设置页为 `SettingsView`。
- `src/styles.css`：当前侧边栏 footer 和设置面板样式来源。
- `package.json`：当前未引入 `@tauri-apps/plugin-updater`。
- `src-tauri/Cargo.toml`：当前未引入 `tauri-plugin-updater`。
- `src-tauri/tauri.conf.json`：当前未配置 updater endpoint 和签名公钥。
- `src-tauri/src/lib.rs`：当前 Tauri builder 已注册 dialog 插件，可继续注册 updater 插件。
- `E:\Development\12-工具-Utility\Agent\cc-switch\src\components\UpdateBadge.tsx`：参考 Badge 仅在有更新时渲染，使用 `ArrowUpCircle`。
- `E:\Development\12-工具-Utility\Agent\cc-switch\src\contexts\UpdateContext.tsx`：参考单一更新上下文、启动后延迟检查、dismissed version 记录。

## Plan

1. Status: todo
   Task: 接入 updater 基础依赖和 Tauri 配置。
   Verification: `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 和 capability 配置包含 updater 所需项；本地构建能解析依赖。

2. Status: todo
   Task: 建立前端更新 API 和状态上下文。
   Verification: `UpdateProvider` 暴露 `hasUpdate`、`updateInfo`、`isChecking`、`error`、`checkUpdate`、`downloadAndInstall`、`relaunch` 等最小状态和动作；Web preview 下提供安全降级。

3. Status: todo
   Task: 新增左下角更新 Badge。
   Verification: 无更新时不渲染；有更新时在 `.sidebar-footer` 中显示紧凑 attention/更新图标；点击切换到设置页并定位“软件更新”面板；键盘和 `aria-label` 可用。

4. Status: todo
   Task: 在设置页新增“软件更新”面板。
   Verification: 面板展示当前版本、最新版本、检查状态、错误信息和更新说明；提供“检查更新”“下载并安装”“重启完成更新”等状态化操作；按钮在检查和下载期间禁用或显示进行中状态。

5. Status: todo
   Task: 处理更新生命周期边界。
   Verification: 无更新、检查失败、下载失败、安装完成待重启、用户稍后处理都有明确 UI 结果；失败不污染左下角状态；dismissed version 如需要只隐藏当前版本提醒。

6. Status: todo
   Task: 补充测试与发布说明。
   Verification: 前端测试覆盖 Badge 条件渲染、点击进入设置页、设置面板状态分支；CHANGELOG 记录用户可见更新能力；文档说明 GitHub Release/updater 发布前置条件。

7. Status: todo
   Task: 执行验证。
   Verification: 运行 `pnpm verify`；如完整验证受本地 updater 签名或构建环境限制影响，记录具体未验证项和替代验证。

## Risks

- Tauri updater 需要签名、公钥和 Release artifact 配套；实现代码可以完成，但真实更新链路必须通过正式 release 验证。
- Windows 安装包、便携包和 dev 模式行为不同，需要避免在开发模式下误报或抛出噪音。
- 左下角 Badge 不能抢占本地模式状态的空间；默认窗口宽度下应保持侧边栏稳定。
- 更新安装和重启可能影响当前运行项目，因此必须由用户在设置页确认。

## Acceptance Criteria

- 应用启动后可静默检查更新，不阻塞首屏。
- 有新版本时，左下角“本地模式”附近出现更新提示。
- 点击更新提示进入设置页“软件更新”面板，而不是直接安装。
- 设置页可手动检查更新，并能展示无更新、发现更新、检查失败、下载中、待重启状态。
- 用户确认后可下载并安装更新，安装完成后提供重启入口。
- 左下角无更新时保持当前 UI，不新增常驻噪音。
- 验证命令通过，或未通过项有明确原因和后续处理。

## Artifact Routing

- Plan: `docs/plans/2026-06-16-app-update-badge.md`
- Implementation: `src/App.tsx`、`src/styles.css`、`src/lib/api/workbenchApi.ts`、新增更新上下文/组件文件、`src-tauri` 配置。
- Tests: 前端组件/交互测试优先。
- Changelog: 需要更新 `CHANGELOG.md`。
- Capability docs: 如实现后形成稳定设置能力，可更新 `docs/capabilities/project-management.md` 或新增设置能力说明；由 `/dev-distill` 判断。
- Design system impact: none for now。使用现有侧边栏 footer、settings panel、attention/status 规则；若实现中沉淀通用 App Shell Badge，再通过 `/dev-design-system` 更新 `DESIGN.md`。

## Execution Readiness

Ready for `/dev-branch`.
