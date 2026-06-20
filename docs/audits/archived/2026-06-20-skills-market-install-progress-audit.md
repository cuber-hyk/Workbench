---
artifact_type: audit
status: archived
created: 2026-06-20
updated: 2026-06-20
scope: "技能市场安装进度在页面切换后的状态保持"
source_of_truth: "src/App.tsx; src/lib/api/workbenchApi.ts; src-tauri/src/skills.rs; docs/capabilities/skills-management.md"
---

# 技能市场安装进度审计

## Scope

审查用户反馈的问题：在技能市场安装 Skill 时，切换页面并返回后，进度丢失，无法判断安装完成还是未完成。

## Questions

- 安装进度状态由谁持有，页面切换后是否可恢复？
- 后端是否提供可查询的安装任务状态？
- 当前测试是否覆盖页面切换后的安装状态保持？

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/capabilities/skills-management.md`
- `src/App.tsx`
- `src/lib/api/workbenchApi.ts`
- `src-tauri/src/skills.rs`
- `src/App.test.tsx`

## Findings

| ID | Severity | Status | Finding | Evidence | Owner Plan | Branch/Commit |
|---|---|---|---|---|---|---|
| AUD-2026-06-20-001 | P1 | verified | 技能市场安装任务状态只存在于市场视图局部 state 和一次性事件监听中，页面切换后无法恢复安装进度或最终结果。 | `src/App.tsx` 原先在 `SkillsView` 内持有 `installingMarketKey` 和 `installingMarketProgress`，一次性 `skill-install-progress` 监听随安装调用结束清理。 | `docs/plans/archived/2026-06-20-skills-market-install-progress.md` | `codex/task/20260620-skills-market-install-progress` |

### AUD-2026-06-20-001

- Severity: P1
- Status: verified
- Confidence: Confirmed
- Finding: 市场安装的 `installingMarketKey` 和 `installingMarketProgress` 定义在 `SkillsView` 内部，安装进度只通过 `workbenchApi.installSkillFromMarket(..., setInstallingMarketProgress)` 回调更新；返回市场页时只能依赖当前列表数据，不能表达“安装仍在进行、已完成等待刷新、失败待确认”等任务状态。
- Evidence: `src/App.tsx` 中 `installingMarketKey`、`installingMarketProgress` 是 `SkillsView` 局部 state；`installMarketSkill` 在开始时设置进度，完成后刷新市场和本地 Skills，最后用 `setTimeout` 清空状态。`src/lib/api/workbenchApi.ts` 只在单次 `installSkillFromMarket` 调用期间注册 `skill-install-progress` 监听，`finally` 立即取消监听。`src-tauri/src/skills.rs` 只 emit `skill-install-progress` 事件并返回最终 `SkillsState`，没有持久或可查询的安装任务状态。
- Owner Plan: docs/plans/archived/2026-06-20-skills-market-install-progress.md
- Branch/Commit: codex/task/20260620-skills-market-install-progress
- Verification: `pnpm test -- src/App.test.tsx` 通过，新增覆盖 Skills 子视图切换和左侧主导航切换后返回市场仍显示安装进度。
- Closeout: fixed
- Impact: 用户在安装期间切到其他页面后，返回市场页无法判断安装是否仍在执行、是否已经完成、或是否失败；这会让用户重复点击、误判安装结果，尤其是网络下载较慢时。

## Verification

- `pnpm test -- src/App.test.tsx` 通过。
- 新增测试覆盖安装过程中切换 Skills 子视图后返回市场。
- 新增测试覆盖安装过程中通过左侧主导航离开 Skills 后返回市场。
