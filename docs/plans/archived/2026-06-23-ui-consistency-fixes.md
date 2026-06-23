---
artifact_type: plan
status: archived
created: 2026-06-23
updated: 2026-06-23
owner: agent
plan_readiness: ready
source_audit: "docs/audits/archived/2026-06-23-ui-consistency-audit.md"
covered_findings:
  - UI-CONSISTENCY-1
  - UI-CONSISTENCY-2
  - UI-CONSISTENCY-3
  - UI-CONSISTENCY-4
  - UI-CONSISTENCY-5
deferred_findings: []
---

# UI Consistency Fixes

## Goal

Make repeated Workbench UI interactions behave consistently across equivalent scenarios: transient popovers dismiss the same way, refresh/sync/check buttons show the same busy feedback, Skills subview actions live in the correct subview, and complex modal footers preserve clear action grouping.

## Scope

- In scope:
  - Standardize transient popover dismissal for project open-profile menus, Radar more filters, Skills import menu, and Skills global `+N` overflow.
  - Move `同步 Skills`、`管理分类`、`导入 Skills` from the Skills global header into the 本地 Skills subview action area.
  - Apply consistent `RefreshCcw` busy feedback to refresh/sync/check/retry actions, including actions that need a small local busy state.
  - Group root migration modal footer actions by semantic role.
  - Add focused regression tests for the changed interaction rules.
- Out of scope:
  - Redesigning the visual language, colors, typography, or page layout beyond the specific consistency fixes.
  - Treating project restart actions as refresh/loading actions; those `RefreshCcw` icons mean restart, not refresh/check/sync.
  - Mobile layout work.
  - Reworking unrelated dialogs or converting every raw tab button to a shared component.

## Plan Readiness

- Goal clear: yes.
- Scope clear: yes; the plan covers all active findings from the UI consistency audit.
- Source of truth known: yes; `DESIGN.md`, the active audit, and current React/CSS implementation.
- Critical decisions confirmed: yes; user confirmed Skills actions should move into the 本地 Skills subview and agreed refresh/check/retry buttons should share rotating feedback.
- Validation path known: yes; targeted React tests, full frontend tests, build, and docs validation.

## Assumptions And Decisions

- `同步 Skills`、`管理分类`、`导入 Skills` are 本地 Skills actions only.
- 本地 Skills actions belong in the unified root management area, not the filter toolbar.
- 技能市场 and 更新 keep their own local action bars and should not show 本地 Skills management actions.
- All refresh/sync/check/retry actions that use `RefreshCcw` should show a rotating icon while work is in progress.
- Skills update checks should enter visible loading immediately and run external CLI work off the Tauri main command path.
- Manual skills.sh market refresh should reuse the initial market skeleton, even when old market results exist in memory.
- If a refresh/check action already has a loading prop or status, reuse it.
- If a refresh/check action can trigger an async call but lacks local busy state, add the smallest owner state in the current owning component instead of introducing a global loading system.
- Immediate full-page reload can set a local click/loading state only until the browser reloads; no durable state is required.
- Existing `.spin` animation remains the shared visual affordance.
- No ADR is needed because this is UI interaction consistency, not a hard-to-reverse architecture or data decision.

## Confirmed Decisions

| Decision | Chosen route | Confirmed by | ADR gate |
|---|---|---|---|
| Skills header action ownership | Move 本地 Skills actions into the 本地 Skills subview content area; leave market/update actions in their subviews. | User confirmation on 2026-06-23; `DESIGN.md` updated. | not needed |
| Refresh/retry/check feedback | Treat refresh/sync/check/retry `RefreshCcw` buttons as one semantic family and show rotating feedback during work. | User confirmation on 2026-06-23. | not needed |
| Project restart icons | Keep out of refresh feedback rule because they mean restart, not refresh/check/sync. | Engineering classification from current UI semantics. | not needed |
| Implementation style | Reuse existing components and `.spin`; add small shared or local interaction helpers only where repetition justifies it. | Project simplicity and surgical-change rules. | not needed |

## Fact Sources

- Design rules:
  - `DESIGN.md`
  - `design-tokens.json`
- Source audit:
  - `docs/audits/archived/2026-06-23-ui-consistency-audit.md`
- Relevant code:
  - `src/components/ui.tsx`
  - `src/styles.css`
  - `src/App.tsx`
  - `src/views/skills/SkillsView.tsx`
  - `src/views/skills/SkillsMarketView.tsx`
  - `src/views/skills/SkillUpdatesView.tsx`
  - `src/views/radar/RadarView.tsx`
  - `src/views/projects/ProjectsView.tsx`
  - `src/views/settings/SettingsView.tsx`
  - `src/components/AppUpdatePanel.tsx`
  - `src/components/dialogs/skills/SkillsRootMigrationDialog.tsx`
- Tests:
  - `src/App.test.tsx`
  - `src/components/app-update.test.tsx`
  - `src/components/ui.test.tsx`

## Split And Code Placement Guidance

- Classification: no module split required.
- Rationale:
  - The task touches several UI surfaces, but each change belongs to the existing owner component for that surface.
  - `src/App.tsx` may need a small owner state for root migration inspection, but no new app-level subsystem.
  - Shared UI behavior should stay in `src/components/ui.tsx` only if it is genuinely reusable across at least two surfaces; otherwise keep local to the owning view.
- Constraints:
  - Do not create generic `utils`, `helpers`, `common`, or `misc` files.
  - Do not move business logic or Tauri commands.
  - Do not broaden the task into a visual redesign.

## Steps And Verification

Allowed step statuses: `todo`, `done`, `blocked`.

| ID | Status | Step | Verification |
|---|---|---|---|
| PLAN-1 | done | Add or update focused tests that describe the intended repeated behaviors before or alongside implementation: popovers close on outside click and do not stack; Skills local-only actions disappear from market/update; refresh/check buttons show `spin` while busy. | `src/App.test.tsx` and `src/components/app-update.test.tsx` cover single-open/outside-click popovers, Skills local-only actions, market/update loading, app update checks, Radar sync, and root migration checks. |
| PLAN-2 | done | Move Skills 本地 actions into the 本地 Skills content area. Remove unconditional rendering of `同步 Skills`、`管理分类`、`导入 Skills` from the Skills header, and keep market/update action layouts owned by their subviews. | `SkillsView` tests verify these actions are present in 本地 Skills and absent from 技能市场/更新. |
| PLAN-3 | done | Standardize refresh/sync/check/retry busy feedback. Reuse existing loading props for Radar sync, Skills update check, market refresh/retry, app update check, external Skills sync/scan, and add owner-local busy state for root migration inspection and any reload/check action that currently lacks a state but triggers async work. | Focused tests verify `spin` class appears while busy; `pnpm test` and `pnpm verify` passed. |
| PLAN-4 | done | Standardize transient popover dismissal. Project open-profile menu, Radar `FilterMore`, Skills import menu, and Skills global `+N` should close on outside click; only one equivalent row/menu popover should stay open where stacking is possible. | Interaction tests verify project open-profile single-open/outside-close, Radar `FilterMore` outside-close, and Skills import menu outside-close; existing Skills `+N` regression remains covered. |
| PLAN-5 | done | Group root migration modal footer actions by semantic role: secondary utility actions on the left, close/cancel and primary migration/rebuild actions grouped predictably on the right. | Targeted test verifies grouped footer actions and spinning refresh state; CSS now groups `.migration-footer` and `.migration-footer-actions`. |
| PLAN-6 | done | Run verification gates and update lifecycle artifacts. Run focused tests, full frontend tests/build, design-system check, changelog gate, audit finding status updates, and docs validation. | `pnpm build`, `pnpm test`, and `pnpm verify` passed. Changelog and linked audit were updated; Dev Flow docs validation was run during closeout. |
| PLAN-7 | done | Refine follow-up UI feedback: move 本地 Skills actions from the filter toolbar into the unified root management area, rename update check action to `检查更新`, prevent Skills update remote checks from blocking the window, and show full market skeletons during manual refresh. | Tests cover market refresh skeletons with existing results; verification rerun during final review. |

## Acceptance Criteria

- Skills header no longer shows 本地 Skills management actions while the user is on 技能市场 or 更新.
- 本地 Skills still exposes `同步 Skills`、`管理分类`、`导入 Skills` in a discoverable local action area.
- 本地 Skills management actions are not mixed with search/filter controls.
- Refresh/sync/check/retry buttons that are busy show rotating `RefreshCcw` feedback and are disabled where duplicate requests would be harmful.
- Skills update checks show immediate loading feedback and do not block the app window while the external CLI check runs.
- Manual market refresh uses the same skeleton loading surface as initial market load.
- Project open-profile, Radar more filters, Skills import menu, and Skills tool overflow popovers dismiss on outside click.
- Row-level popovers do not stack across rows.
- Root migration modal footer visually groups utility, close, and primary actions.
- Existing delete confirmation, pagination, status badge, and market status behavior remains unchanged.
- Regression tests cover the consistency rules most likely to regress.

## Artifact Routing

- Capability updates: none expected.
- Design system update: already updated in `DESIGN.md`; implementation should check against it but should not add new rules unless behavior changes again.
- Audit output: update `docs/audits/2026-06-23-ui-consistency-audit.md` during implementation closeout.
- Source audit: `docs/audits/archived/2026-06-23-ui-consistency-audit.md`.
- Covered findings: `UI-CONSISTENCY-1`, `UI-CONSISTENCY-2`, `UI-CONSISTENCY-3`, `UI-CONSISTENCY-4`, `UI-CONSISTENCY-5`.
- Deferred findings: none.
- ADR gate: not needed; reason: no data model, source-of-truth, persistence, or architecture ownership change.
- Tests: update `src/App.test.tsx` and `src/components/app-update.test.tsx` as needed; add `src/components/ui.test.tsx` coverage only if a shared UI primitive changes.
- Changelog: needed if implementation changes user-visible UI behavior.
- Context map: no update expected unless new component/module ownership is introduced.

## Git Visibility

- After creating this file, run `git status --short --branch --untracked-files=all`.
- If this file is ignored, add a minimal allow rule or report that the plan is not tracked.

## Closeout

- Final action: archived.
- Reason: all non-deferred steps are done, linked audit findings are verified, and the plan retains useful traceability for the UI consistency sweep.
- Verification:
  - `pnpm build`
  - `pnpm test`
  - `pnpm verify`
