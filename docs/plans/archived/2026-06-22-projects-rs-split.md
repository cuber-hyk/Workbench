---
artifact_type: plan
status: archived
created: 2026-06-22
updated: 2026-06-22
owner: codex
---

# Projects Rust Split Plan

## Goal

Split `src-tauri/src/projects.rs` into a stable command facade plus focused Rust modules so project persistence, project open profiles, and launch-session process management can be read and changed independently without changing product behavior or Tauri command names.

## Scope

- Keep `src-tauri/src/projects.rs` as the public command facade used by `src-tauri/src/lib.rs`.
- Move project, profile, launch-run, launch-session, and registry types into a focused module.
- Move SQLite schema, migrations, project CRUD, launch-config persistence, and profile persistence into a database module.
- Move project open profile validation, default profiles, argument expansion, terminal command construction, and external spawning into a profiles module.
- Move launch-run construction, process spawning, stdout/stderr readers, stop/restart helpers, in-memory snapshots, event emission, and platform-specific process termination into a launch module.
- Preserve existing front-end API, Tauri command names, command payload shapes, SQLite schema, error strings, and tests.

## Non-goals

- Do not change project management behavior, UI copy, database schema, command names, command payloads, or front-end domain types.
- Do not introduce a new persistence layer, service abstraction, async runtime, background worker model, or global path module in this split.
- Do not split `src-tauri/src/radar.rs` or `src/App.test.tsx` in this task.
- Do not touch the unrelated untracked `docs/plans/2026-06-21-sandbox-profile.md`.
- Do not keep duplicate old and new implementations after moving code.

## Assumptions And Decisions

- Decision: `src-tauri/src/projects.rs` remains the facade so `src-tauri/src/lib.rs` can continue registering `projects::...` commands and managing `projects::LaunchSessionRegistry`.
- Decision: split by responsibility, not line count. Current clear boundaries are `types`, `db`, `profiles`, and `launch`.
- Decision: keep the existing project tests in `projects.rs` for this round. They exercise cross-module behavior, continue to pass, and moving them now would broaden the diff without reducing production-code maintenance cost.
- Decision: use `pub(crate)` for internal module APIs unless `src-tauri/src/lib.rs` or Tauri command signatures require `pub`.
- Decision: defer a shared Workbench path module. Current `default_workbench_root()` duplication is related to the separate sandbox profile plan and should not be mixed into this split.
- Assumption: existing project tests are the behavioral safety net for persistence, profiles, launch session state, and legacy migration.

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/capabilities/project-management.md`
- `docs/adr/2026-06-16-project-open-profiles.md`
- `docs/plans/2026-06-21-large-code-split.md`
- `src-tauri/src/lib.rs`
- `src-tauri/src/projects.rs`
- `src/lib/api/workbenchApi.ts`
- `src/lib/types/domain.ts`

## Current Candidate Assessment

`src-tauri/src/projects.rs` is a valid split candidate because it combines several independently nameable responsibilities:

- public Tauri command facade;
- project and launch/profile data types;
- SQLite schema, migrations, and CRUD;
- global project open profile validation and external tool launching;
- embedded launch-session process management, event emission, and in-memory snapshots;
- tests for all of the above.

The split is justified by maintenance cost, not file length: editing profile launching should not require scanning database migration and launch-session process code, and editing launch-session process handling should not require reading project CRUD details.

Baseline verification observed before planning:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml projects --no-fail-fast
```

Result: passed, 19 project-related tests.

## Target Structure

```text
src-tauri/src/projects.rs
src-tauri/src/projects/
  types.rs
  db.rs
  profiles.rs
  launch.rs
```

Final ownership:

- `projects.rs`: Tauri commands, `ProjectResult`, `default_workbench_root`, stable public re-exports required by `lib.rs`, and existing cross-module project tests.
- `projects/types.rs`: `ProjectRecord`, `ProjectLaunchConfig`, `ProjectOpenProfile`, profile kind, and launch run/session/event/snapshot/status/stream types.
- `projects/db.rs`: `open_database`, schema creation, `ensure_column`, `load_projects`, `upsert_project`, `load_launch_configs`, `migrate_legacy_launch_configs`, `load_project_open_profiles`, `upsert_project_open_profile`, profile deletion persistence, and seed marker persistence.
- `projects/profiles.rs`: default profiles, profile validation, run-time profile validation, project-path checks, app/terminal open flows, `{projectPath}` expansion, terminal command splitting/quoting, and spawn error formatting.
- `projects/launch.rs`: enabled launch config filtering, launch-run creation, session start/stop/restart support, output readers, exit watcher, registry snapshot methods, event emission, shell command construction, process termination, timestamp/id helpers.

## Execution Steps

| ID | Status | Step | Verification |
|---|---|---|---|
| PRJ-SPLIT-1 | done | Capture baseline on the implementation branch and confirm only unrelated untracked files are present. | `git status --short --branch --untracked-files=all`; `cargo test --manifest-path src-tauri/Cargo.toml projects --no-fail-fast` passed, 19 tests |
| PRJ-SPLIT-2 | done | Create `src-tauri/src/projects/types.rs` and move data structs/enums. Re-export only what facade and `lib.rs` require. | `cargo test --manifest-path src-tauri/Cargo.toml projects --no-fail-fast` passed after move |
| PRJ-SPLIT-3 | done | Create `src-tauri/src/projects/db.rs` and move SQLite schema, migrations, project CRUD, launch-config persistence, and profile persistence. Keep schema and error strings unchanged. | Project persistence and migration tests passed; `rg "CREATE TABLE IF NOT EXISTS projects|project_open_profiles" src-tauri/src/projects.rs src-tauri/src/projects` confirms DB owner |
| PRJ-SPLIT-4 | done | Create `src-tauri/src/projects/profiles.rs` and move profile validation, command expansion, terminal/app opening, and spawn helpers. | Profile tests passed; `rg "terminal_command_line|open_project_with_profile_impl" src-tauri/src/projects.rs src-tauri/src/projects` confirms profile owner |
| PRJ-SPLIT-5 | done | Create `src-tauri/src/projects/launch.rs` and move launch run/session creation, process management, registry methods, output readers, event emitters, and platform process helpers. | Launch tests passed; `cargo test --manifest-path src-tauri/Cargo.toml projects --no-fail-fast` passed |
| PRJ-SPLIT-6 | done | Review module visibility, imports, duplicate implementations, test ownership, and facade stability. Update durable docs only if final source-of-truth paths should change. | `rg "pub\\(crate\\)|pub\\(super\\)|^pub " src-tauri/src/projects src-tauri/src/projects.rs`; `cargo fmt --manifest-path src-tauri/Cargo.toml --check`; `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast`; `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passed |

## Verification Gates

Run during implementation:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml projects --no-fail-fast
```

Run before review:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git diff --check
```

Run if documentation or lifecycle artifacts change:

```powershell
node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.8.0\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench
```

## Risks

- Rust visibility can become too broad if moved helpers are made `pub` casually.
- Launch session process code is platform-sensitive; moving `#[cfg(windows)]` and `#[cfg(not(windows))]` helpers can accidentally change compilation boundaries.
- Moving tests too early can hide whether a behavior is owned by DB, profiles, or launch.
- Combining this split with the sandbox path work would blur responsibility and increase risk.

## Risk Controls

- Keep `projects.rs` facade stable throughout the split.
- Move one responsibility group at a time.
- Prefer `pub(crate)` over `pub` for internal module boundaries.
- Preserve existing error strings and test names unless a test moves with its owner module.
- Do not introduce a new shared path abstraction in this task.
- Run targeted Rust tests after each module move and full Rust verification before review.

## Acceptance Criteria

- `src-tauri/src/projects.rs` primarily contains Tauri command functions and stable public re-exports.
- Existing project tests may remain in `projects.rs` as cross-module behavior coverage.
- Project records, profiles, database access, and launch session process management each have a concrete owner module.
- No duplicate moved implementation remains in `projects.rs`.
- `src-tauri/src/lib.rs` command registration and managed state usage remain unchanged or only require stable re-export imports.
- SQLite schema, migration behavior, command payloads, and user-visible error strings remain unchanged.
- Project-related Rust tests and full Rust verification pass.
- Documentation is updated only if durable source routing changes.

## Artifact Routing

- Plan: `docs/plans/2026-06-22-projects-rs-split.md`
- Parent plan: `docs/plans/2026-06-21-large-code-split.md`
- Source changes: `src-tauri/src/projects.rs`, `src-tauri/src/projects/`
- Capability docs: maybe; update only if source-of-truth module paths need to be durable.
- Context map: updated because `src-tauri/src/projects.rs` is now a facade plus module directory.
- Changelog: not expected for a pure internal refactor.
- ADR gate: not needed; this follows the existing facade-plus-modules pattern established by the Skills split.
- Design system impact: none.

## Closeout

Archived on 2026-06-22. `src-tauri/src/projects.rs` is now a command facade, with implementation owned by `src-tauri/src/projects/types.rs`, `db.rs`, `profiles.rs`, and `launch.rs`; the parent large-code split plan records the Projects split as complete.
