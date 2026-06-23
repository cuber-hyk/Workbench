---
artifact_type: audit
status: archived
created: 2026-06-23
updated: 2026-06-23
scope: "UI consistency across interactions, dialogs, buttons, icons, popovers, tables, status indicators, and pagination"
source_of_truth: code
---

# UI Consistency Audit

## Scope

Reviewed the current React UI implementation for consistency of semantic interaction patterns, not pixel-level sameness.

Included:

- Shared UI components in `src/components/ui.tsx`.
- Global CSS rules in `src/styles.css`.
- Project, Skills, skills.sh market, updates, Radar, settings, app update, and dialog surfaces under `src/views/` and `src/components/dialogs/`.
- Existing `DESIGN.md` rules and `design-tokens.json`.

Non-goals:

- No visual redesign.
- No code changes.
- No exhaustive browser screenshot matrix.
- No mobile layout audit, because `DESIGN.md` records mobile as a known gap.

## Fact Sources

- Code:
  - `src/components/ui.tsx`
  - `src/styles.css`
  - `src/views/projects/ProjectsView.tsx`
  - `src/views/skills/SkillsView.tsx`
  - `src/views/skills/SkillsMarketView.tsx`
  - `src/views/skills/SkillUpdatesView.tsx`
  - `src/views/radar/RadarView.tsx`
  - `src/views/settings/SettingsView.tsx`
  - `src/components/AppUpdatePanel.tsx`
  - `src/components/dialogs/`
- Tests:
  - `src/App.test.tsx`
  - `src/components/ui.test.tsx`
- Docs:
  - `DESIGN.md`
  - `design-tokens.json`
  - `CONTEXT.md`
  - `docs/ai/context-map.md`
- Runtime checks:
  - `node -e "JSON.parse(require('fs').readFileSync('design-tokens.json','utf8')); console.log('design-tokens.json valid')"`
  - `pnpm exec vitest run src/App.test.tsx -t "global tool icons|opens launch log details|imports"`

## Summary

The UI already has a usable consistency foundation:

- `Button`, `IconButton`, `Modal`, `ConfirmDeleteModal`, `StatusBadge`, `ActionGroup`, `PaginationBar`, `SearchInput`, `Toolbar`, `Panel`, and `DetailHeader` cover most repeated semantics.
- Delete confirmations are mostly unified through `ConfirmDeleteModal`.
- Pagination is now consistent across long-list modules.
- Table rows, row cards, detail headers, status badges, and action columns mostly match `DESIGN.md`.
- Skills category management intentionally differs from generic delete confirmation because `DESIGN.md` specifies inline delete/merge confirmation above the category table.

The main inconsistency is not visual styling alone. It is transient interaction behavior: similar popover/dropdown surfaces close differently and can remain open in ways users would not expect after using the fixed Skills `+N` menu.

## Findings

All findings are `verified`; this archived audit has no remaining follow-up work.

| ID | Severity | Status | Finding | Evidence | Owner Plan | Branch/Commit | Verification | Closeout |
|---|---|---|---|---|---|---|---|---|
| UI-CONSISTENCY-1 | P2 | verified | Transient popovers do not share one dismissal model. Skills global `+N` now supports outside-click close and single-open state, but project open-profile menus, Radar `FilterMore`, and Skills import menu still only close through local toggles or item clicks. This means similar dropdown/popover interactions behave differently across modules. | `src/views/skills/SkillsView.tsx` keeps `expandedToolSkillId` at view level and closes on document `pointerdown`; `src/views/projects/ProjectsView.tsx` `ProjectOpenProfileMenu` keeps local `open` state only; `src/components/ui.tsx` `FilterMore` only receives `expanded/onToggle`; `src/views/skills/SkillsView.tsx` `importMenuOpen` only closes after selecting import option or clicking the trigger. CSS shows all four are visually similar popovers: `.tool-more-popover`, `.row-menu-popover`, `.filter-popover`, `.import-menu`. | `docs/plans/archived/2026-06-23-ui-consistency-fixes.md` | `task/20260623-ui-consistency-fixes` | `pnpm test` and `pnpm verify` passed; focused tests cover project open-profile single-open/outside-close, Radar `FilterMore` outside-close, Skills import menu outside-close, and existing Skills `+N` behavior. | fixed |
| UI-CONSISTENCY-2 | P3 | verified | Complex modal footers do not consistently group secondary, close, and primary actions. Most dialogs use a clear cancel/primary or left-secondary/right-primary pattern, but root migration places four sibling buttons directly in the `Modal` footer. Because `.dialog-card footer` uses `justify-content: space-between`, the actions can look evenly distributed instead of semantically grouped. | `src/components/dialogs/skills/SkillsRootMigrationDialog.tsx` passes four footer siblings: `重新检查`, `关闭`, `迁移可迁移项`, `重建受管目标`. `src/components/dialogs/skills/SkillsImportDialog.tsx` already groups the right-side completion/overwrite actions in `.import-footer-actions`, and `ExternalSkillsDialog` uses a structured `.sync-footer`. `DESIGN.md` says footer actions should preserve clear task structure and destructive/conflict information should be visible before confirmation. | `docs/plans/archived/2026-06-23-ui-consistency-fixes.md` | `task/20260623-ui-consistency-fixes` | `pnpm test` and `pnpm verify` passed; targeted root migration dialog test verifies grouped footer actions and refreshing spin state. | fixed |
| UI-CONSISTENCY-3 | P3 | verified | Top-level sync buttons do not use a consistent loading affordance. Skills shows the refresh icon spinning while syncing; Resource Radar disables the button and changes text to `同步中`, but the same refresh icon remains static. Users see two equivalent sync actions respond differently. | `src/views/skills/SkillsView.tsx` renders `<RefreshCcw className={isSyncingSkills ? "spin" : ""} size={15} />`; `src/views/radar/RadarView.tsx` renders `<RefreshCcw size={15} />` even when `syncingGithubStars` is true. `src/styles.css` defines `.spin { animation: spin .9s linear infinite; }`. | `docs/plans/archived/2026-06-23-ui-consistency-fixes.md` | `task/20260623-ui-consistency-fixes` | `pnpm test` and `pnpm verify` passed; Radar GitHub sync test verifies disabled `同步中` button uses `.spin`. | fixed |
| UI-CONSISTENCY-4 | P3 | verified | Other refresh/check buttons with explicit busy text also miss the shared spinning refresh affordance. App update and Skills update check buttons change to `检查中`, but the `RefreshCcw` icon remains static. This is the same feedback class as `UI-CONSISTENCY-3`, outside the top-level Skills/Radar pair. | `src/components/AppUpdatePanel.tsx` renders `<RefreshCcw size={15} />` for the settings panel check button and `<RefreshCcw size={16} />` for the update dialog header action while `checking` changes labels/titles to `检查中`; `src/views/skills/SkillUpdatesView.tsx` renders `<RefreshCcw size={15} />{checking ? "检查中" : "检查全部"}`. In contrast, `ExternalSkillsDialog` uses `className={loading ? "spin" : ""}` and `className={syncing ? "spin" : ""}` for equivalent busy feedback. | `docs/plans/archived/2026-06-23-ui-consistency-fixes.md` | `task/20260623-ui-consistency-fixes` | `pnpm test` and `pnpm verify` passed; tests cover app update panel/dialog checks, Skills update check, market refresh/retry loading, root migration inspection, and market refresh skeletons. Skills remote update checking now runs through `spawn_blocking`. | fixed |
| UI-CONSISTENCY-5 | P2 | verified | Skills 子页面专属动作常驻在顶栏，导致技能市场和更新页也显示本地 Skills 动作。`同步 Skills`、`管理分类` 和 `导入 Skills` 操作的是本地统一根目录、分类和导入，不属于技能市场或更新页；这些动作应迁移到本地 Skills 子页面内容区，和技能市场的 `刷新市场`、更新页的 `检查/更新` 动作形成一致的信息架构。 | `src/views/skills/SkillsView.tsx` 在 `skills-header-actions` 中无条件渲染 `同步 Skills`、`管理分类`、`导入 Skills`，所以三个子视图都会显示。`SkillsMarketView` 自身已经在工具栏提供 `刷新市场`；`SkillUpdatesView` 自身已经在顶部提供 `检查全部`、`更新选中项`、`更新全部可更新项`。`DESIGN.md` 已更新为：Skills 子视图动作按归属放在各自内容区，`同步 Skills`、`管理分类` 和 `导入 Skills` 只属于本地 Skills。 | `docs/plans/archived/2026-06-23-ui-consistency-fixes.md` | `task/20260623-ui-consistency-fixes` | `pnpm test` and `pnpm verify` passed; SkillsView tests verify 本地 Skills actions are present only in 本地 Skills root management area and absent from 技能市场/更新. | fixed |

Archived after all findings were verified and closed as fixed.

## Rejected Candidates

- Category delete/merge not using `ConfirmDeleteModal`: rejected. `DESIGN.md` explicitly says Skills category delete/merge confirmation should expand above the category list, so this is an intentional semantic variant.
- skills.sh market using `SkillStatusIndicator` instead of `StatusBadge`: rejected. `DESIGN.md` explicitly calls out market install status as a dedicated semantic indicator.
- Raw buttons in tab-like controls (`skills-subnav`, sync tabs, launch log tabs): rejected for now. These are semantic tabs/segmented controls with dedicated CSS, not ordinary action buttons.
- Log URL links using raw `<button>`: rejected. They are inline text links inside a log surface and are intentionally not rendered as normal buttons.

## ADR Gate

- Needed: no
- Reason: The findings are interaction consistency and component reuse issues. They do not change source-of-truth ownership, data model, architecture, persistence, or hard-to-reverse product policy.

## Verification

- Closeout verification:
  - `pnpm build`
  - `pnpm test`
  - `pnpm verify`
  - Dev Flow docs validation during review closeout

- Commands run:
  - `git status --short --branch --untracked-files=all`
  - `rg -n "<Modal|footer=|IconButton|Button|StatusBadge|ActionGroup|PaginationBar|tool-more|import-menu|open-profile-menu|toast|switch-control" src`
  - `rg -n "row-menu|row-menu-popover|filter-popover|import-menu|setOpen\\(|setImportMenuOpen|showMoreFilters|aria-expanded" src/views src/components src/App.tsx src/styles.css`
  - `rg -n "<button" src/App.tsx src/views src/components`
  - `rg -n "variant=.danger.|ConfirmDeleteModal|Delete.*Dialog|删除" src/views src/components src/App.tsx`
  - `rg -n "同步 Skills|同步 GitHub Stars|isSyncingSkills|syncingGithubStars|spin" src/views/skills/SkillsView.tsx src/views/radar/RadarView.tsx src/styles.css`
  - `rg -n "RefreshCcw|checking|loading|syncing|isSyncing|updating|installing|uninstalling|disabled=\\{|className=\\{.*spin|扫描中|同步中|检查中|更新中|安装中|卸载中|刷新" src/App.tsx src/views src/components`
  - `rg -n "<Button[^\\n]*RefreshCcw|<RefreshCcw" src/App.tsx src/views src/components`
  - `rg -n "同步 Skills|Skills 使用|本地 Skills / 技能市场 / 更新|刷新/同步|分页控件" DESIGN.md docs/audits/2026-06-23-ui-consistency-audit.md`
  - `node -e "JSON.parse(require('fs').readFileSync('design-tokens.json','utf8')); console.log('design-tokens.json valid')"`
  - `pnpm exec vitest run src/App.test.tsx -t "global tool icons|opens launch log details|imports"`
- Additional notes:
  - No Playwright screenshot matrix was run for every module.
  - No keyboard focus trap audit or accessibility contrast tooling was run; these were outside this audit scope.

## Git Visibility

- After creating this file, run `git status --short --branch --untracked-files=all`.
- If this file is ignored, add a minimal allow rule or report that the audit is not tracked.

## Closeout

- Final action: archived.
- Reason: every finding is verified, implementation and tests are complete, and the audit retains useful traceability for the UI consistency sweep.
- Closeout reason for all findings: fixed.
