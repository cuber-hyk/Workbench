---
artifact_type: plan
status: active
created: 2026-06-22
updated: 2026-06-22
owner: codex
---

# Radar Rust Split Plan

## Goal

Split `src-tauri/src/radar.rs` into a stable command facade plus focused Rust modules so resource CRUD, GitHub Stars sync, duplicate merging, and normalization logic can be read and changed independently without changing product behavior or Tauri command names.

## Scope

- Keep `src-tauri/src/radar.rs` as the public command facade used by `src-tauri/src/lib.rs`.
- Move Radar item, duplicate group, GitHub sync result, CLI status, and GitHub star data types into a focused type module.
- Move SQLite schema, migrations, item CRUD, duplicate group persistence, and low-level row loading into a database module.
- Move GitHub CLI status detection, Stars fetching, output parsing, and database sync orchestration into a GitHub module.
- Move duplicate group creation, loading, and merge behavior into a duplicate-focused module.
- Keep URL/source normalization and link opening close to the first owner that needs it; create a `normalize.rs` module only if multiple moved modules need the same helpers after the first pass.
- Preserve current front-end API, Tauri command names, command payload shapes, SQLite schema, error strings, and tests.

## Non-goals

- Do not change resource Radar behavior, UI copy, data semantics, database schema, command names, command payloads, or front-end domain types.
- Do not introduce background sync, token storage, new GitHub API clients, async runtime changes, or a new service abstraction.
- Do not split `src/App.test.tsx` or revisit the completed `projects.rs` and `App.tsx` splits.
- Do not touch the unrelated untracked `docs/plans/2026-06-21-sandbox-profile.md`.
- Do not create generic `utils`, `helpers`, `common`, or mechanical `part` modules.

## Assumptions And Decisions

- Decision: `src-tauri/src/radar.rs` remains the facade so `src-tauri/src/lib.rs` continues registering `radar::...` commands unchanged.
- Decision: split by responsibility, not line count. The confirmed first-pass modules are `types`, `db`, `github`, and `duplicates`.
- Decision: `normalize.rs` is present because DB validation, GitHub URL matching, duplicate merge, and link opening share URL/source normalization helpers.
- Decision: keep existing Radar tests in `radar.rs` for this round unless moving a test with its owner module clearly reduces review noise. The tests cover cross-module behavior and are valuable as facade-level safety.
- Decision: use `pub(crate)` for internal module APIs unless `src-tauri/src/lib.rs` or Tauri command signatures require `pub`.
- Assumption: existing Rust tests cover the intended behavior for schema upgrade, manual CRUD, GitHub sync, duplicate group creation/merge, URL normalization, and GitHub CLI status.

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/capabilities/resource-radar.md`
- `docs/adr/2026-06-16-resource-radar-duplicate-merge.md`
- `docs/plans/2026-06-21-large-code-split.md`
- `src-tauri/src/lib.rs`
- `src-tauri/src/radar.rs`
- `src/lib/api/workbenchApi.ts`
- `src/lib/types/domain.ts`

## Current Candidate Assessment

`src-tauri/src/radar.rs` is a valid split candidate because it combines independently nameable responsibilities:

- public Tauri command facade;
- Radar item, source metadata, duplicate group, GitHub status, and sync-result types;
- SQLite schema creation, migrations, item CRUD, and duplicate group storage;
- GitHub CLI status detection, Stars fetching, and output parsing;
- GitHub Stars synchronization algorithm;
- duplicate group creation, loading, and merge behavior;
- URL/source normalization, validation, and link opening;
- tests for all of the above.

The split is justified by maintenance cost, not file length: changing GitHub Stars sync should not require scanning manual CRUD and link-opening code, and changing duplicate merge rules should not require reading GitHub CLI process code.

Baseline verification observed before planning:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml radar --no-fail-fast
```

Result: passed, 13 Radar tests.

## Target Structure

```text
src-tauri/src/radar.rs
src-tauri/src/radar/
  types.rs
  db.rs
  github.rs
  duplicates.rs
  normalize.rs  # only if shared helper ownership requires it
```

Final ownership:

- `radar.rs`: Tauri commands, `RadarResult`, `default_workbench_root`, stable public re-exports required by command signatures, and existing cross-module Radar tests unless a test move is clearly useful.
- `radar/types.rs`: `RadarSourceMetadata`, `RadarItem`, `RadarDuplicateGroup`, `GitHubStarsSyncResult`, `GitHubCliStatus`, `GitHubStar`, and sync outcome types if used across modules.
- `radar/db.rs`: `open_database`, schema creation, column migrations, `load_radar_items`, `upsert_radar_item`, manual duplicate URL guard, delete item persistence, and shared row loading helpers.
- `radar/github.rs`: `fetch_github_stars`, `detect_github_cli_status`, auth status classification, CLI account parsing, GitHub output parsing, and GitHub Stars sync orchestration.
- `radar/duplicates.rs`: duplicate group schema helpers if not kept in DB, duplicate group creation/update, open duplicate group loading, and duplicate group merge behavior.
- `radar/normalize.rs`: URL/source normalization, URL validation, and `open_url` only if those helpers become genuinely shared across modules.

## Execution Steps

| ID | Status | Step | Verification |
|---|---|---|---|
| RADAR-SPLIT-1 | done | Capture baseline on the implementation branch and confirm only unrelated untracked files are present. | Baseline `cargo test --manifest-path src-tauri/Cargo.toml radar --no-fail-fast` passed: 13 Radar tests. |
| RADAR-SPLIT-2 | done | Create `src-tauri/src/radar/types.rs` and move data structs/enums. Re-export only what facade and command signatures require. | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and Radar tests passed. |
| RADAR-SPLIT-3 | done | Create `src-tauri/src/radar/db.rs` and move SQLite schema, migrations, item CRUD, row loading, manual duplicate URL guard, and delete persistence. Keep schema and error strings unchanged. | Radar CRUD and legacy upgrade tests passed. |
| RADAR-SPLIT-4 | done | Create `src-tauri/src/radar/github.rs` and move GitHub CLI status, Stars fetch/parse, and sync orchestration. Keep GitHub CLI commands and messages unchanged. | GitHub CLI/status/sync tests passed. |
| RADAR-SPLIT-5 | done | Create `src-tauri/src/radar/duplicates.rs` and move duplicate group loading, creation/update, and merge behavior. Decide whether shared normalization warrants `normalize.rs`. | Duplicate group tests passed; `normalize.rs` was created for shared URL/source helpers. |
| RADAR-SPLIT-6 | done | Review module visibility, imports, duplicate implementations, test ownership, and facade stability. Update durable docs only if final source-of-truth paths change. | `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast`, and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passed. |

## Verification Gates

Run during implementation:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml radar --no-fail-fast
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

- GitHub Stars sync, duplicate groups, and manual CRUD share normalization helpers; moving them too early into a generic module can create noisy indirection.
- Duplicate merge behavior has important data ownership rules; moving code must not alter user-field preservation or secondary-item deletion semantics.
- Rust visibility can become too broad if tests or facade calls force helpers to be made public casually.
- Platform-specific `open_url` code should remain covered by compile checks even if it is moved.

## Risk Controls

- Keep `radar.rs` facade stable throughout the split.
- Move one responsibility group at a time.
- Prefer `pub(crate)` over `pub` for internal module boundaries.
- Keep existing error strings, SQL statements, and test names stable unless a test moves with its owner module.
- Create `normalize.rs` only if shared ownership is real after the first module moves.
- Run targeted Radar tests after each module move and full Rust verification before review.

## Acceptance Criteria

- `src-tauri/src/radar.rs` primarily contains Tauri command functions and stable public re-exports.
- Radar types, DB access, GitHub sync, and duplicate group behavior each have a concrete owner module.
- No duplicate moved implementation remains in `radar.rs`.
- `src-tauri/src/lib.rs` command registration remains unchanged or only relies on stable re-exports.
- SQLite schema, migration behavior, command payloads, and user-visible error strings remain unchanged.
- Radar-related Rust tests and full Rust verification pass.
- Documentation is updated only if durable source routing changes.

## Artifact Routing

- Plan: `docs/plans/2026-06-22-radar-rs-split.md`
- Parent plan: `docs/plans/2026-06-21-large-code-split.md`
- Source changes: `src-tauri/src/radar.rs`, `src-tauri/src/radar/`
- Capability docs: maybe; update only if source-of-truth module paths need to be durable.
- Context map: maybe; update if `src-tauri/src/radar.rs` becomes a facade plus module directory.
- Changelog: not expected for a pure internal refactor.
- ADR gate: not needed; this follows the existing facade-plus-modules pattern established by the Skills and Projects splits.
- Design system impact: none.

## Closeout

Completed on 2026-06-22. `src-tauri/src/radar.rs` is now a command facade, with implementation owned by `src-tauri/src/radar/types.rs`, `db.rs`, `github.rs`, `duplicates.rs`, and `normalize.rs`.
