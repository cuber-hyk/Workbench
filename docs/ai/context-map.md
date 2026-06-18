# Context Map

本文档用于快速定位 Workbench App 的长期上下文。

Do not read `docs/plans/`, `docs/audits/`, or archived directories by default.

## 产品与范围

- `docs/PRD.md`：当前能力基线、产品原则、非目标和后续方向。
- `README.md`：项目状态、运行方式和模块概览。
- `CONTEXT.md`：当前阶段、关键边界和模块状态。

## 架构与实现

- `docs/ARCHITECTURE.md`：技术栈、目录结构、核心模块、数据模型和关键流程。
- `src/App.tsx`：当前前端页面和主要交互入口。
- `src/lib/types/domain.ts`：前端领域类型。
- `src/lib/api/workbenchApi.ts`：前端到 Tauri commands 的 API 边界。
- `src-tauri/src/lib.rs`：Tauri command 注册入口。
- `src-tauri/src/projects.rs`：项目持久化、目录选择和启动逻辑。
- `docs/capabilities/project-management.md`：项目管理当前能力、启动项、外部工具打开 Profiles、数据所有权和错误边界。
- `docs/adr/2026-06-16-project-open-profiles.md`：项目打开方式使用全局 Profiles、并与启动配置分离的决策。
- `docs/capabilities/app-update.md`：应用更新入口、Tauri updater 配置、GitHub Releases 更新来源和发布签名边界。
- `src-tauri/src/radar.rs`：资源 Radar 持久化、GitHub Stars 手动同步、URL 去重、重复组合并、校验和链接打开逻辑。
- `docs/capabilities/resource-radar.md`：资源 Radar 当前能力、领域分类、数据所有权、同步规则和重复组合并规则。
- `docs/adr/2026-06-16-resource-radar-duplicate-merge.md`：资源 Radar 重复组合并后删除副资源的长期决策。
- `src-tauri/src/skills.rs`：Skills 扫描、导入、启用、冲突、删除和 SQLite 逻辑。
- `docs/capabilities/skills-management.md`：Skills 当前能力、分类与筛选语义、数据所有权、同步边界和验证。
- `docs/references/skills-manager-engineering-lessons.md`：从 `E:\Development\12-工具-Utility\Agent\skills-manager` 提炼的工程借鉴，不是当前能力事实。
- `docs/references/skills-manager-feature-lessons.md`：从 `skills-manager` 提炼的功能借鉴和取舍，不是 PRD 承诺范围。

## 设计

- `DESIGN.md`：设计系统规则和 UI 模式。
- `design-tokens.json`：设计 token 精确值。
- `UI/`：讨论用静态原型，不是正式构建入口。

## Dev Flow

- `AGENTS.md`：项目级 Agent 工作规则。
- `docs/plans/`：当前开发计划。
- `docs/audits/`：审核记录。
- `docs/adr/`：架构决策记录。
