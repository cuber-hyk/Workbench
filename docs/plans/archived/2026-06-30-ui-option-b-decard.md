---
artifact_type: plan
status: archived
created: 2026-06-30
updated: 2026-06-30
owner: codex
---

# UI 统一工作台去卡片化计划

## Goal

把正式 React UI 收敛到已确认的统一工作台分栏方向，优先去除当前主页面的过度卡片化和容器割裂感。

本轮目标是建立稳定、紧凑、专业的工作台骨架：页面标题区、命令条、主工作区、列表区、右侧 Inspector。先不追求最终视觉精修，也不引入卡片浏览模式。

## Scope

- 调整正式代码中的主页面布局和样式，不以 `UI/` 静态稿为构建入口。
- 重点覆盖：
  - `src/views/projects/ProjectsView.tsx`
  - `src/views/skills/SkillsView.tsx`
  - `src/views/radar/RadarView.tsx`
  - `src/styles.css`
  - 必要时小幅调整 `src/components/ui.tsx`
- 去除普通页面区域中的大卡片感、过大 gap、重复面板外框和 input-like 只读详情。
- 保留项目、Skills、Radar 的现有数据流、Tauri API、命令、筛选和分页行为。
- Skills 详情中项目级启用不再作为右侧详情里的大型开关列表；右侧仅保留摘要和入口，独立管理视图留作后续功能阶段。

## Non-Goals

- 不实现新的卡片浏览模式。
- 不实现项目页“项目 Skills”管理页面。
- 不实现 Skills 页“Skill 项目”宽屏管理页面。
- 不改数据库 schema、Tauri command、领域类型或后端逻辑。
- 不做整体品牌视觉重设。
- 不追求机械拆分或行数下降。
- 不改设置页结构，除非共享样式调整产生明显回归。

## Assumptions And Decisions

- 用户已确认采用统一工作台分栏，先去卡片化，后续再逐步做 UI 设计精修。
- 当前 `UI/workbench-redesign.*` 是讨论用静态视觉稿，不作为本轮正式实现来源。
- 正式 UI 的 source of truth 是 React 视图和 `DESIGN.md`。
- 列表与详情仍是项目、Skills、Radar 的主工作模式。
- Radar 可以保留 Row Card 语义，但需要扁平化为列表行，不做多列卡片墙。
- 本轮不创建新的跨领域 UI 框架文件；如果需要抽象，仅在 `src/components/ui.tsx` 增加有明确职责的小型共享组件。

## Fact Sources

- `AGENTS.md`：中文沟通、简单优先、外科手术式修改、不直接 push、前端模块归属规则。
- `CONTEXT.md`：当前模块状态和本地优先边界。
- `docs/ai/context-map.md`：相关入口文件。
- `DESIGN.md`：列表 + 详情工作模式、禁止普通页面区域嵌套卡片、紧凑桌面工作台方向。
- `src/App.tsx`：应用壳和全局状态 owner。
- `src/components/ui.tsx`：现有 Button、Panel、PageHeader、Toolbar、DetailHeader、StatusBadge 等共享 UI。
- `src/styles.css`：当前布局和页面样式。
- `src/views/projects/ProjectsView.tsx`：项目列表、详情和启动日志页。
- `src/views/skills/SkillsView.tsx`：本地 Skills、项目启用、市场和更新视图编排。
- `src/views/radar/RadarView.tsx`：Radar 列表、详情、重复组合并提示。

## Dev Split Result

Classification: `defer / local cleanup`

- `src/App.tsx` 和 `WorkbenchApp` 是候选大文件，但本轮不应拆分，也不应继续往 App 增加 UI 行为。App 保持应用壳和全局状态编排入口。
- `src/views/projects/ProjectsView.tsx`、`src/views/skills/SkillsView.tsx`、`src/views/radar/RadarView.tsx` 由各自页面职责拥有，本轮只做局部布局重排和样式收敛。
- `src/styles.css` 较大，但当前是设计 token 和全局 UI 样式集中地。本轮先做局部样式替换，不创建新的 generic CSS 文件。
- Future trigger: 如果后续要实现 `ProjectSkillsView` 或 `SkillProjectsView` 宽屏管理页，再按 owner 视图创建具体命名模块，而不是继续塞进现有详情区。

Code placement constraints:

- Do not add to: `src/App.tsx`，除非需要传递已有状态到现有视图，且没有更局部的 owner。
- Do not create: `utils`, `helpers`, `common`, `misc`, `part-*`。
- Shared UI changes go only to `src/components/ui.tsx` when至少两个主视图立即复用。
- Project-only layout or helper stays in `src/views/projects/ProjectsView.tsx`.
- Skills-only layout or helper stays in `src/views/skills/SkillsView.tsx`.
- Radar-only layout or helper stays in `src/views/radar/RadarView.tsx`.

## Steps

### 1. Establish Workspace Shell Styles

Status: done

Work:

- In `src/styles.css`, introduce or adjust neutral workspace classes for:
  - page work area
  - command/toolbar strip
  - split list + inspector surface
  - flat list panel
  - inspector panel
- Reduce page padding, panel gaps, and visual double borders.
- Keep existing class names where possible to minimize JSX churn.

Verification:

- `pnpm build`
- Visual check in desktop viewport that page outer area no longer reads as stacked cards.

### 2. De-card Projects View

Status: done

Work:

- Keep project table as the primary list.
- Keep row-level actions stable.
- Convert project detail from input-like read-only fields to label/value inspector sections where practical.
- Keep launch items summary usable, but reduce nested card feel.
- Do not add project Skills management in this step.

Verification:

- `pnpm test`
- Manual check: project selection, launch button, open directory/profile menu, edit/delete actions remain visible.

### 3. De-card Skills Local View

Status: done

Work:

- Keep local Skills as table management view.
- Keep `本地 Skills / 技能市场 / 更新` subview behavior.
- Convert root/actions area into a tighter management strip.
- Replace right-side project enablement list with a compact project enablement summary.
- Keep global tool toggles and conflict panel readable.

Verification:

- `pnpm test`
- Manual check: category dropdown, global tool toggles, open `SKILL.md`, delete skill, import menu, sync button still work.

### 4. De-card Radar View

Status: done

Work:

- Keep Radar in list + inspector mode.
- Flatten `row-card` styling so it reads as a row list, not separated cards.
- Keep duplicate group conflict panel compact.
- Keep favorite and delete as row-level actions.
- Keep details in inspector without bottom action duplication.

Verification:

- `pnpm test`
- Manual check: search/filter/favorite/delete/edit/open link and duplicate merge still work.

### 5. Visual And Regression Verification

Status: done

Work:

- Run the standard frontend verification.
- Run the app locally and inspect `项目`, `Skills`, `设置` and the launch log page in desktop and narrow widths.
- Check light and dark themes for contrast and obvious overlap.
- Check no horizontal scroll appears in default desktop width.

Verification:

- `pnpm build`
- `pnpm test`
- Browser visual verification in light and dark themes.

## Risks

- `src/styles.css` changes can affect settings, dialogs, market, updates, and import flows because styles are global.
- Removing card-like styling too broadly could make nested dialogs or focused panels lose necessary framing.
- Skills detail currently contains real project-level toggles; replacing them with summary changes visible workflow. This is user-confirmed direction but needs careful phrasing and no backend behavior change.
- Existing tests may assert text and interactions but not visual layout; manual visual inspection remains necessary.

## Acceptance Criteria

- Main pages use a visibly unified workbench split layout rather than stacked page cards.
- Projects, local Skills, and Radar still support current selection, filtering, pagination, and row actions.
- Radar list no longer reads as large separated cards.
- Project and Skill details read as inspectors, not editable form cards when in read-only mode.
- Skills right detail no longer carries a long project enablement switch list.
- No new card browsing UI is introduced.
- No Tauri command, database schema, domain type, or backend behavior changes.
- `pnpm build` and `pnpm test` pass, or any failure is explicitly reported.

## Artifact Routing

- Plan: `docs/plans/2026-06-30-ui-option-b-decard.md`
- Code: `src/views/*`, `src/components/ui.tsx` only if needed, `src/styles.css`
- Design system impact: updated `DESIGN.md` and `design-tokens.json` with the confirmed page header, table header and launch log workspace rules.
- Context map impact: none expected unless new owner modules are introduced.
- ADR: not expected; this is a UI layout route already aligned with existing `DESIGN.md`.

## Closeout

- Result: archived after implementation and user visual approval.
- Verification: `pnpm test` passed with 103 tests; `pnpm build` passed.
- Visual verification: project, Skills, settings and launch log headers align at 88px on desktop; Skills tabs wrap without clipping at 1100px; light and dark themes have no page-level horizontal overflow.
- Durable rules: captured in `DESIGN.md` and `design-tokens.json`.
- ADR gate: not needed because this is a reversible UI layout refinement with no architecture, data or API decision.
