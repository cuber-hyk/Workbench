---
artifact_type: plan
status: active
created: 2026-06-21
updated: 2026-06-22
owner: codex
---

# Large Code File Split Plan

## Goal

Reduce maintenance pressure in the largest Workbench source files by splitting along existing responsibility boundaries while keeping public Tauri commands, frontend behavior, domain types, and tests stable.

## Scope

- Split `src-tauri/src/skills.rs` first because it has the clearest module boundaries and the highest line count.
- Split `src/App.tsx` second by moving leaf views, dialogs, and pure helpers before touching `WorkbenchApp` state ownership.
- Evaluate `src-tauri/src/projects.rs` and `src-tauri/src/radar.rs` after the first two rounds; split only if the next work item touches those modules or the extraction remains low risk.
- Move `src/App.test.tsx` tests only after the related frontend components have stable new module paths.

## Non-goals

- Do not change product behavior, UI copy, database schema, Tauri command names, command payloads, or frontend domain types.
- Do not introduce compatibility wrappers for old and new module layouts.
- Do not split files by line count alone.
- Do not refactor unrelated code while moving modules.

## Assumptions And Decisions

- Decision: start with `skills.rs`, then `App.tsx`; keep `projects.rs`, `radar.rs`, and `App.test.tsx` as follow-up candidates.
- Decision: keep facade modules at existing public paths so `src-tauri/src/lib.rs` and frontend imports remain stable where practical.
- Decision: each implementation round must be reviewable on its own and must run targeted verification before moving to the next candidate.
- Assumption: current behavior is represented by existing Rust tests, Vitest tests, capability docs, and the command registration in `src-tauri/src/lib.rs`.
- Assumption: the existing untracked file `docs/plans/2026-06-21-sandbox-profile.md` is unrelated and must not be modified by this plan.

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/ARCHITECTURE.md`
- `docs/capabilities/skills-management.md`
- `docs/capabilities/project-management.md`
- `docs/capabilities/resource-radar.md`
- `src/App.tsx`
- `src/App.test.tsx`
- `src/lib/api/workbenchApi.ts`
- `src/lib/types/domain.ts`
- `src-tauri/src/lib.rs`
- `src-tauri/src/skills.rs`
- `src-tauri/src/projects.rs`
- `src-tauri/src/radar.rs`
- `package.json`

## Current Candidate Inventory

| File | Lines | Assessment |
|---|---:|---|
| `src/App.test.tsx` | 2124 | Still a large test file, but imports now target owner modules. Further test-file splitting is deferred unless future test work makes a clean behavior boundary obvious. |
| `src-tauri/src/skills.rs` | 1888 | Split into a command facade plus focused `src-tauri/src/skills/` modules; no follow-up split needed in this round. |
| `src-tauri/src/projects.rs` | 558 | Split into a command facade plus focused `src-tauri/src/projects/` modules for types, DB, Profiles, and launch sessions. |
| `src-tauri/src/radar.rs` | 1487 | Possible later split; cohesive around resource CRUD, GitHub Stars sync, and duplicate merging. |
| `src/App.tsx` | 1216 | Leaf UI, dialogs, and pure helpers have been moved out. Remaining size is mostly `WorkbenchApp` app-level state and side-effect orchestration; defer further split to a separate state-ownership plan. |

## Execution Steps

| ID | Status | Step | Verification |
|---|---|---|---|
| PLAN-1 | done | Capture the baseline before code changes: run the existing verification most relevant to the first target and record any pre-existing failures. | Baseline `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast` passed: 71 passed. |
| PLAN-2 | done | Split `src-tauri/src/skills.rs` into a facade plus focused modules: `types`, `db`, `filesystem`, `tool_targets`, `market`, and `cli`. Keep `skills::...` command exports stable for `lib.rs`. | `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast`, and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passed. |
| PLAN-3 | done | Review the `skills.rs` split for import cycles, duplicated logic, visibility leaks, and tests that moved with the wrong responsibility. | `rg "pub\\(super\\)|pub\\(crate\\)|^pub " src-tauri/src/skills src-tauri/src/skills.rs`; manual review of facade and module imports completed. |
| PLAN-4 | done | Split `src/App.tsx` leaf UI code without changing `WorkbenchApp` state ownership: move `ProjectsView`, launch helpers, `SkillsView`, market/update views, `RadarView`, `SettingsView`, and dialogs into focused frontend modules. | Observed on App split branches and final integration review: `pnpm build`; `pnpm test`; `git diff --check`. |
| PLAN-5 | done | Retarget frontend tests to follow component ownership after imports stabilized. Keep shell/integration checks in `src/App.test.tsx`; import view-specific checks from owner modules. | Observed on APP-SPLIT-5 and final integration review: `pnpm test`; `pnpm build`; tests continue to assert behavior rather than module layout. |
| PLAN-6 | todo | Re-evaluate `projects.rs` and `radar.rs` after the first two rounds. `projects.rs` has been split with a clean facade; Radar remains a follow-up candidate. | Projects split observed: `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast`; `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` |
| PLAN-7 | todo | Update durable documentation only if module boundaries changed meaningfully. Keep capability docs focused on behavior, not file churn. | `node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.7.2\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench`; `git diff -- docs` |

## Detailed Target Boundaries

### `src-tauri/src/skills.rs`

Planned structure:

```text
src-tauri/src/skills.rs
src-tauri/src/skills/types.rs
src-tauri/src/skills/db.rs
src-tauri/src/skills/filesystem.rs
src-tauri/src/skills/tool_targets.rs
src-tauri/src/skills/importer.rs
src-tauri/src/skills/market.rs
src-tauri/src/skills/cli.rs
```

Rules:

- `skills.rs` remains the command facade.
- Data structs and enums move to `types.rs`.
- SQLite schema, settings, categories, enablements, and source records move to `db.rs`.
- Copy, symlink, hash, backup, and managed target operations move to `filesystem.rs`.
- Built-in/custom tool target registry and path resolution move to `tool_targets.rs`.
- Local import, external discovery, root migration, and managed target rebuild move to `importer.rs`.
- `skills.sh` parsing, market listing/detail, install, uninstall, update check, and update execution move to `market.rs`.
- CLI dependency checks, command construction, temporary HOME path resolution, timeout execution, and CLI extraction move to `cli.rs`.

### `src/App.tsx`

Planned structure:

```text
src/App.tsx
src/views/projects/ProjectsView.tsx
src/views/projects/launchState.ts
src/views/skills/SkillsView.tsx
src/views/skills/SkillsMarketView.tsx
src/views/skills/SkillUpdatesView.tsx
src/views/skills/skillFilters.ts
src/views/skills/skillMarketFormatters.ts
src/views/skills/SkillStatusIndicator.tsx
src/views/radar/RadarView.tsx
src/views/settings/SettingsView.tsx
src/views/settings/settingsFormatters.ts
src/components/dialogs/projects/
src/components/dialogs/settings/
src/components/dialogs/skills/
```

Rules:

- Keep `WorkbenchApp` app-level state in `App.tsx` during the first frontend split.
- Move only components and pure helpers with clear props.
- Avoid introducing a global store or context just to make the split easier.
- Preserve existing UI component reuse from `src/components/ui.tsx`.
- Final split review: no `part1`/`part2`, `utils`, `misc`, or generic glue modules were introduced; remaining `App.tsx` size is a deliberate deferred state/shell boundary, not a failed leaf UI split.

### `src-tauri/src/projects.rs`

Potential structure if later approved:

```text
src-tauri/src/projects.rs
src-tauri/src/projects/types.rs
src-tauri/src/projects/db.rs
src-tauri/src/projects/profiles.rs
src-tauri/src/projects/launch.rs
```

Implemented in `docs/plans/2026-06-22-projects-rs-split.md`. `projects.rs` remains the command facade; `types`, `db`, `profiles`, and `launch` modules own the moved implementation. Existing project tests remain in `projects.rs` for this round as cross-module behavior coverage.

### `src-tauri/src/radar.rs`

Potential structure if later approved:

```text
src-tauri/src/radar.rs
src-tauri/src/radar/types.rs
src-tauri/src/radar/db.rs
src-tauri/src/radar/github.rs
src-tauri/src/radar/duplicates.rs
```

Split only when touching GitHub Stars sync, duplicate group logic, or Radar persistence.

## Risks

- Rust module visibility may become too broad if helpers are made `pub` casually.
- Moving frontend components may break tests if exports are changed before test imports are updated.
- `skills.rs` tests currently live inline; moving implementation without moving tests carefully can reduce coverage clarity.
- Large mechanical moves can hide behavior changes in diffs.

## Risk Controls

- Move one responsibility group at a time.
- Prefer `pub(crate)` over `pub` for internal Rust module boundaries.
- Keep facade functions and command registrations stable.
- Run verification after each target, not only after all targets.
- Use `git diff --stat` and focused diffs before any commit request.

## Acceptance Criteria

- `src-tauri/src/skills.rs` becomes a readable command facade plus focused modules with no behavior change.
- `src/App.tsx` no longer contains every view and dialog implementation, while `WorkbenchApp` state flow remains understandable.
- Existing tests and build commands pass, or any pre-existing failure is documented with evidence.
- No Tauri command name, frontend API wrapper, database table, or domain type is changed without a separate approved plan.
- Follow-up candidates are either split with verification or explicitly deferred with a reason.

## Artifact Routing

- Plan: `docs/plans/2026-06-21-large-code-split.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: maybe; update only if source-of-truth file paths or module boundaries matter for future work
- Changelog: not needed for pure internal refactor unless behavior or operator workflow changes
- Distill: maybe; needed after implementation if durable architecture facts change
- ADR gate: not needed for the proposed first two rounds; maybe if the project adopts a long-term Rust/frontend module convention
- Context map: maybe; update if source-of-truth files move from single files to module directories

## Completion

This plan is complete when all non-deferred steps are done, verification results are recorded, and any durable documentation updates have either been made or explicitly marked unnecessary.
