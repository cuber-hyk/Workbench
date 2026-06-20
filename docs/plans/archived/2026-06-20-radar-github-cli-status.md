---
artifact_type: plan
status: archived
created: 2026-06-20
updated: 2026-06-20
owner: codex
---

# 资源 Radar GitHub CLI 状态提示计划

## Goal

让资源 Radar 在用户点击同步 GitHub Stars 时清楚提示本机 GitHub CLI 的可用状态，避免用户缺少 `gh` 或未登录时只看到原始失败信息，同时不增加页面常驻视觉负担。

## Scope

- 在用户点击同步 GitHub Stars 时检查 GitHub CLI 状态，并使用右下角 toast 提示缺失或未登录状态。
- 后端提供轻量状态检查，区分未安装、未登录和已就绪。
- 同步失败时保留 toast 即时反馈，但页面内提示承担主要说明。
- 为前端状态展示、同步按钮行为和后端状态检查补充测试。

## Non-goals

- 不自动安装 GitHub CLI。
- 不在 Workbench 中保存 GitHub Token。
- 不引入 GitHub OAuth、后台同步、定时任务或新的外部来源。
- 不改变现有 GitHub Stars 同步、去重、合并和来源字段写入规则。

## Assumptions And Decisions

- 用户最终确认不展示顶部常驻状态条，采用“点击同步时检查 + 右下角 toast”的提示方式。
- GitHub Stars 继续依赖本机 `gh` CLI 当前认证账号。
- 同步按钮保留可见，不因未配置状态隐藏入口。
- 未安装和未登录是可预期环境状态，应使用面向用户的中文文案，而不是直接暴露系统错误。
- 本次 UI 复用现有 `Button` 和右下角 toast，不建立新的大弹窗模式，也不占用列表上方空间。
- ADR gate: not needed。本次只细化已确认外部依赖提示，不改变认证架构或数据源边界。

## Fact Sources

- `AGENTS.md`：默认中文、简单优先、外科手术式修改、计划文档路由。
- `CONTEXT.md`：资源 Radar 已接入 GitHub Stars 手动同步，项目本地优先。
- `docs/ai/context-map.md`：资源 Radar 相关代码和能力文档入口。
- `docs/capabilities/resource-radar.md`：当前外部来源只有 GitHub Stars，依赖本机 `gh` CLI，不保存 GitHub Token。
- `DESIGN.md`：资源 Radar 使用列表 + 详情、顶部工具栏、紧凑状态徽标和文字明确状态。
- `src-tauri/src/radar.rs`：当前 `sync_github_stars` 和 `fetch_github_stars` 直接执行 `gh api user/starred --paginate`。
- `src-tauri/src/lib.rs`：Tauri command 注册入口。
- `src/lib/api/workbenchApi.ts`：前端调用 Tauri commands 的 API 边界。
- `src/lib/types/domain.ts`：前端领域类型定义位置。
- `src/App.tsx`：资源 Radar 页面、同步按钮和 toast 逻辑。
- `src/App.test.tsx`：资源 Radar 前端行为测试位置。

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| PLAN-1 | done | 补充当前问题的测试覆盖：缺少 GitHub CLI 状态提示、未登录提示和同步中按钮禁用行为。 | `pnpm test -- --run src/App.test.tsx` 通过，前端测试覆盖未配置 toast、未登录状态分类和同步按钮可见。 |
| PLAN-2 | done | 在 Rust 后端增加 GitHub CLI 状态模型和 Tauri command，检测 `gh --version` 与 `gh auth status`，返回 `missing`、`unauthenticated`、`ready` 和可选账号信息。 | `cargo test classifies_github_cli_auth_status --manifest-path src-tauri/Cargo.toml` 通过；`pnpm verify` 中 Rust 测试通过。 |
| PLAN-3 | done | 在 `src-tauri/src/lib.rs` 注册新的状态检查 command，并在 `workbenchApi.ts`、`domain.ts` 中增加最小前端类型和 API 方法。 | `pnpm verify` 中 `tsc`、构建、Rust 编译和 Clippy 通过。 |
| PLAN-4 | done | 在同步 GitHub Stars 前检查 GitHub CLI 状态，未配置或未登录时使用右下角 toast 显示安装/登录指引与 `gh auth login` 命令。 | 前端测试断言未配置时不调用同步接口、显示缺失提示；toast 已统一为主题适配的语义样式并记录到 `DESIGN.md`。 |
| PLAN-5 | done | 调整同步交互：同步成功显示结果；同步前 CLI 检查失败时 toast 显示可操作错误，并避免发起同步请求。 | `pnpm verify` 通过；失败路径保留 toast 反馈。 |
| PLAN-6 | done | 执行验证并视实现影响更新能力文档或设计规则。 | `pnpm verify` 通过；`docs/capabilities/resource-radar.md` 和 `CHANGELOG.md` 已更新。 |

## Acceptance Criteria

- 未安装 `gh` 时，点击同步后通过右下角 toast 明确提示安装 GitHub CLI 并运行 `gh auth login`。
- 已安装但未登录时，点击同步后通过右下角 toast 提示运行 `gh auth login`。
- 已安装且已登录时，继续执行 GitHub Stars 同步。
- `同步 GitHub Stars` 按钮始终可见；同步中继续禁用防重复点击。
- 不展示顶部常驻 GitHub CLI 状态条，避免占用资源列表空间。
- 不新增 Token 保存、OAuth、自动安装或后台同步逻辑。
- 前端和后端相关测试覆盖三种状态和现有同步入口行为。

## Artifact Routing

- Plan: `docs/plans/archived/2026-06-20-radar-github-cli-status.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: maybe `docs/capabilities/resource-radar.md`，如果实现新增状态检查能力则更新。
- Changelog: maybe；如果用户可见行为变化进入完成实现，应在实现阶段评估。
- Distill: maybe；实现后用 `/dev-distill` 判断是否需要吸收进能力文档和上下文地图。
- ADR gate: not needed；除非实现阶段决定改为 Token/OAuth 或自动安装。
- Design system impact: update；`DESIGN.md` 已记录 toast 的语义类型、主题适配、关闭入口和命令 chip 规则。

## Completion

所有步骤已完成，`pnpm verify` 通过，必要的能力文档和 changelog 已更新；计划归档。
