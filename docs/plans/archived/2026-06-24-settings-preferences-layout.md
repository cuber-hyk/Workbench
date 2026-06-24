---
artifact_type: plan
status: archived
created: 2026-06-24
updated: 2026-06-24
owner: codex
---

# 设置页 Preferences Split View 布局计划

## Goal

将设置页从纵向卡片堆叠改为专业桌面软件偏好设置布局：左侧为设置分类导航，右侧为单一表单式内容区，用分区标题、细分隔线和紧凑行组织内容，避免卡片墙观感。

## Scope

- 重组 `src/views/settings/SettingsView.tsx` 的信息架构和 DOM 结构。
- 调整 `src/styles.css` 中设置页相关样式，形成内部分类导航、右侧表单分区、紧凑表格行和路径行。
- 让 `AppUpdatePanel` 可以融入新的设置页内容结构，避免继续强依赖大卡片视觉。
- 更新与设置页布局相关的测试断言，保留现有功能行为覆盖。
- 更新 `DESIGN.md` 的设置页规则，将已确认方向记录为项目级 UI 规则。

## Non-goals

- 不改变 `AppSettings` 数据结构、Tauri command、SQLite schema 或配置持久化语义。
- 不新增独立设置路由，不把设置页拆成多页面流程。
- 不引入设置搜索；当分类继续增长后再单独评估。
- 不做与设置页无关的组件重构或样式清理。
- 不改变弹窗内表单、删除确认、目录创建等既有交互语义。

## Assumptions And Decisions

- 已确认采用 “Preferences Split View + Form Sections”：主 App Shell 保持不变，设置页内部新增分类导航。
- 右侧内容使用一个连续设置表单区域，不再为每个主题创建大卡片。
- 分类初版包含：常规、Skills、工具目录、项目打开方式、本地数据、应用行为、外观。
- 分类切换仅为前端局部 UI 状态，不写入持久化配置。
- `Skills 路径映射` 是只读说明，不做可编辑映射表。
- `AppUpdatePanel` 归入常规分类，并应复用设置页行/分区样式。
- ADR gate: 不需要。该决策是 UI 布局规则调整，不改变长期数据或架构源事实。

## Fact Sources

- `AGENTS.md`：中文沟通、简单优先、外科手术式修改、Dev Flow 默认工作流。
- `CONTEXT.md`：Workbench 是本地优先桌面工作台，设置当前展示数据位置、Skills 根目录、工具目录和主题。
- `docs/ai/context-map.md`：设置页入口为 `src/views/settings/SettingsView.tsx`，格式化逻辑为 `src/views/settings/settingsFormatters.ts`。
- `DESIGN.md`：当前 App Shell、设置页、按钮、路径输入、状态徽标、主题和禁用模式规则。
- `src/views/settings/SettingsView.tsx`：当前设置页使用 `settings-stack` + 多个 `settings-panel` 纵向堆叠。
- `src/styles.css`：当前设置页样式集中在 `.settings-stack`、`.settings-panel`、`.settings-row` 等选择器。
- `src/components/AppUpdatePanel.tsx`：更新入口当前直接返回 `settings-panel` 结构。
- `src/App.test.tsx`：设置页已有项目打开方式、自定义工具、排序、关闭行为、迁移检查 loading 等行为测试。
- `src/components/ui.tsx`：可复用 `Button`、`IconButton`、`StatusBadge`、`ActionGroup`、`PageHeader` 等基础组件。

## Split Guidance

- Required: no.
- Classification: no split.
- Reason: 任务主要重组设置页视图和样式，未改变跨模块状态、后端边界或数据所有权；`SettingsView.tsx` 是设置页 owner，当前规模可以承载本次布局调整。
- Code-placement constraints:
  - 设置页局部结构优先保留在 `src/views/settings/SettingsView.tsx`。
  - 仅当局部重复明显且职责稳定时，才在 `src/views/settings/` 下抽取命名明确的设置页私有组件；不创建 `utils`、`helpers`、`common`、`part-*`。
  - 不修改 `src/App.tsx` 中 SettingsView 的公共 props，除非现有调用无法表达分类布局。
- Deferred split trigger: 如果实现中出现多个独立分类各自包含复杂状态或长表单逻辑，再单独用 `/dev-split` 评估 owner 模块。

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| PLAN-1 | done | 记录当前设置页可见问题和现有行为测试覆盖，确认重构前行为基线。 | 已保留设置页相关测试覆盖的按钮名称、回调和状态。 |
| PLAN-2 | done | 在 `SettingsView.tsx` 中实现内部分类导航和右侧分类内容渲染，默认进入常规或 Skills 分类，并保留所有现有操作入口。 | 分类切换测试已更新；现有回调 props 没有丢失。 |
| PLAN-3 | done | 将右侧内容改为表单分区：分区标题、说明、分隔线、紧凑行和 table-like 工具/打开方式列表，移除卡片墙视觉。 | 已按用户确认方向移除卡片墙视觉，并根据截图反馈修正“检查迁移”按钮对齐。 |
| PLAN-4 | done | 调整 `AppUpdatePanel` 或其外层用法，使软件更新以设置分区呈现，而不是独立大卡片。 | `src/components/app-update.test.tsx` 继续通过；设置页常规分类保留更新详情入口。 |
| PLAN-5 | done | 更新设置页相关 CSS，确保浅色/深色主题、默认窗口和宽屏下布局稳定。 | 样式已限定在设置页布局、路径行、分区和表格行；未做无关样式清理。 |
| PLAN-6 | done | 更新测试，覆盖分类导航可切换、现有设置操作仍触发原回调、loading/disabled 状态不退化。 | `pnpm test -- --run src/App.test.tsx src/components/app-update.test.tsx` 通过。 |
| PLAN-7 | done | 更新 `DESIGN.md` 设置页规则，记录“分类导航 + 单一表单内容区”作为确认方向。 | `DESIGN.md` 已同步专业软件偏好设置布局规则。 |
| PLAN-8 | done | 做最终验证和视觉回归检查。 | 按用户要求不做浏览器检查；以截图反馈修正对齐，并运行测试、构建、完整验证和 Dev Flow 文档检查。 |

## Acceptance Criteria

- 设置页内部具有清晰分类导航，用户不需要滚动长列表来定位主要设置主题。
- 右侧内容不再是多个大卡片堆叠，而是连续、紧凑、专业的表单分区。
- 现有设置能力保持可用：更新详情、Skills 根目录修改、迁移检查、工具排序、工具打开/编辑/删除、项目打开方式新增/编辑/删除、本地数据目录打开、关闭行为选择、主题切换。
- 默认桌面窗口下无明显横向滚动、按钮换行挤压、路径行错位或文本重叠。
- 浅色和深色主题均保持可读对比度和一致层级。
- `pnpm test` 和 `pnpm verify` 通过，或如有失败需明确说明与本次改动的关系。
- `DESIGN.md` 已同步更新设置页布局规则。

## Risks

- `AppUpdatePanel` 当前直接输出 `settings-panel`，需要小心避免破坏其独立测试和弹窗入口。
- 设置页测试文本当前受编码显示影响，更新断言时应优先依赖 role、回调和稳定可访问名称。
- CSS 选择器如继续复用 `.settings-panel` 可能影响更新弹窗或其他设置相关区域，改动时需限定作用域。
- 分类切换如果隐藏内容，测试需要明确先点击对应分类再断言目标操作。

## Artifact Routing

- Plan: `docs/plans/2026-06-24-settings-preferences-layout.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: none
- Design system: update `DESIGN.md`
- Context map: not expected, unless实现中新建稳定 owner 文件
- Changelog: maybe；若最终用户可见设置页布局变化显著，实施完成后由 `/dev-branch` 或 `/dev-changelog` 判断是否加入 Unreleased。
- Distill: maybe；需要在实施完成后用 `/dev-distill` 或 `/dev-branch` closeout 判断设计规则是否已正确沉淀。
- ADR gate: not needed；布局规则不改变长期架构或数据源。

## Completion

当所有非延期步骤完成、测试和视觉验证结果已记录、`DESIGN.md` 同步完成，且没有 blocked 步骤时，本计划完成。

## Next Step

使用 `/dev-branch` 在任务分支中实施本计划，完成代码、测试、设计文档更新和最终验证。
