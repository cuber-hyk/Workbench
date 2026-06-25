---
artifact_type: plan
status: archived
created: 2026-06-25
updated: 2026-06-25
owner: codex
---

# 累计应用更新说明计划

## Goal

当用户从较旧版本更新到最新版本时，软件更新弹窗展示当前版本之后到最新版本之间的累计变更，而不是只展示最新版本的 `latest.json` notes。

示例：当前版本为 `0.2.0`，最新版本为 `0.2.2` 时，更新弹窗应展示 `0.2.2` 和 `0.2.1` 的变更，并按现有“新增 / 优化 / 修复 / 安全”结构化样式展示。

## Scope

- 应用更新弹窗的 Release Notes 数据来源、解析和展示。
- 更新检查状态中的 `AppUpdateInfo` 数据结构。
- GitHub Releases notes 的按版本范围获取、排序、合并和失败回退。
- `docs/capabilities/app-update.md`、`CHANGELOG.md` 和相关前端测试。

## Non-Goals

- 不改变 Tauri updater 的下载、签名、安装和重启流程。
- 不改变 release 发布流程、签名密钥、GitHub Release 资产命名或 `latest.json` updater 协议。
- 不引入后台强制更新、自动安装或持续轮询。
- 不把 GitHub Token、认证状态或 Release 缓存写入本地数据库。

## Assumptions And Decisions

- 已确认产品方向：累计展示当前版本到最新版本之间的变更更符合用户预期。
- 采用客户端按版本范围拉取 GitHub Releases 的方案，而不是在 `latest.json` 中固定写入累计 notes。
- `latest.json` 仍是更新可用性、下载 URL 和签名的来源；GitHub Releases API 只增强展示信息。
- 如果 GitHub Releases notes 获取失败，弹窗必须继续可用，回退到 Tauri updater 返回的最新版本 notes，并显示现有结构化说明。
- GitHub Releases 地址可从当前项目固定来源推导：`https://github.com/cuber-hyk/Workbench`。本任务不抽象为多仓库更新系统。
- 版本比较只用于过滤 `currentVersion < releaseTag <= latestVersion`；需要支持 `v0.2.2` 和 `0.2.2` 两种 tag/version 表达。
- ADR gate：不需要。该变更是展示增强，不改变 updater 信任模型或更新安装协议。

## Fact Sources

- `src/lib/api/updateApi.ts`：当前 Tauri updater API 边界，`checkForAppUpdate()` 只返回最新版本 notes。
- `src/contexts/AppUpdateContext.tsx`：更新状态、静默检查、错误处理和下载状态 owner。
- `src/components/AppUpdatePanel.tsx`：更新弹窗、Release Notes 解析和结构化展示 owner。
- `src/components/app-update.test.tsx`：更新 UI 和 notes 解析测试。
- `docs/capabilities/app-update.md`：应用更新行为、GitHub Releases 来源和发布签名边界。
- `DESIGN.md`：软件更新弹窗必须结构化展示 Release Notes，不能直接暴露 Markdown 原文。

## Split And Code Placement

- 不需要单独 `/dev-split`。涉及文件已有明确职责，且变更可以保持在现有更新 owner 模块内。
- GitHub Releases 拉取和版本范围合并放在 `src/lib/api/updateApi.ts`，避免 UI 组件直接承担网络数据路由。
- 状态承载放在 `src/contexts/AppUpdateContext.tsx`，继续由 provider 管理检查结果和错误。
- 展示仍由 `src/components/AppUpdatePanel.tsx` 负责，必要时扩展现有 `parseReleaseNotes()` 以支持多版本 notes。
- 若实现导致 `AppUpdatePanel.tsx` parser 明显膨胀，应抽出有稳定职责的 `src/components/appUpdateNotes.ts`，只承载 notes 解析/统计，不创建泛化 `utils`。

## Plan

| ID | Status | Step | Verification |
| --- | --- | --- | --- |
| PLAN-1 | done | 用测试固定目标行为：当前版本 `0.2.0`、最新版本 `0.2.2` 时，更新弹窗展示 `0.2.2` 和 `0.2.1` 两个版本的分组 notes，分类统计覆盖累计范围。 | `pnpm exec vitest run src/components/app-update.test.tsx src/lib/api/updateApi.test.ts --testTimeout=15000` 通过 |
| PLAN-2 | done | 在 `updateApi` 增加 GitHub Releases notes 获取和范围合并：检查到更新后拉取 releases，过滤当前版本之后到最新版本之间的非草稿 release，按版本降序拼接 notes；失败时回退 updater body。 | `src/lib/api/updateApi.test.ts` 覆盖版本范围过滤、`v` 前缀、缺失可用 release 回退 |
| PLAN-3 | done | 扩展更新检查 API：保留最新版本安装信息，继续通过 `AppUpdateInfo.body` 向 UI 提供可展示 notes；GitHub Releases 获取失败时回退 updater body。 | `pnpm verify` 覆盖现有更新 context 和 UI 回归 |
| PLAN-4 | done | 调整 `AppUpdatePanel` 展示：标题表达累计范围，例如 `0.2.0 -> 0.2.2 更新内容`；内容按版本分组，每个版本下继续按新增、优化、修复、安全展示。 | `src/components/app-update.test.tsx` 断言版本标题、分组标题、累计统计和不显示 Markdown 原文 |
| PLAN-5 | done | 更新应用更新能力文档和 Changelog，说明 Release Notes 默认展示累计范围，GitHub Releases 获取失败时回退最新版本 notes。 | `node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.9.0\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench` 通过，保留 3 条既有历史 warning |
| PLAN-6 | done | 跑完整验证并做回归检查：更新检查 UI、下载/安装按钮、下载进度和 unsupported/current/error 状态不退化。 | `pnpm verify` 通过 |

## Risks And Mitigations

- GitHub API 网络失败或限流：失败时回退 updater body，不阻断更新下载和安装。
- Release notes 与 `latest.json` notes 不一致：以 GitHub Release body 作为展示增强，`latest.json` 仍只负责 updater 元数据。
- 版本比较错误导致漏显示或多显示：实现 semver 风格数字比较，无法解析的版本不纳入累计范围并回退当前 notes。
- 多版本内容过长：沿用现有弹窗内容区滚动；不增加额外弹窗或大段说明。
- UI 统计误导：分类统计应统计当前可见累计 notes，而不是仅最新版本。

## Acceptance Criteria

- 从 `0.2.0` 检查到 `0.2.2` 时，弹窗展示 `0.2.2` 和 `0.2.1` 的变更。
- 从 `0.2.1` 检查到 `0.2.2` 时，弹窗只展示 `0.2.2` 的变更。
- GitHub Releases notes 拉取失败时，弹窗仍展示 `latest.json` 中的 `0.2.2` notes，下载并安装按钮仍可用。
- 分类统计与实际展示的累计 notes 一致。
- 更新弹窗继续不直接显示 Markdown 标记。
- 更新下载、安装和重启流程不变。

## Artifact Routing

- Plan: `docs/plans/2026-06-25-cumulative-app-update-notes.md`
- Capability doc: update `docs/capabilities/app-update.md` after implementation.
- Changelog: update `CHANGELOG.md` under `[Unreleased] / Changed` or `Fixed` depending on final framing.
- Tests: update `src/components/app-update.test.tsx`; add focused tests near `updateApi` if network/range logic is extracted.
- Context map: no update expected unless a new durable update notes parser/source file is introduced.
- Design system impact: none expected; reuse existing update dialog structure and release notes sections.

## Execution Readiness

Implementation completed on branch `task/20260625-cumulative-update-notes`.

## Verification Evidence

- `pnpm exec vitest run src/components/app-update.test.tsx src/lib/api/updateApi.test.ts --testTimeout=15000`: passed, 17 tests.
- `cargo test --manifest-path src-tauri/Cargo.toml app_update --no-fail-fast`: passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml`: completed.
- `pnpm verify`: passed.
- `node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.9.0\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench`: passed with unrelated historical warnings.
