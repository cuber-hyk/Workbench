---
artifact_type: plan
status: archived
created: 2026-06-14
updated: 2026-06-14
owner: Codex
---

# Improve MVP Daily Usability Plan

## Goal

把已完成 MVP 的 Workbench App 从“功能可用”推进到“适合日常高频使用”：补齐基础状态反馈、项目归档、启动反馈、设置入口和前端交互测试。

## Scope

本计划覆盖下一轮优化：

- 项目管理增加数据层面的归档和恢复。
- 项目启动反馈从临时前端状态升级为更清楚的最近启动请求状态。
- 补齐主模块的空状态、加载状态、错误状态和表单校验反馈。
- 设置页补齐常用本地路径入口。
- 引入前端交互测试，并接入统一验证命令。

## Non-Goals

- 不删除、移动或修改用户本地项目目录。
- 不内嵌终端，不捕获项目启动日志，不管理进程停止或重启。
- 不实现 AI Radar 外部采集、自动抓取、定时任务或 LLM 总结。
- 不设计或实现 AI Radar 导入能力；AI Radar 后续单独规划优化。
- 不实现 Agent 配置中心、Obsidian 连接、插件系统或在线 Skills 市场。
- 不重构整体前端架构，不拆分已有 Rust 模块，除非当前改动直接需要。

## Assumptions And Decisions

- 项目归档只作用于 Workbench SQLite 中的项目记录，不触碰本地真实项目目录。
- 默认项目列表展示活跃项目；已归档项目通过筛选查看。
- 已归档项目可以恢复。
- 已归档项目不参与 Skills 详情中的默认项目启用列表，避免日常列表膨胀。
- 当前轮次不提供“删除项目记录”功能。
- 前端测试采用 Vitest + Testing Library，并将测试命令接入 `pnpm verify`。
- UI 优化必须遵守 `DESIGN.md` 的高密度桌面工作台方向。
- ADR gate: not needed。本计划没有新的硬性架构取舍；项目归档是可逆数据字段扩展，测试工具是常规工程配置。

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `DESIGN.md`
- `design-tokens.json`
- `src/App.tsx`
- `src/components/ui.tsx`
- `src/lib/api/workbenchApi.ts`
- `src/lib/types/domain.ts`
- `src-tauri/src/projects.rs`
- `src-tauri/src/radar.rs`
- `src-tauri/src/skills.rs`

## Implementation Steps

### 1. Add Project Archive State

Status: done

Tasks:

- 为项目数据模型增加 `archived` 布尔状态。
- 为 SQLite `projects` 表增加迁移逻辑，默认 `archived = false`。
- 更新项目保存、加载和 legacy 数据兼容逻辑。
- 在项目页面增加状态筛选：活跃、已归档、全部。
- 在项目详情或操作列提供归档和恢复入口。
- 确保归档操作只更新 Workbench 数据库，不访问、不移动、不删除项目路径。

Verification:

- Rust 测试覆盖旧数据迁移后默认未归档。
- Rust 测试覆盖归档状态可保存和加载。
- 前端手动验证活跃、已归档、全部筛选结果正确。
- 归档项目后，本地项目目录保持不变。

### 2. Improve Project Launch Feedback

Status: done

Tasks:

- 将项目启动后的 UI 状态从仅显示“已启动请求”优化为包含最近启动请求时间。
- 启动失败时展示明确错误，不把失败项目标记为已启动请求。
- 对未配置启动项、启动项命令为空、工作目录不存在的状态给出清楚提示。
- 保持 MVP 边界：不追踪真实进程、不捕获日志、不提供停止按钮。

Verification:

- 启动成功后项目行和详情显示最近启动请求时间。
- 启动失败时 Toast 或错误提示可见，状态不误标记。
- `pnpm verify` 通过。

### 3. Standardize Empty, Loading, Error, And Validation States

Status: done

Tasks:

- 为项目、Skills、AI Radar 列表统一空状态文案和操作入口。
- 为初始加载和刷新操作增加轻量加载状态，避免用户不知道是否正在工作。
- 为 Tauri command 错误统一展示用户可理解的信息。
- 为项目、Radar 表单补齐必填项和 URL 校验的前端提示。
- 为 Skills 导入、扫描、删除和冲突解决流程补齐失败提示。

Verification:

- 空项目、空 Skills、空 Radar 数据时页面不出现空白区域。
- 表单必填项缺失时无法提交，并展示字段级或弹窗内错误。
- 后端错误能被展示，不只停留在控制台。
- Lighthouse Accessibility 和 Best Practices 在桌面快照中保持通过。

### 4. Improve Settings Local Path Entrypoints

Status: done

Tasks:

- 设置页展示 Workbench 数据库路径、Workbench 根目录、Skills 根目录。
- 为上述路径提供打开目录按钮。
- 如果路径不存在或打开失败，展示明确错误。
- 保持设置页高密度面板布局，不新增 Dashboard。

Verification:

- 点击打开 Workbench 根目录和 Skills 根目录可打开系统资源管理器。
- 路径打开失败时有可见错误提示。
- 设置页在 `1024×680` 视口下不产生不必要的页面级滚动。

### 5. Add Frontend Interaction Tests

Status: done

Tasks:

- 引入 Vitest、Testing Library 和 jsdom。
- 增加基础测试脚本，例如 `pnpm test`。
- 将前端测试接入 `pnpm verify`。
- 覆盖至少以下交互：
  - 项目列表按归档状态筛选。
  - 项目弹窗必填校验。
  - Radar 搜索和分类筛选。
  - Skills 空状态或分类筛选。
  - 主题切换不会破坏主导航可访问名称。
- 避免为测试重写页面结构；只做必要的可测试性调整。

Verification:

- `pnpm test` 通过。
- `pnpm verify` 包含并通过前端测试。
- 现有 Rust 22 个测试继续通过。

### 6. Final Verification And Documentation Closeout

Status: done

Tasks:

- 更新 `README.md`、`CONTEXT.md`、`docs/ARCHITECTURE.md`、`DESIGN.md` 中与本轮优化相关的当前事实。
- 更新 `CHANGELOG.md`。
- 运行 Dev Flow 文档检查。
- 对项目、Skills、Radar、设置四个页面进行桌面视口快速检查。

Verification:

- `pnpm verify` 通过。
- `pnpm tauri:verify-build` 通过。
- Dev Flow `validate-docs` 无错误。
- Lighthouse desktop snapshot 的 Accessibility 和 Best Practices 不低于 MVP 验证结果。
- `git status --short --branch --untracked-files=all` 只包含本计划相关变更。

## Risks

- 项目归档会改变项目列表默认可见性，需要确保筛选和恢复入口足够清楚。
- 前端测试引入新依赖，可能需要调整 `pnpm verify` 的耗时和稳定性。
- 统一错误状态容易扩大成全局通知系统，第一版应保持轻量。

## Acceptance Criteria

- 项目可以归档和恢复，且不会触碰本地实际项目目录。
- 默认项目列表可以隐藏已归档项目，并支持查看全部和已归档项目。
- 项目启动成功和失败都有清楚反馈。
- 项目、Skills、AI Radar、设置具备基本空状态、加载状态和错误状态。
- 项目和 Radar 表单具备必要前端校验。
- 设置页可打开 Workbench 本地数据相关目录。
- 前端交互测试已接入统一验证。
- 所有验证命令通过。

## Artifact Routing

- Plan: `docs/plans/archived/2026-06-14-improve-mvp-daily-usability.md`
- Product scope updates: `docs/PRD.md` only if current product范围 changes
- Architecture updates: `docs/ARCHITECTURE.md`
- Design system updates: `DESIGN.md` and `design-tokens.json` when UI rules change
- Context map: `docs/ai/context-map.md`
- Changelog: `CHANGELOG.md`
- Implementation code: `src/` and `src-tauri/`
- Tests: frontend test files and Rust unit tests

## Closeout

日用体验优化已完成，本计划归档保留作为执行记录。
