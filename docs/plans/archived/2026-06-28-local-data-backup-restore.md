---
artifact_type: plan
status: archived
created: 2026-06-28
updated: 2026-06-28
owner: codex
---

# Local Data Backup And Restore Plan

## Goal

Add a first-version manual backup and restore workflow for Workbench local data.
Extend it with debounced automatic SQLite backups after successful database-changing operations.

## Scope

- Add Settings > Local Data actions for creating and restoring a backup.
- Backup only the SQLite database file `workbench.sqlite`.
- Include a `manifest.json` in the backup package.
- Restore only `workbench.sqlite` from a backup package.
- Before restore, save the current database as a timestamped `.before-restore` copy.
- After restore, tell the user to restart Workbench.
- Add automatic backups that run after successful SQLite-changing operations with debounce and retention.
- Let users enable/disable automatic backup and choose retention from 10, 20, or 30 versions.

## Non-Goals

- Do not back up `skills/` entity directories.
- Do not back up project folders, logs, npm cache, tokens, or environment variables.
- Do not add cloud sync.
- Do not watch the SQLite file directly.
- Do not back up on read-only operations, health checks, update checks, directory open, or project launch.
- Do not hot-reload all app state after restore.
- Do not introduce cross-version migration logic beyond manifest validation.

## Assumptions And Decisions

- The backup package is a `.zip` file containing `workbench.sqlite` and `manifest.json`.
- `manifest.json` records backup format version, creation time, Workbench version, source Workbench root, SQLite file name and size, and `includesSkillsDirectory: false`.
- Restore requires a valid manifest and SQLite entry.
- Restore replaces the live SQLite file after saving the current file to `workbench.sqlite.before-restore-<timestamp>`.
- UI copy must clearly state that Skills entity files are not included.
- Automatic backups use the same SQLite + manifest format as manual backups.
- Automatic backup delay is 5 minutes after a successful data-changing operation.
- Minimum interval between automatic backups is 30 minutes.
- Automatic backups are named `workbench-auto-backup-<timestamp>.zip`.
- Retention applies only to automatic backups and never deletes manual backups.
- Default automatic backup setting is off with retention 10.

## Fact Sources

- `CONTEXT.md`: Workbench is local-first; SQLite and Skills root are local sources of truth.
- `docs/ARCHITECTURE.md`: SQLite path is `~/.workbench/workbench.sqlite`; default Skills root is `~/.workbench/skills`.
- `docs/ai/context-map.md`: settings, API, and Tauri command routing.
- `DESIGN.md`: settings rows stay compact; destructive or data-affecting actions need confirmation.
- `src/views/settings/SettingsView.tsx`: current Local Data settings UI.
- `src-tauri/src/lib.rs`: Tauri command registration.
- `src-tauri/src/skills/db.rs`: database path and default Workbench root conventions.

## Split Guidance

Classification: proposed owner module, no split of existing large files.

Code placement constraints:

- Add backend owner module `src-tauri/src/data_backup.rs`.
- Register commands only in `src-tauri/src/lib.rs`.
- Add frontend API boundary `src/lib/api/dataBackupApi.ts`.
- Keep UI changes in `src/views/settings/SettingsView.tsx` and existing settings dialogs/components.
- Do not add backup logic to `src-tauri/src/skills.rs`.
- Do not add app-level backup state to `src/App.tsx` unless existing props require a narrow callback.

## Steps

1. `done` Backend backup command
   - Add `create_local_data_backup`.
   - Use Workbench root, read `workbench.sqlite`, create backup directory if needed, write zip with SQLite and manifest.
   - Verification: Rust unit test creates temp database and asserts zip entries and manifest fields.

2. `done` Backend restore command
   - Add inspection and restore path.
   - Validate zip manifest and SQLite entry, save current database copy, replace SQLite, return restore summary.
   - Verification: Rust unit test restores from backup and asserts current database backup copy exists.

3. `done` Frontend API and types
   - Add `dataBackupApi.ts` with Tauri invoke wrappers and web-preview fallbacks.
   - Verification: TypeScript compile.

4. `done` Settings UI
   - Add Local Data section actions: create backup, restore backup, open backup directory if useful.
   - Use confirmation before restore and show restart guidance after success.
   - Verification: React test covers backup button, restore confirmation, and restore success message.

5. `done` Documentation and lifecycle
   - Update `CHANGELOG.md`.
   - Update `docs/ai/context-map.md` if new backend/API files become durable routing points.
   - Archive this plan after implementation.
   - Verification: Dev Flow docs validation.

6. `done` Automatic backup settings and scheduler
   - Add backend settings, scheduler state, data-change marker command, debounce, minimum interval, and auto-backup retention.
   - Verification: Rust unit tests cover settings defaults, retention pruning, and scheduler decision rules.

7. `done` Data-change notifications
   - Notify auto-backup scheduler after current frontend API write operations succeed.
   - Verification: TypeScript compile and React integration test for settings UI.

## Verification

- `node_modules\.bin\tsc.cmd --noEmit`
- `node_modules\.bin\vitest.cmd run src/App.test.tsx`
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast data_backup -- --nocapture`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `node_modules\.bin\vite.cmd build`
- `node_modules\.bin\tauri.cmd build --no-bundle`
- Dev Flow docs validation

## Risks

- Replacing SQLite while the app is running can leave in-memory state stale; first version mitigates this by prompting restart after restore.
- Backup package does not include Skills entity files; UI must state this clearly.
- Zip restore must reject missing manifest, missing SQLite entry, and unsupported backup format.
- Frontend-side data-change notification must stay aligned with current write APIs; future write commands need the same marker call.

## Acceptance Criteria

- User can create a local backup package from Settings > Local Data.
- Backup package contains exactly the SQLite database and manifest.
- User can restore from a valid backup after confirmation.
- Current SQLite is copied to a timestamped before-restore file before replacement.
- Restore success tells the user to restart Workbench.
- No Skills entity files are included or overwritten by backup/restore.
- User can enable automatic backup and choose retention 10, 20, or 30.
- Successful write operations schedule one debounced automatic backup.
- Automatic retention removes only old `workbench-auto-backup-*.zip` files.

## Artifact Routing

- Plan: `docs/plans/archived/2026-06-28-local-data-backup-restore.md`.
- Changelog: update `CHANGELOG.md`.
- Context map: update if new code entry points are added.
- ADR: not expected; first version follows confirmed local-first backup policy.
- Design system impact: none; reuse settings rows, buttons, modal/confirmation patterns.
