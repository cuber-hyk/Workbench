---
artifact_type: plan
status: archived
created: 2026-06-20
updated: 2026-06-20
owner: codex
---

# 技能市场安装进度恢复计划

## Goal

技能市场安装 Skill 时，无论用户切换 Skills 内部子视图，还是通过左侧主导航离开 Skills 再返回，都能恢复并判断安装进度、完成状态或失败状态。

## Scope

- 覆盖 `skills.sh` 技能市场的单项安装流程。
- 覆盖 Skills 内部 `本地 Skills / 技能市场 / 更新` 子视图切换。
- 覆盖左侧主导航切到项目、资源 Radar、设置后再返回 Skills。
- 保持同一时间只允许一个市场安装操作。
- 安装完成后刷新本地 Skills 状态、市场列表状态和更新页状态。

## Non-Goals

- 不引入后端持久任务表或全局任务中心。
- 不改动 skills.sh 下载、解压、校验和写入统一 Skills 根目录的后端安装语义。
- 不新增批量安装、取消安装或后台队列。
- 不改变市场列表 + 详情的既有布局规则。

## Assumptions And Decisions

- 用户已确认两种“切换页面”都算：Skills 内部子视图切换和左侧主导航切换。
- 采用 `App` 级前端状态作为安装任务状态所有者，因为 `activeView !== "skills"` 时 `SkillsView` 会卸载。
- 后端仍通过 `skill-install-progress` 事件和 `install_skill_from_market` 返回最终 `SkillsState`；本计划不增加后端任务查询 API。
- 任务状态至少包含 `source`、`skillId`、`key`、`progress`、`status`、`error`，其中 `status` 覆盖 `idle/running/succeeded/failed` 的等价状态。
- UI 继续复用市场列表行内按钮百分比和细进度条；失败状态用现有 warning/error 区域或 toast 表达，避免新增大块说明面板。

## Source Audit

- `source_audit`: `docs/audits/archived/2026-06-20-skills-market-install-progress-audit.md`
- `covered_findings`: `AUD-2026-06-20-001`
- `deferred_findings`: none

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `DESIGN.md`
- `docs/capabilities/skills-management.md`
- `docs/audits/archived/2026-06-20-skills-market-install-progress-audit.md`
- `src/App.tsx`
- `src/lib/api/workbenchApi.ts`
- `src/lib/types/domain.ts`
- `src/App.test.tsx`

## Steps

1. `done` 复现并锁定现有失败路径。
   - 验证：新增或先写失败测试，覆盖安装过程中切换 Skills 子视图后返回市场，安装行仍显示当前进度或完成状态。
   - 验证：新增或先写失败测试，覆盖安装过程中从 Skills 切到其他主导航再返回，安装行仍显示当前进度或完成状态。

2. `done` 将市场安装任务状态提升到 `App`。
   - 实现：在 `App` 中维护市场安装任务状态和安装处理函数，安装进度回调只更新 `App` 状态。
   - 实现：安装成功后清空市场运行时缓存，刷新本地 Skills，标记市场列表需要刷新。
   - 实现：安装失败后保留失败状态和错误信息，用户返回市场时能看到失败结果。
   - 验证：组件卸载后不再依赖 `SkillsView` 的局部 state 或已卸载组件的 setter。

3. `done` 调整 `SkillsView` 和 `SkillsMarketView` 为受控展示安装任务。
   - 实现：移除 `SkillsView` 内部 `installingMarketKey`、`installingMarketProgress` 的安装任务所有权。
   - 实现：市场行根据传入任务状态显示 `安装中 N%`、禁用其他安装按钮，并保留完成或失败后的可判断反馈。
   - 实现：市场页返回或任务完成后按刷新标记重新加载市场列表，确保 `installedDirectoryName` 和统计条同步。
   - 验证：不改变卸载、筛选、详情预览和更新页已有行为。

4. `done` 补齐回归测试。
   - 验证：`src/App.test.tsx` 覆盖 Skills 子视图切换保持安装状态。
   - 验证：`src/App.test.tsx` 覆盖左侧主导航切换保持安装状态。
   - 验证：覆盖安装完成后市场状态刷新为已安装，且 `onRefresh` 或 App 级 Skills 刷新被触发。
   - 验证：保留既有“打开市场并安装选中 Skill”测试语义。

5. `done` 更新项目事实文档和审计状态。
   - 实现：更新 `docs/capabilities/skills-management.md`，记录市场安装进度跨页面恢复的当前能力。
   - 实现：将 `docs/audits/archived/2026-06-20-skills-market-install-progress-audit.md` 中 `AUD-2026-06-20-001` 标为 `verified`，Owner Plan 指向本计划。
   - 验证：文档只描述推荐现状，不保留旧方案对照。

6. `done` 运行验证命令。
   - 验证：至少运行 `pnpm test -- src/App.test.tsx`。
   - 验证：运行 `pnpm verify`；如果环境耗时或失败，记录具体失败原因和未验证项。

## Risks

- 如果安装 Promise 在 `SkillsView` 卸载后继续调用原局部 setter，会产生不可恢复状态或 React 警告；修复必须消除这种依赖。
- 市场列表存在模块级缓存 `skillMarketRuntimeCache`，安装完成后必须清除并触发可见页刷新，否则 UI 仍可能显示未安装。
- 失败状态如果立即清空，用户返回后仍无法判断结果；失败信息需要保留到用户下一次触发安装或刷新市场。

## Acceptance Criteria

- 安装过程中切到 Skills 的“本地 Skills”或“更新”，再回到“技能市场”，原安装项仍显示安装进度或最终结果。
- 安装过程中切到项目、资源 Radar 或设置，再回到 Skills 的“技能市场”，原安装项仍显示安装进度或最终结果。
- 安装成功后，市场列表该项变为已安装，本地 Skills 列表可见新增 Skill。
- 安装失败后，市场页能显示失败信息，用户不会误以为安装仍在进行或已经成功。
- 同一时间仍只能执行一个市场安装操作。
- 自动化测试覆盖两种页面切换场景。

## Artifact Routing

- Plan: `docs/plans/archived/2026-06-20-skills-market-install-progress.md`
- Audit: update `docs/audits/archived/2026-06-20-skills-market-install-progress-audit.md`
- Capability: update `docs/capabilities/skills-management.md` after implementation
- Tests: update `src/App.test.tsx`
- ADR: not needed unless implementation改为后端持久任务表或全局任务中心
- Changelog: likely update because this is user-visible bug fix
- Design system impact: none; reuse existing market row progress UI, warning/error region, toast and compact table layout
- Context map: no update expected unless new source files are introduced

## Closeout

- 已在 `codex/task/20260620-skills-market-install-progress` 中实现，`pnpm test -- src/App.test.tsx` 通过。
- 计划归档；审计发现已验证并归档；当前能力已更新到 `docs/capabilities/skills-management.md`。
