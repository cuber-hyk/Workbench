---
artifact_type: plan
status: active
created: 2026-06-21
updated: 2026-06-21
owner: dev-branch
---

# 沙盒 Profile 测试环境计划

## 目标

为 Workbench 增加开发测试用沙盒 Profile，使本地手动测试和 Tauri dev 运行可以写入隔离目录，而不是污染真实 `~/.workbench`、真实 Agent 工具目录或真实 SQLite 数据库。

## 范围

- 增加后端统一路径解析入口，支持通过环境变量覆盖 Workbench 数据根目录和测试用户 Home。
- 让项目、Skills、资源 Radar 三个后端模块使用同一个 Workbench 数据根目录解析结果。
- 让内置全局工具目录从可覆盖的用户 Home 推导，避免测试启用 Skills 时写入真实 `.codex`、`.claude` 等目录。
- 增加一个本地开发脚本和 package script，用于启动隔离的 Tauri dev 环境。
- 增加覆盖路径解析和沙盒边界的自动化测试。
- 更新能力文档、架构文档、上下文索引和变更日志。

## 非目标

- 不改变正式用户默认数据目录；未设置沙盒环境变量时仍使用用户 Home 下的 `.workbench`。
- 不迁移真实用户数据。
- 不修改发布包标识、安装路径或 updater 配置。
- 不模拟所有外部工具的真实行为，只隔离 Workbench 对数据库、Skills 根目录、工具 Skills 目录和图标目录的写入。
- 不把沙盒脚本做成用户可见功能；它是开发和测试工具。
- 不引入 Docker、虚拟机或重型端到端环境。

## 假设与决策

- 决策：使用环境变量作为沙盒入口，而不是新增应用设置。理由是该能力服务于开发测试，必须在应用启动前影响数据库位置和工具目录解析。
- 决策：使用 `WORKBENCH_HOME` 覆盖 Workbench 数据根目录。
- 决策：使用 `WORKBENCH_USER_HOME` 覆盖内置工具目录的用户 Home 基准。
- 决策：路径解析集中到新的 Rust 模块，例如 `src-tauri/src/paths.rs`，避免 `projects.rs`、`radar.rs`、`skills.rs` 各自读取 `dirs::home_dir()`。
- 决策：自定义工具目录仍来自 SQLite 配置；沙盒脚本只提供隔离数据库，用户或测试夹具可以在沙盒数据库中配置自定义工具目录。
- 决策：脚本默认不删除已有沙盒内容；如需要重置，提供显式 `-Reset` 参数，并且只允许删除仓库 `.dev/sandbox-profile` 下的路径。
- 假设：当前仓库以 Windows / PowerShell 本地测试为主，脚本优先提供 PowerShell 版本。
- 假设：沙盒 Profile 需要支持手动 UI 测试，不要求一次性覆盖所有真实环境组合。

## 已知不确定性

- Tauri dev 命令对子进程环境变量的继承在本机应正常工作，但实施时仍需要用运行中的设置页实际确认显示路径。
- Windows 上符号链接权限可能因开发者模式或管理员权限而不同；沙盒只隔离路径，不保证强制走 symlink 或 copy。
- 如果未来引入其他模块直接读取用户 Home，需要继续纳入统一路径模块；本计划只覆盖当前后端模块。

## 事实来源

- `CONTEXT.md`：当前默认数据路径、Skills 根目录和本地优先边界。
- `docs/ai/context-map.md`：项目、Skills、Radar 和架构入口。
- `docs/capabilities/skills-management.md`：Skills 数据所有权、工具目录、根目录迁移和受管目标边界。
- `docs/ARCHITECTURE.md`：SQLite 数据根、Skills 根目录和模块职责。
- `src-tauri/src/skills.rs`：当前 `default_workbench_root()`、`tool_target_path()`、SQLite、Skills 和工具目录逻辑。
- `src-tauri/src/projects.rs`：当前项目模块数据库根目录逻辑。
- `src-tauri/src/radar.rs`：当前 Radar 模块数据库根目录逻辑。
- `package.json`：当前验证和 Tauri dev 脚本入口。

## 执行步骤与验证

| ID | 状态 | 步骤 | 验证 |
|---|---|---|---|
| PLAN-1 | todo | 证明当前问题存在：确认项目、Skills、Radar 各自使用 `dirs::home_dir()/.workbench`，且内置工具目录也从真实 Home 推导。 | `rg "dirs::home_dir|default_workbench_root|tool_target_path" src-tauri/src`，记录受影响入口。 |
| PLAN-2 | todo | 新增统一路径模块，提供 `workbench_root()`、`user_home()`、`database_path()` 等小接口，并验证环境变量值必须非空、绝对路径。 | Rust 单元测试覆盖默认路径、`WORKBENCH_HOME` 覆盖、`WORKBENCH_USER_HOME` 覆盖、空值/相对路径拒绝。 |
| PLAN-3 | todo | 将 `projects.rs`、`radar.rs`、`skills.rs` 中重复的 Workbench 根目录解析替换为统一路径模块。 | `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast`，并用 `rg "dirs::home_dir|default_workbench_root" src-tauri/src` 确认只剩允许入口。 |
| PLAN-4 | todo | 将内置全局工具目录解析改为基于 `WORKBENCH_USER_HOME` 覆盖后的用户 Home；项目级工具目录仍基于项目路径，不被用户 Home 覆盖。 | Rust 测试覆盖 Codex/Claude 等全局路径进入沙盒 Home，项目级路径仍进入传入项目路径。 |
| PLAN-5 | todo | 增加 `scripts/dev-sandbox.ps1` 和 `pnpm tauri:dev:sandbox`，创建 `.dev/sandbox-profile/home` 与 `.dev/sandbox-profile/workbench`，设置环境变量后启动 `pnpm tauri:dev`。 | 运行脚本后设置页显示 Workbench 根目录位于 `.dev/sandbox-profile/workbench`，工具目录位于 `.dev/sandbox-profile/home` 下。 |
| PLAN-6 | todo | 增加防误删边界：`-Reset` 只允许删除仓库 `.dev/sandbox-profile` 下的目录；默认启动不清空沙盒。 | 脚本测试或手动检查：无 `-Reset` 保留旧数据；`-Reset` 只重建沙盒目录。 |
| PLAN-7 | todo | 更新文档和变更日志，说明沙盒 Profile 的入口、隔离范围、非隔离范围和验证方式。 | 检查 `docs/ARCHITECTURE.md`、`docs/capabilities/skills-management.md`、`docs/ai/context-map.md`、`CHANGELOG.md`。 |
| PLAN-8 | todo | 完整验证并记录结果。 | `pnpm verify`；必要时补充 `pnpm tauri:dev:sandbox` 的手动路径检查结果。 |

## 边界情况清单

- 未设置环境变量：行为必须与当前正式环境一致。
- `WORKBENCH_HOME` 为空字符串：拒绝或忽略必须明确，计划采用拒绝并返回错误。
- `WORKBENCH_HOME` 为相对路径：拒绝，避免工作目录变化导致写错位置。
- `WORKBENCH_USER_HOME` 为空字符串：拒绝。
- `WORKBENCH_USER_HOME` 为相对路径：拒绝。
- 沙盒目录不存在：脚本和后端可按现有行为创建 Workbench 根目录；工具目录仍遵循现有业务规则，不因发现扫描而创建。
- 沙盒数据库不存在：首次启动创建空数据库和默认配置。
- 真实数据库存在：设置沙盒变量后不得读取真实 `~/.workbench/workbench.sqlite`。
- 真实 `.codex/.claude` 中已有 Skills：设置沙盒变量后外部发现不得扫描真实目录。
- 符号链接创建失败：仍沿用现有 Auto 同步回退 Copy 行为。
- Copy 目标重建：只在沙盒数据库记录的受管目标内操作，不碰真实工具目录。
- 自定义工具目标：沙盒数据库为空时没有真实自定义工具；用户在沙盒内新增的自定义工具只记录在沙盒数据库。
- 打开目录动作：打开的是沙盒路径；如果目录不存在，仍遵循当前打开目录确认创建规则。
- Git 忽略：`.dev/sandbox-profile` 应保持未跟踪，脚本文件本身应跟踪。

## 验收标准

- 设置 `WORKBENCH_HOME` 后，项目、Skills、Radar 共用该目录下的 `workbench.sqlite`。
- 设置 `WORKBENCH_USER_HOME` 后，内置全局工具 Skills 目录全部落在该 Home 下。
- 运行沙盒脚本不会创建或修改真实 `~/.workbench`、真实 `.codex/skills`、真实 `.claude/skills`。
- 不设置任何沙盒变量时，正式默认路径不变。
- 自动化测试覆盖路径覆盖、默认路径、非法路径和内置工具目录隔离。
- `pnpm verify` 通过。
- 文档说明开发者如何启动、重置和验证沙盒 Profile。

## 交付物路由

- Plan：`docs/plans/2026-06-21-sandbox-profile.md`
- Source audit：无
- Covered findings：无
- Deferred findings：无
- Capability docs：预计更新 `docs/capabilities/skills-management.md`
- Architecture docs：预计更新 `docs/ARCHITECTURE.md`
- Context map：预计更新 `docs/ai/context-map.md`
- Changelog：需要；这是开发者可见的测试运行入口和路径隔离能力。
- Tests：需要；Rust 路径解析和 Skills 工具目录隔离测试。
- ADR gate：暂不需要；这是开发测试入口，不改变正式用户数据模型或产品默认行为。若后续把多 Profile 做成用户功能，再进入 ADR。
- Design system impact：none

## 完成条件

所有非延期步骤完成，验证命令通过，沙盒手动路径检查结果已记录，文档和变更日志已更新，实施分支完成 review gate 后归档本计划。
