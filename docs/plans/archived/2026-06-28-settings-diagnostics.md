---
artifact_type: plan
status: archived
created: 2026-06-28
updated: 2026-06-28
owner: codex
---

# Settings 诊断信息与日志入口计划

## Goal

在设置页新增一个只读的“诊断”入口，用于集中展示 Workbench 基础运行信息、本地关键路径，并提供复制诊断信息、打开数据目录、打开日志目录三个排障操作。

目标是让用户或开发者在遇到安装、更新、数据路径、日志定位问题时，可以从设置页快速拿到可复制的环境信息和本地目录入口。

## Scope

- 在设置页左侧分类中新增“诊断”，副标题为“运行信息与日志”。
- 右侧页面标题为“诊断”，描述为“查看 Workbench 运行环境、数据位置和日志入口。”
- 页面包含三个区块：
  - “运行信息”：版本号、运行环境、前端模式、Tauri 可用状态、系统平台、处理器类型。
  - “本地路径”：Workbench 数据目录、SQLite 数据库、Skills 根目录、日志目录。
  - “排障操作”：复制诊断信息、打开数据目录、打开日志目录。
- 复制内容使用纯文本，包含生成时间，避免复制敏感环境变量、token、完整 PATH、项目列表。
- “打开日志目录”在日志目录不存在时创建该目录，然后打开。
- Web preview 或 Tauri 不可用时仍能展示页面，用 `web-preview`、`unknown` 或禁用操作表达不可用状态。

## Non-Goals

- 不展示、读取或搜索日志内容。
- 不清理旧日志。
- 不导出 zip 问题包。
- 不上传日志或诊断信息。
- 不做健康检查，不检测 Node、npm、Git、GitHub CLI、skills.sh。
- 不做网络诊断、代理设置或 GitHub 连通性检测。
- 不做 SQLite 备份、恢复、迁移。
- 不收集用户项目路径列表。

## Assumptions

- 诊断页是设置页的一类，不新增 App Shell 一级导航。
- 当前设置页视觉层次继续沿用 `DESIGN.md`：左侧分类导航，右侧 header、section、row；不引入卡片式堆叠布局。
- `settings.workbenchRoot` 是 Workbench 数据目录的前端展示来源；SQLite 路径继续按现有约定显示为 `workbenchRoot/workbench.sqlite`。
- 日志目录显示为 `workbenchRoot/logs`；打开时允许创建空目录，这是低风险本地副作用。
- 版本号优先复用现有 `getCurrentAppVersion()`。
- 平台和处理器类型由一个小的 Tauri diagnostics command 返回；Web preview 使用前端 fallback。
- 长路径必须单行可滚动或可换行，不允许挤压按钮或导致布局塌陷。

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `DESIGN.md`
- `docs/capabilities/app-lifecycle.md`
- `src/views/settings/SettingsView.tsx`
- `src/lib/api/workbenchApi.ts`
- `src/lib/api/updateApi.ts`
- `src/lib/types/domain.ts`
- `src-tauri/src/lib.rs`
- `dev-split` scan: `src/views/settings/SettingsView.tsx` 当前约 480 行，新增诊断页不应继续内联堆叠。

## Implementation Plan

1. Settings UI ownership
   - 从 `SettingsView.tsx` 中抽出设置页专用布局小组件到 `src/views/settings/settingsLayout.tsx`。
   - 保留 `SettingsView.tsx` 作为分类导航和 active category 编排入口。
   - 新增 `src/views/settings/DiagnosticsSettings.tsx` 作为诊断页 owner。
   - 在 `settingsCategories` 中新增 `diagnostics` 分类。

2. Diagnostics data API
   - 新增 `src-tauri/src/diagnostics.rs`，提供只读 command 返回系统平台和处理器类型。
   - 在 `src-tauri/src/lib.rs` 注册 command。
   - 新增前端 API owner，例如 `src/lib/api/diagnosticsApi.ts`，封装 Tauri 调用和 web fallback。

3. Diagnostics page behavior
   - 页面加载时读取当前 app version、diagnostic environment、settings 数据。
   - 组合展示运行信息和本地路径。
   - “复制诊断信息”使用固定纯文本格式写入剪贴板，成功或失败用现有 toast/反馈机制提示。
   - “打开数据目录”复用现有 `openLocalPath`。
   - “打开日志目录”复用现有 `createAndOpenDirectory`。

4. Tests
   - 增加或更新设置页测试，覆盖分类切换到“诊断”。
   - 覆盖诊断信息渲染、复制按钮、打开数据目录、打开日志目录。
   - 覆盖 Tauri diagnostic API fallback 的基本行为。
   - 如 Rust command 保持简单，只做低成本单元测试或通过 `cargo test` 覆盖编译与注册。

5. Documentation
   - 如果新增 diagnostics capability 或设置页能力说明，更新 `docs/ai/context-map.md` 的相关入口。
   - 若实现影响 `DESIGN.md` 中设置页布局规则，再补充设计规则；否则不改设计文档。

## Verification

- `pnpm test`
- `pnpm verify`
- `pnpm tauri:verify-build`
- 手动检查设置页：
  - “诊断”分类可切换。
  - 长路径不撑破布局。
  - 复制诊断信息后内容包含版本、运行环境、路径和生成时间。
  - 打开数据目录可用。
  - 日志目录不存在时点击“打开日志目录”会创建并打开。

## Risks

- 现有 `SettingsView.tsx` 已经较大，直接追加会降低维护性；通过 `DiagnosticsSettings.tsx` 和 `settingsLayout.tsx` 控制扩散。
- Tauri 和 Web preview 的能力不同；需要让不可用状态显式展示，不能静默失败。
- 诊断信息容易过度收集；本计划只复制低敏路径和运行信息，不包含环境变量、token、项目列表。
- 打开日志目录会创建目录；这是可接受副作用，但仅限 `workbenchRoot/logs`。

## Acceptance Criteria

- 设置页新增“诊断”分类，视觉层级与现有设置页一致。
- 用户能看到版本、运行环境、系统平台、处理器类型、Workbench 数据目录、SQLite 路径、Skills 根目录、日志目录。
- 用户能复制一份完整但不含敏感信息的诊断文本。
- 用户能从设置页打开数据目录和日志目录。
- 测试覆盖主要交互，验证命令通过或明确记录阻塞原因。
