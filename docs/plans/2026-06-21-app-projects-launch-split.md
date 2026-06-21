---
artifact_type: plan
status: active
created: 2026-06-21
updated: 2026-06-21
owner: codex
---

# App Projects And Launch Split Plan

## Goal

Continue reducing `src/App.tsx` maintenance pressure by moving project view and launch-session leaf logic into focused frontend modules without changing Workbench behavior, app-level state ownership, public test imports, or UI patterns.

## Scope

- Split the Projects view and launch-session helpers out of `src/App.tsx`.
- Keep `WorkbenchApp` state, effects, dialogs orchestration, and backend API calls owned by `src/App.tsx`.
- Preserve current exports from `src/App.tsx` for tests that already import view and launch helper functions.
- Keep existing Vitest coverage in place for this round.
- Update durable architecture/context docs only if implementation changes source-of-truth file paths.

## Non-goals

- Do not change product behavior, UI copy, styles, design tokens, backend commands, domain types, or API wrapper names.
- Do not introduce global state, a new React context, routing, or a facade layer just to support this split.
- Do not move `src/App.test.tsx` tests in this round.
- Do not split `SkillsView`, `SettingsView`, or remaining dialogs in this round.
- Do not touch unrelated untracked plan files.

## Assumptions And Decisions

- Decision: this focused plan implements the next part of `docs/plans/2026-06-21-large-code-split.md` PLAN-4.
- Decision: split Projects/launch before Skills because the boundary is clearer and existing tests exercise the behavior.
- Decision: keep `WorkbenchApp` in `src/App.tsx` so state ownership remains simple and reviewable.
- Decision: use `src/views/projects/` to match the existing `src/views/radar/` feature directory pattern.
- Decision: keep public test imports stable by re-exporting moved functions from `src/App.tsx` during this round.
- Assumption: existing tests in `src/App.test.tsx` represent the current intended behavior for project filtering, launch status, launch logs, and launch event state merging.
- Assumption: `docs/plans/2026-06-21-sandbox-profile.md` is unrelated and must remain untouched.

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/ARCHITECTURE.md`
- `DESIGN.md`
- `docs/plans/2026-06-21-large-code-split.md`
- `src/App.tsx`
- `src/App.test.tsx`
- `src/views/radar/RadarView.tsx`
- `src/lib/types/domain.ts`
- `src/lib/api/workbenchApi.ts`
- `package.json`

## Current State

- `src/App.tsx` still contains roughly 4,000 lines after Radar and tool icon extraction.
- `src/views/radar/RadarView.tsx` has established a feature-directory precedent for moved view modules.
- `src/App.tsx` still owns:
  - `WorkbenchApp` app-level state and side effects.
  - `ProjectsView`.
  - project launch log UI.
  - launch status and event merge helpers.
  - `SkillsView`, market/update views, `SettingsView`, and remaining dialogs.
- `src/App.test.tsx` still imports `ProjectsView`, launch helpers, and several other exports from `src/App.tsx`.

## Planned Structure

```text
src/App.tsx
src/views/projects/ProjectsView.tsx
src/views/projects/launchState.ts
```

`src/views/projects/ProjectsView.tsx` will contain:

- `ProjectsView`
- `ProjectOpenProfileMenu`
- `LaunchItemsPanel`
- `LaunchLogDetailPage`
- Project and launch display helpers such as status tones, log line rendering, log collection, and launch config summaries.

`src/views/projects/launchState.ts` will contain:

- `getProjectLaunchStatus`
- `applyPendingLaunchEvents`
- `markLaunchRunStopped`
- `mergeLaunchRunSnapshots`
- `enabledLaunchConfigs`
- Internal launch event normalization, session replacement, stop-state, and snapshot merge helpers.

`src/App.tsx` will continue to contain:

- `App`
- `WorkbenchApp`
- App-level state, loading, event subscriptions, toast handling, and dialog orchestration.
- Re-exports for moved functions needed by existing tests.

## Execution Steps

| ID | Status | Step | Verification |
|---|---|---|---|
| APP-PROJ-1 | done | Capture baseline on the implementation branch and confirm only unrelated untracked files are present before editing. | `git status --short --branch --untracked-files=all`; baseline `pnpm test` passed: 3 files, 61 tests |
| APP-PROJ-2 | done | Create `src/views/projects/launchState.ts` and move launch-session pure state helpers from `src/App.tsx`. Re-export required helpers from `src/App.tsx`. | `pnpm build` passed |
| APP-PROJ-3 | done | Create `src/views/projects/ProjectsView.tsx` and move the Projects view, launch log page, launch item panel, project open profile menu, and display-only helpers. Keep all state and callbacks passed by props from `WorkbenchApp`. | `pnpm test` passed; `rg` confirmed moved implementations live under `src/views/projects/` |
| APP-PROJ-4 | done | Remove moved imports and unused types from `src/App.tsx`; keep stable public exports for tests. | `pnpm build` passed; duplicate implementation check passed |
| APP-PROJ-5 | done | Update `docs/ARCHITECTURE.md` and `docs/ai/context-map.md` only if the new project view path becomes durable source knowledge. | `docs/ai/context-map.md` updated; docs validation required before review |
| APP-PROJ-6 | done | Review the final diff for behavior changes, import cycles, stale exports, and accidental test coupling changes before commit approval. | `git diff --check`; `git diff --stat`; manual focused diff review before approval |

## Verification

Required before review:

```powershell
pnpm build
pnpm test
git diff --check
```

If documentation is changed:

```powershell
node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.8.0\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench
```

## Risks

- Moving `ProjectsView` without moving launch helpers together can create awkward imports or duplicated helper logic.
- Re-exporting moved helpers from `src/App.tsx` is temporary test stability, but should not grow into a broad facade.
- `ProjectsView` directly uses `workbenchApi.openLocalPath`; moving it keeps the existing side effect but makes the view module less pure.
- Large mechanical moves can hide behavior changes in diff review.

## Risk Controls

- Move one boundary at a time: launch state first, Projects UI second.
- Keep external API stable for tests during this round.
- Do not introduce new state ownership or context.
- Use focused `rg` checks to confirm helpers are not duplicated in `src/App.tsx`.
- Run full frontend build and tests after the final move.

## Acceptance Criteria

- `src/App.tsx` no longer contains `ProjectsView`, project launch log page implementation, or launch-session pure state helpers.
- `WorkbenchApp` still owns app-level state and passes project/launch callbacks into the moved view.
- Existing `src/App.test.tsx` tests pass without needing broad test rewrites.
- `pnpm build`, `pnpm test`, and `git diff --check` pass.
- The final diff is a focused internal refactor with no behavior, UI copy, type, or backend API change.

## Artifact Routing

- Parent plan: `docs/plans/2026-06-21-large-code-split.md`
- Focused plan: `docs/plans/2026-06-21-app-projects-launch-split.md`
- Source changes: `src/App.tsx`, `src/views/projects/ProjectsView.tsx`, `src/views/projects/launchState.ts`
- Tests: keep in `src/App.test.tsx` for this round
- Capability docs: not expected
- Changelog: not needed for pure internal refactor
- Design system impact: none; reuse existing UI components and current project view patterns
- ADR gate: not needed; this follows the already established `src/views/` module boundary
- Context map: maybe; update after implementation if project view path becomes durable source knowledge

## Closeout

This plan is complete when the focused Projects/launch split is implemented, verified, reviewed, committed if approved, and the parent large-code split plan can mark the corresponding Projects/launch portion of PLAN-4 as done or partially done.
