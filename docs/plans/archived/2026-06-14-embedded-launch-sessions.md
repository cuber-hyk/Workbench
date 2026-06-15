---
artifact_type: plan
status: archived
created: 2026-06-14
updated: 2026-06-14
owner: codex
---

# 内嵌项目启动会话

## 目标

用非交互式内嵌启动会话面板替换外部系统终端启动：每个启用启动项在本次启动中独立显示输出，并支持手动停止。

## 范围

- 每次用户启动项目时，创建一组全新的内存会话。
- 每个启用启动项作为一个受管理的子进程启动。
- 通过 Tauri event 将 stdout 和 stderr 流式推送到前端。
- 展示单个会话状态：启动中、运行中、已退出、失败、已停止。
- 支持从 UI 停止活动会话。
- 日志只保存在当前前端内存状态中。

## 非目标

- 不支持交互式 shell 输入。
- 不保存日志或启动历史。
- 不复用旧会话。
- 不接入 PTY 或 `xterm.js`。
- 不支持 SSH、终端标签页、命令历史或 Agent 配置中心。
- 不引入独立 HTTP 后端。

## 假设和决策

- 用户已确认第一版为非交互式，不保存日志，每次启动都是全新的会话。
- 当前 `launch_project` 外部终端行为应被替换为单一启动路径，不保留并行模式。
- Windows 下命令执行应尽量保留用户配置命令的实际语义：在配置的工作目录中通过 `cmd /C` 执行。
- 启动会话状态归当前运行中的 Tauri 进程所有；SQLite 仍只作为项目记录和启动配置的真实来源。
- ADR gate：不需要。该实现是可逆的产品功能收口，当前文档和测试已覆盖维护者需要知道的行为边界。

## 事实来源

- `AGENTS.md`：默认中文文档、简单优先、外科手术式修改、不直接 push、计划放在 `docs/plans/`。
- `CONTEXT.md`：Workbench 是本地优先 Tauri 桌面应用，不引入独立 HTTP 后端。
- `docs/PRD.md`：当前启动会话边界。
- `docs/ARCHITECTURE.md`：当前项目启动流程、Tauri command 和事件流边界。
- `DESIGN.md`：项目列表摘要状态和详情面板会话状态展示规则。
- `src-tauri/src/projects.rs`：项目持久化、启动会话、进程注册表和停止逻辑。
- `src/lib/api/workbenchApi.ts`：前端启动会话 API、事件订阅和停止会话边界。
- `src/lib/types/domain.ts`：`LaunchRun`、`LaunchSession` 和启动事件类型。
- `src-tauri/src/lib.rs`：Tauri command 和 managed state 注册。

## 步骤和验证

| ID | 状态 | 步骤 | 验证 |
| --- | --- | --- | --- |
| PLAN-1 | done | 在 Rust 和 TypeScript 中增加启动会话领域类型：会话 ID、项目 ID/名称、启动项 ID/名称、输出流类型、输出内容、退出码、状态。 | `pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast` 已通过。 |
| PLAN-2 | done | 在 `src-tauri/src/projects.rs` 中将外部终端启动替换为受管理子进程创建；捕获 stdout/stderr，并按会话发出 Tauri events。 | Rust 测试覆盖启动项选择和启动会话生成；实现通过 Rust 测试与 Clippy。 |
| PLAN-3 | done | 增加 Tauri command，用于按会话 ID 停止活动启动会话，或停止当前启动批次的全部会话。 | Rust 测试覆盖停止未知会话会明确失败。 |
| PLAN-4 | done | 更新 `src-tauri/src/lib.rs` command 注册，并将进程注册表放入 Tauri managed state。 | `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast` 已通过。 |
| PLAN-5 | done | 更新 `workbenchApi`：启动会话、订阅/取消订阅启动事件、请求停止会话。 | `pnpm build`、`pnpm test` 已通过。 |
| PLAN-6 | done | 在项目视图中增加内嵌启动会话面板，复用现有紧凑工作台布局，只展示最近一次启动会话组。 | `pnpm test` 覆盖多个启动项会话展示；Playwright 冒烟确认项目页和本次启动面板可见。 |
| PLAN-7 | done | 更新产品和架构文档，描述新的启动边界，并移除“系统终端窗口”作为当前推荐路径的表述。 | Dev Flow 文档检查已通过。 |
| PLAN-8 | done | 运行完整验证。 | `pnpm verify`、`pnpm tauri:verify-build` 和 Dev Flow 文档检查已通过。 |

## 验收标准

- 启动项目时，Workbench 只创建当前运行的启动会话。
- 每个启用且命令非空的启动项都会产生一个独立可见会话。
- stdout 和 stderr 在应用内可见，不打开外部终端窗口。
- 停止运行中会话时，对应子进程被终止，并且会话标记为已停止。
- 已结束进程显示已退出或失败状态，并尽可能展示退出信息。
- 启动输出不写入 SQLite 或文件。
- 再次启动同一项目时，当前可见会话组被新的启动会话替换。
- 旧的外部系统终端启动路径不再是活动实现。

## 风险

- Windows 下停止进程可能需要处理 package manager 启动的子进程树；当前实现使用 `taskkill /T /F` 终止进程树。
- 流式输出可能是 chunk 而不是完整行；UI 使用 `pre-wrap` 和安全换行展示输出。
- 长输出可能增加内存占用；当前第一版不持久化日志，后续如需要可增加每会话内存上限。
- 前端测试不依赖真实 Tauri event 运行时。

## 产物路由

- Plan：`docs/plans/archived/2026-06-14-embedded-launch-sessions.md`
- Source audit：无
- Covered findings：无
- Deferred findings：无
- Capability docs：未新增
- Changelog：已更新 `CHANGELOG.md`。
- Distill：已更新 `CONTEXT.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`DESIGN.md` 和 `README.md`。
- ADR gate：不需要。
- Context map：不需要；没有新增独立模块或新能力文档。
- Design system impact：已更新 `DESIGN.md` 中项目列表摘要状态和详情会话状态展示规则。

## 完成条件

已完成：所有步骤均完成，验证结果已记录，文档已反映新的单一启动路径，计划已归档。
