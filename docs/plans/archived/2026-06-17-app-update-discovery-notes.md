---
artifact_type: plan
status: archived
created: 2026-06-17
updated: 2026-06-17
owner: codex
---

# 应用更新弹窗与设置页布局计划

## Goal

当 Workbench 发现新版本时，用左下角入口和轻提示引导用户打开专门的更新弹窗，在弹窗中浏览变更、查看下载进度，并在安装完成后由用户手动重启。

## Scope

- 左下角“有新版本”入口点击后打开更新弹窗，不再直接跳转设置页。
- 同版本首次发现时保留一次 toast 轻提示；toast 的“查看更新”同样打开更新弹窗。
- 更新弹窗展示当前版本、最新版本、发布时间和更新说明。
- 点击“下载并安装”后在弹窗中显示下载进度、下载状态和防重复点击状态。
- 安装完成后显示“重启完成更新”操作，由用户决定何时重启。
- 检查失败、Web 预览不可用、无更新、下载失败都在弹窗中给出明确提示。
- 设置页软件更新区域降级为简洁状态入口，不再作为主要更新操作面板。
- 设置页内部滚动条隐藏但保留滚动能力。
- 设置页全屏或宽窗口下自动扩宽到合理最大宽度，减少右侧空白。
- 补充前端测试覆盖弹窗打开、进度状态、重启入口、设置页更新入口和同版本提示记录。

## Non-Goals

- 不做启动时自动弹窗。
- 不做后台自动下载、自动安装或自动重启。
- 不做取消下载。
- 不新增强制更新、灰度更新、多渠道更新或复杂更新策略配置。
- 不重构整个设置页为分组导航；本次只做宽度、滚动条和软件更新区域降级。
- 不引入 Markdown 渲染依赖；更新说明第一版按纯文本换行展示。

## Assumptions And Decisions

- 已确认普通更新不自动弹窗，避免打断开发工作流。
- 用户主动点击左下角“有新版本”或 toast “查看更新”时打开更新弹窗。
- 设置页仍可保留软件更新状态和手动检查入口，但主要更新流程属于弹窗。
- “同版本只提示一次”使用前端本地持久状态记录，例如 `localStorage`，不进入 SQLite。
- Release notes 来源继续使用 Tauri updater 返回的 `body` 字段，也就是 GitHub updater `latest.json` 的 `notes`。
- 下载进度来源使用 Tauri updater `downloadAndInstall` 的事件回调；无法计算百分比时展示不确定进度文案。
- 设置页宽度采用响应式最大宽度，而不是无限撑满超宽屏。

## Fact Sources

- `docs/capabilities/app-update.md`：应用更新当前能力和边界。
- `DESIGN.md`：App Shell、设置页、弹窗、状态徽标、按钮和滚动容器规则。
- `src/contexts/AppUpdateContext.tsx`：更新状态、启动静默检查、下载和重启状态来源。
- `src/lib/api/updateApi.ts`：Tauri updater API 边界和下载事件入口。
- `src/components/UpdateBadge.tsx`：左下角更新入口。
- `src/components/AppUpdatePanel.tsx`：设置页软件更新区域，后续应降级为状态入口。
- `src/components/ui.tsx`：现有 `Modal`、`Button`、`StatusBadge`、`IconButton` 等共享组件。
- `src/App.tsx`：App Shell、toast、设置页、弹窗挂载点。
- `src/styles.css`：设置页、toast、弹窗和更新区域样式。
- `src/components/app-update.test.tsx`、`src/App.test.tsx`：现有更新 UI 和 App Shell 测试。

## Context Loaded

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `DESIGN.md`
- `docs/capabilities/app-update.md`
- `src/contexts/AppUpdateContext.tsx`
- `src/lib/api/updateApi.ts`
- `src/components/UpdateBadge.tsx`
- `src/components/AppUpdatePanel.tsx`
- `src/components/ui.tsx`
- `src/App.tsx`
- `src/styles.css`
- `src/components/app-update.test.tsx`
- `src/App.test.tsx`

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| UPDATE-DIALOG-1 | done | 清理方案 2 临时测试状态，恢复版本号到 `0.1.1` 并停止本仓库 dev 进程。 | `git diff` 不再包含版本号降级；本仓库 debug 进程已停止。 |
| UPDATE-DIALOG-2 | done | 调整更新状态模型，增加下载进度字段并把 Tauri updater 下载事件传到前端上下文。 | `pnpm test` 覆盖进度状态；`pnpm build` 通过。 |
| UPDATE-DIALOG-3 | done | 新增或拆分更新弹窗组件，覆盖可更新、下载中、待重启、错误、当前最新和不可用状态。 | `src/components/app-update.test.tsx` 覆盖主要状态和按钮行为。 |
| UPDATE-DIALOG-4 | done | 调整 App Shell：左下角徽标和 toast “查看更新”打开更新弹窗；同版本仍只提示一次。 | `src/App.test.tsx` 覆盖同版本提示记录；更新入口复用同一弹窗打开函数。 |
| UPDATE-DIALOG-5 | done | 降级设置页软件更新区域为简洁状态入口，必要操作打开同一更新弹窗。 | `src/components/app-update.test.tsx` 覆盖设置页轻入口。 |
| UPDATE-DIALOG-6 | done | 优化设置页布局：隐藏内部滚动条并在宽窗口下自动扩宽到合理最大宽度。 | `src/styles.css` 已限制设置页响应式最大宽度并隐藏内部滚动条；规则同步到 `DESIGN.md`。 |
| UPDATE-DIALOG-7 | done | 更新 `docs/capabilities/app-update.md` 和 `CHANGELOG.md`，记录弹窗更新流程、进度显示和设置页入口变化。 | 文档已更新；`dev-flow validate-docs` 通过，仅保留既有 Radar warning。 |
| UPDATE-DIALOG-8 | done | 运行验证并记录结果。 | `pnpm test` 通过；`pnpm build` 通过。 |

## Acceptance Criteria

- 有新版本时，左下角显示“有新版本”入口。
- 点击左下角入口打开更新弹窗，而不是跳转设置页。
- 同版本首次发现时 toast 只出现一次，并可打开同一更新弹窗。
- 更新弹窗能展示版本、发布时间和更新说明。
- 点击下载后能看到下载进度或明确下载中状态，按钮不会重复触发下载。
- 安装完成后弹窗显示手动重启入口。
- 设置页软件更新区域变轻，不再占据顶部大面板作为主流程。
- 设置页内部滚动条隐藏，但鼠标滚轮/触控板滚动仍可用。
- 设置页在全屏时扩宽到合理宽度，不再明显挤在左侧。
- 无更新、检查失败和 Web 预览模式行为不退化。
- 相关测试和构建通过。

## Risks

- Tauri updater 下载事件在不同平台上的事件字段可能不完全一致；实现需要防御性解析进度。
- 当前共享 `Modal` 足够承载更新弹窗，但下载进度可能需要新增局部样式，避免扩散为新全局组件。
- 隐藏滚动条会降低滚动可发现性；设置页内容区仍需保留滚动能力和足够视觉边界。
- 宽屏设置页若无限撑满会降低可读性；应采用合理最大宽度。
- 临时降版本手动验证不能进入提交；版本号必须保持 `0.1.1`。

## Artifact Routing

- Plan: `docs/plans/archived/2026-06-17-app-update-discovery-notes.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: `docs/capabilities/app-update.md`
- Changelog: needed，用户可见的更新入口、进度和设置页行为变化。
- Distill: needed，更新能力行为变化应回写 capability。
- ADR gate: not needed，沿用既有 Tauri updater 和本地优先边界，不改变长期架构。
- Design system impact: maybe，若设置页宽度或滚动条隐藏成为项目级规则，应通过 design system gate 更新 `DESIGN.md`；若仅为设置页局部修正，则不更新。

## Completion

当所有非延期步骤完成、验证命令通过、更新能力文档和 changelog 已同步，并经用户确认后，可进入提交、合并和清理流程。 
