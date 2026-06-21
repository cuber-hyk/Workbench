---
artifact_type: plan
status: active
created: 2026-06-21
updated: 2026-06-21
owner: codex
---

# App Thorough Split Branch Plan

## Goal

Finish the `src/App.tsx` frontend split in reviewable, low-risk task branches so App-level state stays understandable, view modules own their leaf UI, and each diff remains small enough to verify independently.

## Scope

- Continue the `src/App.tsx` split after the completed Radar extraction and the in-progress Projects/launch extraction.
- Split remaining App leaf areas in separate branches:
  - Settings view.
  - Settings and Skills dialogs.
  - Skills market/update subviews.
  - Skills local view.
  - Test imports after component paths stabilize.
- Keep `WorkbenchApp` state ownership in `src/App.tsx` until leaf views and dialogs are stable.
- Preserve current UI behavior, copy, CSS classes, domain types, backend APIs, and Tauri commands.
- Keep each branch independently buildable, testable, and reviewable.

## Non-goals

- Do not rewrite state management, introduce a global store, add routing, or introduce new React contexts.
- Do not split by line count alone.
- Do not rename product concepts, UI copy, CSS classes, backend commands, or domain models.
- Do not move `WorkbenchApp` into hooks until all leaf UI modules are stable and a separate plan confirms that route.
- Do not migrate all tests in the same branch as component movement unless the branch is specifically the test-import cleanup branch.
- Do not touch unrelated untracked files, especially `docs/plans/2026-06-21-sandbox-profile.md`.

## Assumptions And Decisions

- Decision: use a stacked branch model with `task/20260621-split-app-tsx` as the integration branch for App splitting.
- Decision: first commit the current Projects/launch extraction on `task/20260621-split-app-tsx`; later branches start from that committed integration branch.
- Decision: sub-branches merge back into `task/20260621-split-app-tsx`, not directly into `master`.
- Decision: each sub-branch gets exactly one responsibility boundary and one commit unless a verification fix requires a clearly separate commit.
- Decision: `src/App.tsx` may temporarily re-export moved components/helpers for test stability; the final test-import cleanup branch removes unnecessary re-exports.
- Decision: Settings should be split before Skills because Settings has clearer props and fewer internal async workflows.
- Decision: Skills market/update should be split before the full local `SkillsView` because that reduces the largest and riskiest later diff.
- Assumption: `src/App.test.tsx` remains the behavior safety net until the final test-import cleanup.
- Assumption: existing tests cover the key user-visible behavior affected by these moves.

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `DESIGN.md`
- `docs/ai/context-map.md`
- `docs/ARCHITECTURE.md`
- `docs/plans/2026-06-21-large-code-split.md`
- `docs/plans/2026-06-21-app-projects-launch-split.md`
- `src/App.tsx`
- `src/App.test.tsx`
- `src/views/projects/ProjectsView.tsx`
- `src/views/projects/launchState.ts`
- `src/views/radar/RadarView.tsx`
- `src/lib/ui/toolIcons.tsx`
- `src/lib/api/workbenchApi.ts`
- `src/lib/types/domain.ts`
- `package.json`

## Current State

- `src/App.tsx` has already had Radar and tool icon logic extracted.
- The Projects/launch extraction is currently implemented on `task/20260621-split-app-tsx` and awaits commit approval.
- `src/App.tsx` still contains:
  - `WorkbenchApp` app-level state and side effects.
  - `SkillsView`.
  - Skills market and update subviews.
  - Settings view.
  - Skills, settings, import, migration, delete, and project dialogs.
  - Formatting/filter helpers for Skills and Settings.
- `src/App.test.tsx` still imports several components and helpers through `src/App.tsx`.

## Target Structure

```text
src/App.tsx
src/views/projects/
  ProjectsView.tsx
  launchState.ts
src/views/radar/
  RadarView.tsx
src/views/settings/
  SettingsView.tsx
  settingsFormatters.ts
src/views/skills/
  SkillsView.tsx
  SkillsMarketView.tsx
  SkillUpdatesView.tsx
  skillFilters.ts
  skillMarketState.ts
src/components/dialogs/
  projects/
  settings/
  skills/
src/lib/ui/
  toolIcons.tsx
```

Final `src/App.tsx` ownership:

- `App`
- `AppErrorBoundary`
- `WorkbenchApp`
- Navigation view list.
- Initial loading and refresh orchestration.
- Tauri event subscriptions.
- Toast state and toast rendering.
- Active dialog selection and callback wiring.
- Temporary exports only when needed by tests, removed after test-import cleanup.

## Branch Strategy

### Integration Branch

```text
task/20260621-split-app-tsx
```

Purpose:

- Holds the complete App split series before merging to `master`.
- Receives only reviewed, verified sub-branch merges.
- Does not receive unrelated feature work.

Immediate action before starting sub-branches:

1. Review and commit the current Projects/launch split on `task/20260621-split-app-tsx`.
2. Keep `docs/plans/2026-06-21-sandbox-profile.md` untracked and unrelated unless a separate task handles it.
3. Confirm `pnpm build`, `pnpm test`, and docs validation results are recorded in the commit review.

### Sub-Branches

Create each sub-branch from the latest `task/20260621-split-app-tsx`:

```text
task/20260621-split-app-settings
task/20260621-split-app-dialogs
task/20260621-split-app-skills-market
task/20260621-split-app-skills-view
task/20260621-split-app-tests
```

Merge flow:

```text
sub-branch -> task/20260621-split-app-tsx -> master
```

Rules:

- Do not start the next sub-branch until the previous one is committed and merged into the integration branch.
- Do not squash away evidence if a branch needs a small verification fix; keep commits explainable.
- Do not push unless explicitly requested.
- Before every commit or merge, show `git status` and a concise diff summary, then wait for approval.
- Run `pnpm build`, `pnpm test`, and `git diff --check` on every sub-branch.
- Run Dev Flow docs validation whenever `docs/ai/context-map.md`, plans, architecture docs, or lifecycle artifacts change.

## Execution Steps

| ID | Status | Branch | Step | Verification |
|---|---|---|---|---|
| APP-SPLIT-0 | in_progress | `task/20260621-split-app-tsx` | Commit the current Projects/launch extraction and focused plan after review approval. | Already observed: `pnpm build`, `pnpm test`, `git diff --check`, docs validation |
| APP-SPLIT-1 | todo | `task/20260621-split-app-settings` | Move `SettingsView`, `projectOpenProfileSummary`, and `closeBehaviorLabel` into `src/views/settings/SettingsView.tsx` and `src/views/settings/settingsFormatters.ts`. Keep settings dialogs in `App.tsx` for this branch. | `pnpm build`; `pnpm test`; `rg` confirms no duplicate `SettingsView` implementation in `App.tsx` |
| APP-SPLIT-2 | todo | `task/20260621-split-app-dialogs` | Move leaf dialogs into `src/components/dialogs/` by feature group: project, settings, skills. Keep callback wiring in `WorkbenchApp`. | `pnpm build`; `pnpm test`; focus review dialog props and modal footer behavior |
| APP-SPLIT-3 | todo | `task/20260621-split-app-skills-market` | Move `SkillsMarketView`, `SkillUpdatesView`, skeletons, status indicators, market stats, market detail helpers, update labels, and install count formatting into `src/views/skills/`. Keep `SkillsView` state ownership unchanged if practical. | `pnpm build`; `pnpm test`; verify market install progress and update tests still pass |
| APP-SPLIT-4 | todo | `task/20260621-split-app-skills-view` | Move the remaining local `SkillsView`, `SwitchControl`, `GlobalToolIcons`, `SkillCategorySelect`, `SkillConflictPanel`, and skill filter/status helpers into `src/views/skills/`. | `pnpm build`; `pnpm test`; `rg` confirms Skills view helpers no longer live in `App.tsx` |
| APP-SPLIT-5 | todo | `task/20260621-split-app-tests` | Move or retarget tests after module paths stabilize. Import view tests from their owning modules and keep only App shell/integration tests importing from `src/App.tsx`. Remove unnecessary temporary re-exports from `App.tsx`. | `pnpm test`; `pnpm build`; test names still describe behavior rather than implementation structure |
| APP-SPLIT-6 | todo | `task/20260621-split-app-tsx` | Final integration review before merging to `master`: confirm App ownership boundaries, context map routing, active plans, and final diff stack. | `pnpm build`; `pnpm test`; Dev Flow docs validation; manual independent review |

## Branch Details

### `task/20260621-split-app-settings`

Move:

- `SettingsView`
- `projectOpenProfileSummary`
- `closeBehaviorLabel`

Do not move yet:

- `CustomToolDialog`
- `DeleteCustomToolDialog`
- `ProjectOpenProfileDialog`
- `DeleteProjectOpenProfileDialog`
- `TrayHintDialog`
- `CreateDirectoryDialog`

Reason:

- Settings view is mostly prop-driven and follows established design-system rules.
- Moving dialogs separately keeps the settings diff small and easy to inspect.

Expected docs:

- Update `docs/ai/context-map.md` with `src/views/settings/SettingsView.tsx` after implementation.

### `task/20260621-split-app-dialogs`

Suggested structure:

```text
src/components/dialogs/projects/ProjectDialog.tsx
src/components/dialogs/settings/CustomToolDialog.tsx
src/components/dialogs/settings/ProjectOpenProfileDialog.tsx
src/components/dialogs/settings/DeleteCustomToolDialog.tsx
src/components/dialogs/settings/DeleteProjectOpenProfileDialog.tsx
src/components/dialogs/settings/TrayHintDialog.tsx
src/components/dialogs/settings/CreateDirectoryDialog.tsx
src/components/dialogs/skills/SkillCategoryDialog.tsx
src/components/dialogs/skills/ExternalSkillsDialog.tsx
src/components/dialogs/skills/SkillsRootMigrationDialog.tsx
src/components/dialogs/skills/SkillsImportDialog.tsx
src/components/dialogs/skills/DeleteSkillDialog.tsx
src/components/dialogs/skills/DeleteMarketSkillDialog.tsx
```

Rules:

- Move form-local state with each dialog.
- Keep `WorkbenchApp` deciding when dialogs open and what callbacks they receive.
- Do not merge all dialogs into one index barrel unless imports become genuinely noisy.

### `task/20260621-split-app-skills-market`

Move:

- `SkillsMarketView`
- `SkillUpdatesView`
- `SkillStatusIndicator`
- `MarketListSkeleton`
- `MarketDetailSkeleton`
- `marketItemStatus`
- `marketRepositoryUrl`
- `localMarketDetail`
- `buildMarketStats`
- `updateStatusLabel`
- `formatInstallCount`

State handling:

- Prefer moving only subviews and pure helpers first.
- Keep `SkillsView` tabs, selected market key, loading/error/update state in `SkillsView` unless moving the subview requires local state.
- Do not introduce a store or context.

### `task/20260621-split-app-skills-view`

Move:

- `SkillsView`
- `SwitchControl`
- `GlobalToolIcons`
- `SkillCategorySelect`
- `SkillConflictPanel`
- `skillMatchesStatusFilter`
- `skillMatchesToolProjectFilter`
- `globalStatusLabel`
- `syncMethodLabel`

Rules:

- Reuse `src/lib/ui/toolIcons.tsx`.
- Preserve all table, row, popover, and conflict interaction behavior.
- Keep tests stable through `App.tsx` re-exports until APP-SPLIT-5.

### `task/20260621-split-app-tests`

Move or retarget:

- Project view tests to `src/views/projects/ProjectsView`.
- Launch state tests to `src/views/projects/launchState`.
- Radar view tests to `src/views/radar/RadarView`.
- Settings view tests to `src/views/settings/SettingsView`.
- Skills view tests to `src/views/skills/SkillsView`.

Keep in `src/App.test.tsx`:

- App shell loading and top-level workflow tests.
- Tests that depend on `WorkbenchApp` orchestration across modules.

## Verification Gates

Run on every implementation branch:

```powershell
pnpm build
pnpm test
git diff --check
```

Run when docs or lifecycle artifacts change:

```powershell
node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.8.0\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench
```

Review checklist for each branch:

- Diff contains only the branch's planned ownership boundary.
- `src/App.tsx` loses implementation detail without gaining a new large glue layer.
- Moved files have concrete names and clear imports.
- No duplicate moved implementation remains in `App.tsx`.
- No circular dependency between `App.tsx`, views, dialogs, and `lib`.
- Public behavior and tests remain stable.
- Changelog gate is normally not needed because these are internal refactors.
- Design system update is normally not needed because JSX and styles are moved unchanged.

## Risks

- Moving too much in one branch can hide behavior changes in mechanical diff noise.
- Skills market and update state have async workflows; splitting them together with local `SkillsView` would be high-risk.
- Temporary `App.tsx` re-exports can become permanent clutter if the test cleanup branch is skipped.
- Dialog moves can accidentally change form validation or modal footer behavior if props are altered.
- Long-lived integration branches can drift from `master` if unrelated work lands there.

## Risk Controls

- Commit current Projects/launch split before starting more extraction.
- Use one branch per responsibility boundary.
- Run full frontend build and tests on every branch.
- Prefer direct imports from owner modules only after the test cleanup branch.
- Rebase or merge latest `master` into the integration branch only at controlled checkpoints and after status/diff review.
- Keep `WorkbenchApp` state ownership unchanged until a separate plan proves a state split is worthwhile.
- Stop if a branch requires product, architecture, or state-lifecycle decisions not already confirmed by this plan.

## Acceptance Criteria

- `src/App.tsx` primarily contains App shell, `WorkbenchApp`, app-level state/effects, toast, navigation, and dialog orchestration.
- Views live under `src/views/<feature>/` and own only their feature UI.
- Dialog components live under `src/components/dialogs/<feature>/` or another confirmed feature-specific dialog location.
- Skills market/update/local view modules are independently readable.
- Tests import from stable owner modules after cleanup.
- All branch verification commands pass.
- `docs/ai/context-map.md` identifies durable source files after each durable path move.
- The final integration branch has no unrelated files and is ready for one reviewed merge to `master`.

## Artifact Routing

- Parent plan: `docs/plans/2026-06-21-large-code-split.md`
- Current focused plan: `docs/plans/2026-06-21-app-projects-launch-split.md`
- Thorough branch plan: `docs/plans/2026-06-21-app-thorough-split-branch-plan.md`
- Source routing updates: `docs/ai/context-map.md`
- Capability docs: not expected unless behavior changes
- Changelog: not expected for pure internal refactors
- ADR gate: not needed for leaf UI extraction; maybe needed later if `WorkbenchApp` state ownership changes
- Design system impact: none expected; existing UI patterns and CSS classes are preserved

## Closeout

This plan is complete when all sub-branches are committed, merged into `task/20260621-split-app-tsx`, verified together, and then merged to `master` after explicit approval. After final merge, run Dev Flow check and close or archive App split plans according to the repository lifecycle rules.
