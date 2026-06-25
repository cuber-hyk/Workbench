---
artifact_type: plan
status: archived
created: 2026-06-24
updated: 2026-06-24
owner: Codex
---

# Remote Project Import

## Goal

支持从 GitHub 或 Gitee 远程仓库导入项目：用户通过项目页入口选择本地导入或远程导入，选择本地父目录后由 Workbench 调用本机 `git clone`，展示导入进度，并在成功或失败时给出明确通知。

## Scope

- 将项目页“添加项目”改为紧凑下拉入口，提供“本地导入”和“GitHub/Gitee 导入”两个动作。
- 本地导入继续复用现有 `ProjectDialog` 和 `save_project` 路径。
- 新增 GitHub/Gitee 导入弹窗，收集仓库 URL、父目录、项目名称、标签和备注。
- 后端使用本机 `git` CLI 执行 clone，并通过 Tauri event 推送阶段进度。
- 导入成功后把 clone 后的本地目录保存为项目记录，并刷新项目列表、选中新项目、toast 成功。
- 导入失败时保留可读错误，toast 使用 warning/danger 语义；只清理本次创建且导入前不存在的空/部分目标目录。
- Git 缺失时不自动安装，只提示用户选择稍后自行安装或查看安装提示。
- 远程导入成功后的项目与本地导入项目完全同构，不持久化远程来源 URL，不做差异化生命周期。
- 移除项目归档产品入口，改为删除 Workbench 项目记录；删除不删除本地目录。
- 用户访问项目目录相关动作时，如果路径不存在，弹窗说明并询问是否删除 Workbench 项目记录。
- 远程导入开始前同时检查 Workbench 项目记录和本地目标目录，按四种组合状态分流，不把冲突伪装成卡住的进度。

## Non-Goals

- 不自动安装 Git，不修改 PATH，不配置 SSH key、GitHub/Gitee 凭据或代理。
- 不支持 GitHub/Gitee 以外的 Git remote。
- 不自动推断启动命令、包管理器或项目类型。
- 不持久化导入任务历史；导入状态只服务当前操作。
- 不覆盖已有本地目录或已有项目路径。
- 不自动删除本地目录，也不在列表加载时静默删除缺失路径的项目记录。
- 不持久化远程来源，不实现无需用户重新提供 URL 的自动重拉或项目来源历史。

## Assumptions And Decisions

- 用户已确认入口使用“添加项目”下拉框，分流本地导入和 GitHub/Gitee 导入。
- 用户已确认远程导入使用本机 `git`，缺失时询问/提示，不由 Workbench 静默安装。
- 用户已确认选择的是本地父目录，最终路径由仓库名派生为父目录下的子目录。
- 用户已确认失败清理策略：只清理本次导入创建且导入前不存在的目标目录；已有目录或用户文件不删除。
- 支持来源限定为 GitHub 和 Gitee；URL 校验接受 `https://github.com/owner/repo(.git)`、`git@github.com:owner/repo.git`、`https://gitee.com/owner/repo(.git)`、`git@gitee.com:owner/repo.git`。
- 远程导入产生的项目默认 `archived=false`，默认启动配置只创建一个空命令启动项，工作目录为 clone 后目录。
- 项目 ID 仍由前端按当前项目创建规则生成，后端继续以 `projects.path` 唯一约束防止重复。
- 用户已确认远程导入后的项目与本地项目没有区别；远程 URL 只用于导入过程，不作为项目元数据保留。
- 用户已确认参考桌面快捷方式语义：只要访问项目目录时发现路径不存在，就提示是否删除 Workbench 项目记录。
- 归档功能当前不适用，项目页入口改为删除；数据库既有 `archived` 字段暂不做破坏性迁移。
- 用户已确认远程导入冲突按两个事实判断：Workbench 是否存在相同路径记录、本地目标目录是否存在。
- 记录和目录都不存在时正常导入；记录和目录都存在时选中已有项目；记录存在但目录缺失时允许确认重新克隆；记录不存在但目录存在时要求选择其他父目录。
- Workbench 不覆盖或删除已有本地目录。记录存在但目录缺失的重新导入会保留原项目记录直到 clone 成功，再使用原项目 ID 更新记录。

## Fact Sources

- `CONTEXT.md`：项目当前阶段、本地优先和模块状态。
- `docs/ai/context-map.md`：项目模块入口和文档路由。
- `docs/capabilities/project-management.md`：项目数据所有权、错误边界、删除记录不移动或删除项目目录。
- `DESIGN.md`：项目页、按钮、弹窗、toast、导入弹窗和列表详情规则。
- `src/views/projects/ProjectsView.tsx`：项目页入口、列表、详情和行级操作。
- `src/components/dialogs/projects/ProjectDialog.tsx`：现有本地项目表单。
- `src/lib/api/workbenchApi.ts`：前端 Tauri API 边界和 progress event 模式。
- `src/lib/types/domain.ts`：`Project`、`ProjectLaunchConfig` 和进度类型归属。
- `src-tauri/src/projects.rs`、`src-tauri/src/projects/`：项目 command facade、SQLite、启动会话和类型边界。
- `src-tauri/src/lib.rs`：Tauri command 注册入口。

## Split Guidance

- Required: yes.
- Source: `/dev-split` scan, 2026-06-24.
- Classification: proposed split for new behavior; no broad split of existing `App.tsx` or `ProjectsView.tsx`.
- Scan result: `src/App.tsx` has 1309 lines and `WorkbenchApp` spans 1111 lines; `src/App.test.tsx` and `src-tauri/src/skills.rs` are large but unrelated to this task.
- Code-placement constraints:
  - Remote import UI belongs in `src/components/dialogs/projects/RemoteProjectImportDialog.tsx`.
  - Project-page add dropdown belongs near project UI, preferably `src/views/projects/ProjectAddMenu.tsx` or a focused local component in `ProjectsView.tsx` if small.
  - Remote import frontend state types belong in `src/lib/types/domain.ts` only when shared across API and UI.
  - API wrapper belongs in `src/lib/api/workbenchApi.ts`.
  - Backend clone behavior belongs in a new concrete owner module under `src-tauri/src/projects/`, such as `remote_import.rs`; `src-tauri/src/projects.rs` remains a command facade.
  - `src/App.tsx` may only own dialog selection, invoking API calls, list refresh, selected-project update and toast coordination.
  - Do not add clone process parsing, URL normalization, path cleanup, or progress mapping logic to `src/App.tsx`.
  - Do not create generic `utils`, `helpers`, `common`, or `misc` modules.
- Deferred split trigger: if implementation needs reusable dropdown/menu behavior across modules, defer shared component extraction until a second real consumer exists.

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| PLAN-1 | done | Prove current baseline and identify exact UI/API insertion points for project add flow, toast, Tauri invoke, command registration and project persistence. | Completed through code orientation and focused tests. |
| PLAN-2 | done | Add domain/API contract for remote import: request, result and progress event types; preview-mode behavior should simulate progress without touching filesystem. | Passed `pnpm verify`. |
| PLAN-3 | done | Implement backend remote import owner module: validate GitHub/Gitee URL, derive safe target directory name, check `git --version`, reject existing/non-empty target paths, run `git clone`, emit staged progress, persist resulting `ProjectRecord`, and clean only owned-created target directories on failure. | Rust unit tests passed through `pnpm verify`. |
| PLAN-4 | done | Wire Tauri command and frontend API subscription for remote import progress, mirroring existing skills install progress style. | Passed `pnpm verify`; progress listener cleanup remains scoped to API call. |
| PLAN-5 | done | Replace project page primary add button with an accessible compact dropdown: “本地导入” opens existing `ProjectDialog`; “GitHub/Gitee 导入” opens the new dialog. | Frontend test covers local and remote menu actions. |
| PLAN-6 | done | Build remote import dialog with repository URL, parent directory picker, optional metadata, progress state, disabled duplicate submit, success/failure summary and Git-missing guidance. | Frontend test covers selected parent directory, request payload and progressbar value. |
| PLAN-7 | done | Replace project archive UI with delete-record semantics and add backend deletion command. | Frontend and Rust tests cover delete confirmation and deletion of project records plus launch configs. |
| PLAN-8 | done | Handle missing project paths when project-directory access is attempted: open directory, open with profile, and launch should offer deleting the Workbench record. | Frontend tests cover missing-path prompt from open directory and launch failure; no local files are deleted. |
| PLAN-9 | done | Update project capability docs and context map if new backend module or durable project behavior is added; run full verification. | `pnpm verify` passed. Dev Flow docs validation passed with unrelated existing warnings. |
| PLAN-10 | done | Add remote import preflight inspection for the four record/directory combinations and allow confirmed re-clone only when the managed record exists but its directory is missing. | Rust tests cover all four states, reject unsafe bypasses and preserve the original project record. |
| PLAN-11 | done | Add conflict-specific dialog actions: select existing project, re-import missing managed path, or choose another parent directory. | Frontend tests cover each conflict action without cloning in unsafe states. |
| PLAN-12 | done | Show an explicit failed progress state instead of leaving the last running percentage/message after import errors. | Frontend test asserts failure badge/message and retry availability. |
| PLAN-13 | done | Update durable docs and rerun complete verification. | `pnpm verify` and Dev Flow docs validation passed. |

## Edge Cases To Cover

- Git executable missing from PATH.
- Git exists but clone exits non-zero, including authentication failure, network failure, repository not found and host key/SSH failure.
- Unsupported URL host or malformed repository URL.
- Repository URL has `.git`, trailing slash, uppercase host, nested path, query string or fragment.
- Parent directory is empty, missing, not a directory, inaccessible or cancelled from picker.
- Derived target directory already exists.
- Clone creates a partial directory and then fails.
- Clone succeeds but project persistence fails because a project with the same path already exists.
- User closes dialog during import; implementation should prevent duplicate submit and keep listener cleanup deterministic.
- Progress is stage-based, not byte-accurate download progress.
- User deletes or moves a project directory outside Workbench; accessing project directory should show a missing-path confirmation instead of silently removing records.
- User deletes a project record while the project is running; Workbench should require stopping active launch sessions first.
- Deleting a project record must not delete local project files.
- Workbench record and target directory both exist: do not clone; allow selecting the existing project.
- Workbench record exists and target directory is missing: allow explicit re-import while preserving the old record until clone succeeds.
- Workbench record is missing and target directory exists: do not clone or take over; require another parent directory.
- Import errors must replace the running progress message with a visible failed state.

## Acceptance Criteria

- 项目页顶部“添加项目”入口能清楚选择本地导入或 GitHub/Gitee 导入。
- 本地导入行为保持原有能力不回退。
- GitHub/Gitee 导入成功后，本地目录存在，项目列表刷新，新项目被选中，并显示成功 toast。
- 导入过程中有可见进度；失败时弹窗和 toast 都能说明失败原因。
- Git 缺失时不执行 clone，并给出明确安装/稍后处理提示。
- 不支持的远程来源不能开始导入。
- Workbench 不覆盖、不删除用户已有目录；失败清理只作用于本次导入创建的目录。
- 远程导入成功后的项目与本地项目行为一致，不显示或保存远程来源差异。
- 项目页不再提供归档/恢复入口，改为删除 Workbench 记录并明确“不删除本地文件”。
- 访问项目目录时发现路径不存在，会询问是否删除 Workbench 记录；确认后列表刷新且不删除任何本地文件。
- 重复导入会在 clone 前按项目记录和目标目录的四种组合状态分流；只有受管记录存在且目录缺失时允许确认重新克隆，并保留原项目配置。
- 导入失败时进度区显示“失败”和具体错误，允许重新尝试，不停留在运行中百分比。
- `pnpm verify` 通过，相关 Rust/TypeScript 测试覆盖关键边界。

## Artifact Routing

- Plan: `docs/plans/2026-06-24-remote-project-import.md`
- Source audit: none.
- Covered findings: none.
- Deferred findings: none.
- Capability docs: update `docs/capabilities/project-management.md` after implementation.
- Context map: update `docs/ai/context-map.md` if new owner module becomes durable entry point.
- Changelog: maybe; user-visible project import capability should be recorded if this repository maintains release notes for current cycle.
- Distill: needed after implementation, because project capability docs and possibly context map need durable updates.
- ADR gate: maybe; current route is not hard to reverse, but if Git CLI becomes a long-term external dependency policy for project import, `/dev-distill` should decide whether an ADR is warranted.
- Design system impact: none expected; reuse existing compact button, menu, modal, path input and toast rules. If a reusable dropdown menu component is introduced, run `/dev-design-system`.

## Completion

Completed on 2026-06-24. Every non-deferred step is done, docs routing was updated, and verification passed:

- `pnpm test -- --run src/App.test.tsx` passed: 89 frontend tests.
- Follow-up conflict handling verification passed: 93 frontend tests and 92 Rust tests.
- `pnpm verify` passed: build, 93 frontend tests, 92 Rust tests, `cargo fmt --check`, and `cargo clippy -D warnings`.
- Dev Flow docs validation passed with unrelated existing warnings.
