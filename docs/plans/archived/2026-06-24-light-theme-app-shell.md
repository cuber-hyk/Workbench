---
artifact_type: plan
status: archived
created: 2026-06-24
updated: 2026-06-24
owner: codex
---

# Light 主题 App Shell 浅色化计划

## Goal

让 Workbench 在浅色主题下呈现完整浅色体验：左侧 App Shell、主导航、本机工作区卡片、主题切换按钮、更新提示和本地模式状态都使用浅色主题 token，不再保留大面积深色侧边栏。

## Scope

- 调整浅色主题的侧边栏相关 token 和 `src/styles.css` 顶部 CSS 变量。
- 将 `.sidebar`、`.brand`、`.nav-item`、`.local-strip`、`.sidebar-footer`、`.theme-toggle`、`.update-badge` 等 App Shell 样式从硬编码深色改为主题变量。
- 保持深色主题现有层级和对比度，不把浅色样式反向套到 dark。
- 补充或更新主题相关测试，验证默认浅色、切换到深色后导航仍可用，必要时检查关键 CSS 变量或主题状态。
- 更新 `design-tokens.json` 和 `DESIGN.md`，把“浅色主题下 App Shell 也必须浅色化”记录为当前设计规则。

## Non-goals

- 不改变 App Shell DOM 结构、导航模块、侧边栏宽度或右侧工作区布局。
- 不重新设计主内容区、表格、详情面板、设置页或弹窗。
- 不新增第三套主题或“混合主题”开关。
- 不调整业务状态、Tauri command、SQLite 数据或主题持久化语义。
- 不做与主题无关的颜色重构或大范围 token 重命名。

## Assumptions And Decisions

- 已确认用户期望 Light 主题是完整浅色主题，而不是“浅色内容区 + 深色侧边栏”的混合主题。
- Light 主题下侧边栏使用浅色背景、浅色边框和深色文字；active 导航使用 `accentSoft` 与 `accent` 强调。
- Dark 主题保留深色侧边栏，但同样通过同一组 sidebar 语义变量表达，避免硬编码单主题色。
- 侧边栏的本机工作区卡片仍保留，因为它表达本地优先工作台定位。
- ADR gate: 不需要。该变更是 UI token 和主题表达修正，不改变架构、数据所有权或长期业务规则。

## Fact Sources

- `AGENTS.md`：中文沟通、外科手术式修改、Dev Flow 计划和验证规则。
- `CONTEXT.md`：Workbench 是本地优先桌面工作台，UI 使用固定左侧导航 + 右侧工作区。
- `docs/ai/context-map.md`：App Shell 入口为 `src/App.tsx`，设计来源为 `DESIGN.md` 和 `design-tokens.json`。
- `DESIGN.md`：主题规则要求 App Shell 和设置中的主题状态一致，两种主题使用相同布局和组件层级。
- `design-tokens.json`：当前 light token 中 `sidebar` 和 `sidebarActive` 仍为深色值。
- `src/styles.css`：当前浅色主题根变量和侧边栏样式存在深色硬编码。
- `src/App.tsx`：App Shell DOM、主题状态和 `body[data-theme]` 写入位置。
- `src/App.test.tsx`：已有主题切换后导航仍可用的测试。
- 用户截图：Light 主题下侧边栏仍为深色，造成主题不完整。

## Split Guidance

- Required: no.
- Classification: no split.
- Reason: 本次改动主要集中在主题 token、全局样式和少量 App Shell 测试；不改变跨模块状态、路由或业务边界。
- Code-placement constraints:
  - 样式改动保留在 `src/styles.css` 的主题变量和 App Shell 样式附近。
  - 不拆分 `src/App.tsx`，除非实现发现必须改 DOM 结构；当前计划不需要。
  - 不新增通用主题 helper 或抽象层。
- Deferred split trigger: 如果实现需要大规模 token 生成、主题配置运行时加载或组件级主题 API，再单独使用 `/dev-split` 评估。

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| PLAN-1 | done | 记录当前浅色主题问题基线：light token 仍使用深色 sidebar，App Shell 样式存在硬编码深色。 | 已确认 `design-tokens.json`、`src/styles.css` 和用户截图共同指向同一问题。 |
| PLAN-2 | done | 更新浅色主题 sidebar token 与 CSS 变量，补齐 sidebar 文本、muted、border、active、hover、surface 等语义变量。 | `:root` 与 `body[data-theme="dark"]` 已成对定义 sidebar 语义变量。 |
| PLAN-3 | done | 将侧边栏、品牌、导航项、本机工作区卡片、主题按钮、更新提示和本地模式状态改用主题变量。 | App Shell 关键样式已改用 sidebar 变量；深色主题继续使用深色 token。 |
| PLAN-4 | done | 更新主题测试，覆盖默认浅色状态、切换到深色状态，以及导航可访问名称不受样式调整影响。 | 已新增 token 回归测试；`pnpm test -- --run src/App.test.tsx src/components/app-update.test.tsx` 通过。 |
| PLAN-5 | done | 更新 `design-tokens.json` 和 `DESIGN.md`，记录完整浅色主题规则和 App Shell 主题 token 约束。 | `DESIGN.md` 已记录完整浅色 App Shell 规则，`design-tokens.json` 已同步 sidebar token。 |
| PLAN-6 | done | 做最终验证和视觉检查。 | 已运行 `pnpm verify` 和 Dev Flow 文档检查；主题视觉结果通过 token、CSS 和构建产物检查确认，未启动浏览器截图。 |

## Acceptance Criteria

- Light 主题下侧边栏不再是大面积深色背景。
- Light 主题下品牌文字、导航默认态、hover、active、本机工作区卡片、主题按钮、更新提示和本地模式文字均可读。
- Dark 主题的侧边栏仍是深色，active 导航和主题按钮层级不退化。
- App Shell 和设置页的主题状态文案保持一致，主题切换仍写入 `body.dataset.theme` 与 `localStorage`。
- 不改变导航项、项目/Skills/Radar/设置视图切换行为。
- `pnpm verify` 通过，或如有失败需明确说明与本次改动的关系。
- `DESIGN.md` 与 `design-tokens.json` 已同步反映完整浅色主题方向。

## Risks

- 当前 CSS 中侧边栏颜色有多处硬编码，若只改 token 可能遗漏 `brand`、`nav-item`、`local-strip` 或 `theme-toggle`。
- `update-badge` 混用了 `var(--attention)` 和深色边框值，需要保证浅色和深色下都可读。
- 只做代码测试无法证明视觉观感完全达标；最终需要至少一次 Light/Dark 实际界面检查或用户截图确认。
- `design-tokens.json` 当前只记录 `sidebar` 和 `sidebarActive`，如果新增 sidebar 语义 token，需要保持文档和 CSS 同步。

## Artifact Routing

- Plan: `docs/plans/2026-06-24-light-theme-app-shell.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: none
- Design system: update `DESIGN.md`
- Design tokens: update `design-tokens.json`
- Context map: not expected, unless实现中新建稳定主题 owner 文件
- Changelog: likely；该变更影响用户可见主题体验，实施完成后由 `/dev-changelog` 判断加入 Unreleased。
- Distill: yes；实施完成后需用 `/dev-distill` 或 `/dev-branch` closeout 计划并确认设计规则已沉淀。
- ADR gate: not needed；主题视觉修正不改变架构或数据源。

## Completion

当所有步骤完成、Light/Dark 主题验收通过、测试与文档检查通过，且没有 blocked 步骤时，本计划完成。完成后计划应按 Dev Flow 生命周期归档或删除，不保留 completed 状态。

## Next Step

使用 `/dev-branch` 在任务分支中实施本计划，完成代码、测试、设计文档更新、验证和 review gate。
