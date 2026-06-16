---
artifact_type: plan
status: archived
created: 2026-06-16
updated: 2026-06-16
owner: Workbench
---

# Workbench UI 设计系统收敛计划

## 目标

将 Workbench 当前项目、Skills、资源 Radar 和设置模块中逐渐分散的 UI 样式收敛为一套可复用、可验证的设计系统规则和共享组件，统一按钮、图标操作、筛选栏、表格、详情面板、状态徽标、删除确认和基础布局，同时保持现有产品视觉方向和业务行为不变。

## 范围

- 更新 `DESIGN.md`，明确当前已确认的跨模块 UI 规则。
- 按现有视觉方向补齐或整理 `design-tokens.json` 中缺失的尺寸、间距和组件 token。
- 扩展 `src/components/ui.tsx` 中的共享组件，而不是引入外部 UI 库。
- 收敛 `src/styles.css` 中的通用语义 class，减少模块局部样式重复。
- 迁移现有模块使用统一的操作、筛选、列表、详情和确认弹窗模式。
- 保持现有浅色 / 深色主题能力。
- 增加或调整前端测试，覆盖关键交互和语义组件使用。

## 非目标

- 不引入 Tailwind、shadcn、MUI 或其他外部 UI 组件库。
- 不重新设计品牌视觉、导航结构或信息架构。
- 不将所有列表强行统一为同一种外观；Table Row 和 Row Card 继续按信息密度区分使用。
- 不做业务功能新增。
- 不在第一轮同时大规模拆分 `src/App.tsx` 的模块文件；只在组件抽取必要时做局部移动。
- 不设计移动端布局。

## 假设与已确认决策

- Workbench 继续采用本地优先、紧凑、开发控制台式的桌面工作台视觉。
- 现有 `DESIGN.md` 是 UI 意图和模式规则来源。
- 现有 `design-tokens.json` 是精确视觉值来源。
- 现有 `src/components/ui.tsx` 是共享组件入口。
- 现有 `src/styles.css` 可以继续承载全局样式，但通用样式应按语义命名，模块样式只表达模块特有布局。
- UI 统一优先统一语义和交互位置，其次才是完全一致的视觉外形。
- 删除类操作必须继续走确认弹窗。
- 破坏性操作、状态提示和收藏 / 注意状态不能只依赖颜色表达。

## 事实来源

- `DESIGN.md`：现有设计系统规则、布局模式、组件规则和禁用模式。
- `design-tokens.json`：现有颜色、字体、间距、圆角、尺寸和阴影 token。
- `src/components/ui.tsx`：当前共享组件入口，已有 `Button`、`IconButton`、`Panel`、`PageHeader`、`SearchInput`、`TagList`、`Modal`。
- `src/styles.css`：当前全局样式、模块样式和大量语义 class。
- `src/App.tsx`：项目、Skills、资源 Radar、设置、弹窗和详情面板的当前实现。
- `src/App.test.tsx`：当前前端交互测试。
- `docs/ai/context-map.md`：相关设计和实现入口。

## 设计系统收敛原则

- **语义优先**：复用以行为和语义为准，例如行级操作、危险操作、详情主操作，而不是只看颜色或大小。
- **小组件优先**：优先抽低风险组件，例如操作组、状态徽标、详情标题和删除确认；暂不抽通用大表格。
- **CSS 先分层**：先形成稳定语义 class，再逐步替换模块局部 class。
- **模块差异保留**：项目 / Skills / Radar 的信息密度不同，允许继续使用不同列表形态。
- **每步可验证**：每个迁移步骤都应有测试或人工检查路径，不做一次性大爆炸改动。

## 目标 UI 模式

### 按钮与操作

- `Button` 支持 `default / primary / danger` 语义。
- `IconButton` 支持 `default / danger / active` 或等价语义。
- 行级操作统一使用 `RowActions` 或 `.row-actions`。
- 详情底部操作统一分为 primary、secondary 和 danger 区。
- 删除按钮永远使用 danger 语义，并进入确认弹窗。

### Filter / Toolbar

- 模块工具栏统一为搜索、主筛选、次筛选入口、辅助 toggle、页面主操作。
- 默认筛选控件宽度统一，不因长文案撑破布局。
- 更多筛选使用统一 popover 模式。
- 搜索输入保持同一高度、边框、图标和可访问标签规则。

### 列表

- `Table Row` 用于横向比较多字段的项目和 Skills。
- `Row Card` 用于 Radar 等说明型资源列表。
- 选中态和 hover 态使用同一语义强调色系。
- 行内按钮点击不得触发行选择。
- 操作列在默认窗口宽度下必须完整可见。

### 详情面板

- 详情面板统一结构：
  - `DetailHeader`：标题、次级元信息、可选标题操作。
  - `DetailMetaGrid` 或只读表单区：展示核心字段。
  - `DetailSection`：展示说明、启动项、冲突、边界提示等模块内容。
  - `DetailActions`：统一排列常用操作和危险操作。
- 路径、命令、URL 使用等宽或安全换行策略。
- 不把列表已承载的高频行级操作重复塞进详情面板，除非该模块已有明确规则。

### 状态与徽标

- 统一 `StatusBadge` 语义：neutral、accent、success、warning、danger、attention。
- 项目状态、启动状态、Skill 冲突、来源失效、归档状态使用同一状态语言。
- 颜色必须搭配文字或图标语义，不单独承担信息。

### 弹窗与确认

- `Modal` 保持头部和底部操作区固定，内容区滚动。
- 删除确认统一走 `ConfirmDeleteModal` 或等价共享组件。
- footer 顺序统一为取消在左，确认在右；危险确认使用 danger。

## 执行步骤与验证

| ID | 状态 | 步骤 | 说明 | 验证 |
| --- | --- | --- | --- | --- |
| UDS-1 | done | 设计系统规则更新 | 使用 `dev-design-system` 更新 `DESIGN.md`，补齐按钮、Toolbar、列表、详情、状态徽标、删除确认的跨模块规则；只记录已确认和本计划要执行的当前规则。 | `DESIGN.md` 已补齐共享操作、状态徽标、详情标题、删除确认规则。 |
| UDS-2 | done | Token 审查与补齐 | 对照 `src/styles.css` 中重复硬编码值，补齐必要 token，例如 toolbar 控件宽度、row action 尺寸、status badge 尺寸、detail gap；避免把每个局部值都 token 化。 | 已复用现有 success / warning token 对应值，未发现必须新增的 token；`design-tokens.json` 未改动。 |
| UDS-3 | done | 共享组件扩展 | 在 `src/components/ui.tsx` 中扩展低风险组件：`ActionGroup`、`StatusBadge`、`DetailHeader`、`DetailActions`、`ConfirmDeleteModal`、必要的 toolbar/filter 基础组件。 | 已新增 `Toolbar`、`FilterMore`、`ActionGroup`、`StatusBadge`、`DetailHeader`、`DetailActions`、`ConfirmDeleteModal`；TypeScript build 通过。 |
| UDS-4 | done | CSS 语义层收敛 | 整理 `src/styles.css` 的通用 class：按钮变体、图标按钮变体、filter bar、row actions、status badge、detail section、confirm summary；保留模块布局 class。 | 已集中状态徽标、操作组、危险图标和详情标题样式；清理旧项目/启动/来源状态 class。 |
| UDS-5 | done | 项目模块迁移 | 迁移项目列表操作、状态徽标、详情标题、详情操作和启动摘要使用统一模式；保持项目启动、归档、日志入口行为不变。 | 项目状态、启动状态、行级操作、详情标题已迁移；新增行级操作不触发行选择测试。 |
| UDS-6 | done | Skills 模块迁移 | 迁移 Skills 表格操作、分类标签、冲突状态、删除确认和详情区使用统一模式；保留双击分类编辑和工具启用行为。 | Skills 行级操作、冲突状态、详情标题和删除确认已迁移；现有 Skills 测试通过。 |
| UDS-7 | done | 资源 Radar 模块迁移 | 迁移 Radar toolbar、更多筛选、星标 toggle、Row Card、重复组面板、详情操作和删除确认使用统一模式；保持筛选、收藏、合并行为不变。 | Radar toolbar、更多筛选、状态徽标、详情标题、详情图标操作和删除确认已迁移；详情收藏入口已移除，列表星标保留；现有 Radar 测试通过。 |
| UDS-8 | done | 设置与弹窗收敛 | 迁移设置路径行、打开目录图标、项目 / Radar 编辑弹窗和导入弹窗的 footer、路径输入、删除确认。 | 设置可用状态使用 `StatusBadge`；删除弹窗使用 `ConfirmDeleteModal`；已有路径输入布局保持不变。 |
| UDS-9 | done | 测试与视觉检查 | 补充或更新 Vitest 覆盖关键共享组件语义和跨模块操作；运行完整验证并进行深浅主题人工检查。 | 已新增共享删除确认测试和项目行级操作测试；`pnpm verify`、`pnpm tauri:verify-build` 通过。 |
| UDS-10 | done | 文档与收尾 | 更新 `CHANGELOG.md`、必要时更新 `docs/ai/context-map.md`；通过 `dev-design-system` check 和 Dev Flow 文档检查；实现分支进入 review gate。 | `DESIGN.md` 和 `CHANGELOG.md` 已更新；Dev Flow 文档检查通过，仅保留既有 resource-radar capability warning。 |

## 风险与控制

- **范围膨胀风险**：只统一现有模块和已出现模式，不设计未出现的移动端、复杂 DataTable 或新页面。
- **过度抽象风险**：第一轮只抽低风险语义组件，不抽包含列定义、业务过滤、模块状态的大组件。
- **视觉回归风险**：每个模块迁移后检查默认窗口宽度、深色主题、浅色主题和滚动容器。
- **交互回归风险**：重点覆盖行内按钮不触发行选择、删除确认、filter 状态、键盘可访问标签。
- **CSS 冲突风险**：先引入新语义 class，再逐步替换旧 class；确认无引用后删除旧样式。
- **大文件维护风险**：不把本计划变成 `App.tsx` 大拆分任务；若组件迁移暴露明显模块边界，再另开拆分计划。

## 验收标准

- 项目、Skills、资源 Radar 和设置模块的按钮、图标按钮、危险操作、详情操作区和弹窗 footer 使用统一语义。
- 项目和 Skills 表格行操作列尺寸和行为一致。
- Radar Row Card、星标 toggle 和详情操作符合统一操作模式。
- Toolbar / Filter 的搜索框、select、更多筛选、辅助 toggle 在各模块间样式一致。
- 详情面板统一标题、元信息、内容区和操作区布局。
- 状态徽标使用统一组件或统一 class，不再按模块各自定义颜色语义。
- 删除确认弹窗统一，并且所有删除仍需确认。
- `DESIGN.md` 和 `design-tokens.json` 与实现一致。
- `pnpm test -- --run`、`pnpm verify`、`pnpm tauri:verify-build` 通过。

## 产物路由

- Plan：`docs/plans/2026-06-16-workbench-ui-design-system-convergence.md`
- Design system：需要更新 `DESIGN.md`。
- Tokens：可能更新 `design-tokens.json`。
- Shared components：更新 `src/components/ui.tsx`。
- UI styles：更新 `src/styles.css`。
- Tests：更新 `src/App.test.tsx`，必要时新增组件测试。
- Changelog：需要；这是用户可见的 UI 一致性和可维护性改进。
- Distill：需要；设计系统规则、共享组件和 token 是长期知识。
- ADR gate：暂不需要；除非实施中决定引入外部 UI 框架、拆分大型前端架构，或改变长期页面信息架构。
- `docs/ai/context-map.md`：若新增长期 UI 入口或测试路由，实施后更新。

## 完成条件

所有步骤完成且无阻塞项；UI 规则、token、共享组件、样式和测试保持一致；现有业务行为无回归；设计系统 check、完整验证和 Dev Flow 文档检查通过；计划归档。
