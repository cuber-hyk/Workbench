---
artifact_type: plan
status: archived
created: 2026-06-23
updated: 2026-06-23
owner: codex
---

# 分页系统计划

## Outcome

已完成第一版统一分页体验：

- 新增共享分页契约类型、分页纯计算规则和 `PaginationBar` 控件。
- 项目、资源 Radar、本地 Skills、技能市场和更新页接入分页。
- 分页控件固定在列表面板底部，不占用页面标题、筛选区或统计卡片。
- 分页控件支持编辑当前页并跳转到合法页码范围内任意页。
- 搜索或筛选变化后回到第一页。
- 翻页后详情切换到当前页可见项。
- 每页数量不持久化。
- 未引入通用 DataTable、无限滚动、虚拟列表或 cursor 分页。

延期项：

- Radar / Projects 的 SQLite `LIMIT/OFFSET + COUNT` 下推未在本轮实施。Projects 的启动状态筛选依赖前端内存运行态，Skills 来源是扫描合成状态；为避免改变事实源边界，本轮保持前端分页。若列表规模或加载性能证明需要数据库级分页，应单独计划并同时迁移筛选参数与 total 语义。

## Goal

为 Workbench 的主要列表增加第一版分页能力，在保持各模块查询语义和现有列表详情工作流的前提下，统一分页契约、分页控件和翻页行为。

## Scope

- 为分页定义前后端共享语义：`page`、`pageSize`、`total`、`items`。
- 优先覆盖资源 Radar 和项目列表。
- 为 Skills 本地列表、技能市场和更新页规划前端分页接入路径。
- 新增轻量分页 UI，不引入通用 DataTable 或通用列表框架。
- 保持现有 Tauri command 名称、导航、详情面板和数据所有权边界稳定，除非实现中确认需要新增专用 command。

## Non-Goals

- 不做无限滚动、虚拟列表、cursor 分页或远程全文搜索。
- 不持久化每页数量到 `app_settings`。
- 不重构 `src/App.tsx`、`src/App.test.tsx` 或 Skills 扫描/启用模型。
- 不改变 Radar GitHub Stars 同步、重复组合并、Skills 启用、项目启动等业务语义。
- 不为了降低行数做机械拆分。

## Assumptions And Decisions

- 确认采用传统页码分页：`page + pageSize + total`。
- 确认搜索或筛选条件变化后回到第一页。
- 确认分页控件只在结果超过一页时显示。
- 确认翻页后详情面板规则：当前选中项仍在新结果中则保留，否则选中新页第一项；空结果显示空状态。
- 确认第一版不持久化每页数量。用户临时切换每页数量后，关闭应用或重新进入时可回到模块默认值。
- 推荐默认每页数量从 `50` 起步，具体实现可在计划执行时按 UI 密度微调，但不得引入设置项。
- 推荐先实现 Radar，再实现 Projects，最后接入 Skills 本地、市场和更新页。

## Fact Sources

- `AGENTS.md`：中文沟通、简单优先、外科手术式修改、模块书写规范、禁止直接 push。
- `CONTEXT.md`：项目、Skills、Radar 均已接入本地 Tauri 后端与 SQLite；UI 是固定左侧导航 + 右侧列表详情工作区。
- `docs/ai/context-map.md`：定位相关视图、API、后端 facade 和 capability docs。
- `docs/capabilities/resource-radar.md`：Radar 本地 CRUD、筛选、收藏、GitHub Stars 同步和重复组合并边界。
- `docs/capabilities/project-management.md`：项目记录、归档、启动项和外部打开方式边界。
- `docs/capabilities/skills-management.md`：Skills 统一根目录、扫描、分类、启用、市场和更新边界。
- `DESIGN.md`：项目、Skills、Radar 使用列表 + 详情；项目和 Skills 使用表格行，Radar 使用 Row Card；行级操作和详情面板规则。
- `src/lib/api/workbenchApi.ts`：前端通过 Tauri `invoke` 访问后端，当前 `listProjects`、`listRadarItems` 返回全量数组。
- `src/lib/types/domain.ts`：前端领域类型集中定义。
- `src/views/radar/RadarView.tsx`：Radar 当前在前端内存中筛选全量 `items`。
- `src/views/projects/ProjectsView.tsx`：Projects 当前在前端内存中筛选全量 `projects`。
- `src/views/skills/SkillsView.tsx`：Skills 本地、市场和更新页当前各自维护列表状态和筛选。
- `src/components/ui.tsx`：已有共享 UI 组件位置，适合新增轻量分页控件。
- `src-tauri/src/radar.rs`、`src-tauri/src/radar/db.rs`：Radar command facade 和 SQLite 查询 owner。
- `src-tauri/src/projects.rs`、`src-tauri/src/projects/db.rs`：Project command facade 和 SQLite 查询 owner。

## Split Guidance

- Required: yes。
- Source: `/dev-split` narrow scan and manual boundary review.
- Classification: defer broad split; add focused owner modules only where a clear responsibility already exists.
- Candidate scan:
  - `src/App.tsx` 1302 行，`WorkbenchApp` 1105 行。
  - `src/App.test.tsx` 2444 行。
  - `src/lib/api/workbenchApi.ts` 735 行。
  - `src/views/skills/SkillsView.tsx` 686 行。
  - `src/views/projects/ProjectsView.tsx` 685 行。
  - `src-tauri/src/skills.rs` 2093 行。
  - `src-tauri/src/projects.rs` 628 行。
- Code-placement constraints:
  - `src/App.tsx` 只保留应用壳和跨模块数据装载编排；不要把分页计算、页码修正或控件逻辑写入 App shell。
  - `src/components/ui.tsx` 可以承载一个轻量 `PaginationBar`，只负责展示和事件，不拥有模块筛选语义。
  - 分页类型优先放在 `src/lib/types/domain.ts` 或紧邻 API 边界的明确类型位置，避免新增 generic `utils`。
  - 前端本地分页计算若仅单模块使用，应靠近 owner 视图；若 Projects、Radar、Skills 同时需要完全相同的纯计算，可新增职责明确的 `src/lib/ui/pagination.ts` 或同等命名模块，但不得命名为 `utils`、`helpers`、`common`。
  - Radar 后端分页查询归 `src-tauri/src/radar/db.rs` 所有，`src-tauri/src/radar.rs` 保持 command facade。
  - Projects 后端分页查询归 `src-tauri/src/projects/db.rs` 所有，`src-tauri/src/projects.rs` 保持 command facade。
  - Skills 本地第一版避免改扫描事实源；优先在 `src/views/skills/SkillsView.tsx` 内对已筛选结果分页，后续数据规模证明需要时再单独计划扫描/状态分页。
  - 不新增跨业务的通用 DataTable，不把项目、Radar、Skills 的行渲染抽成一个框架。
- Deferred split trigger:
  - 如果实现分页时需要在 `SkillsView.tsx` 或 `ProjectsView.tsx` 中新增大段状态机、跨子视图协调或重复页码修正逻辑，应先停下来重新运行 `/dev-split`，考虑抽到职责明确的本地 owner 模块。
  - 如果 `workbenchApi.ts` 因分页新增大量预览 mock 和 Tauri 分支重复，应考虑 API 类型和预览数据处理的局部整理，但不要在本计划中做大范围拆分。

## Owner Module Review

| Module | Owner responsibility | May depend on | Must not own |
|---|---|---|---|
| `src/components/ui.tsx` | 分页控件展示和基础按钮事件 | React props、现有 Button 风格 | 查询、筛选、选中项修正、业务默认值 |
| `src/lib/types/domain.ts` | 共享分页请求/响应类型 | 领域类型定义 | 运行时分页逻辑 |
| `src/lib/api/workbenchApi.ts` | 前端 API 边界和预览模式适配 | Tauri invoke、mockData、领域类型 | 模块筛选语义、详情选择策略 |
| `src/views/radar/RadarView.tsx` | Radar 筛选状态、页码状态、Row Card 列表和详情选择 | `PaginationBar`、Radar 类型 | SQLite 查询、GitHub 同步规则 |
| `src/views/projects/ProjectsView.tsx` | 项目筛选状态、页码状态、表格列表和详情选择 | `PaginationBar`、项目类型、launchState | 数据库查询、启动进程管理 |
| `src/views/skills/SkillsView.tsx` | Skills 本地/市场/更新子视图的前端分页接入 | `PaginationBar`、Skills 现有筛选 helpers | 扫描事实源、启用状态计算、市场安装流程重构 |
| `src-tauri/src/radar/db.rs` | Radar 分页 SQL、COUNT 和排序 | rusqlite、Radar 类型、normalize helpers | Tauri command 注册、前端状态 |
| `src-tauri/src/projects/db.rs` | Projects 分页 SQL、COUNT 和排序 | rusqlite、Project 类型、launch config loader | Tauri command 注册、启动进程管理 |

## Implementation Steps

| ID | Status | Step | Verification |
|---|---|---|---|
| PAG-1 | todo | 定义分页契约和前端控件：新增共享 `PageRequest` / `PageResult<T>` 类型，新增轻量 `PaginationBar`，支持总数、当前页、每页数量、上一页、下一页；结果不足一页时由调用方隐藏。 | `pnpm test -- --run` 或现有前端测试；手动检查控件在浅色/深色主题下不破坏 Toolbar/List Panel 布局。 |
| PAG-2 | todo | 实现 Radar 分页第一阶段：将 Radar 筛选条件保留在模块内，先确保搜索/筛选变化回到第一页、空页回退、当前选中项修正；根据实现风险选择后端分页查询或先前端分页当前过滤结果，但计划目标应收敛到后端 `LIMIT/OFFSET + COUNT`。 | 前端测试覆盖筛选后回第一页、删除最后一页最后一条回退、当前页第一项选中；Rust 测试覆盖 Radar 分页排序和 total。 |
| PAG-3 | todo | 将 Radar 后端查询边界收敛到 SQLite：新增或扩展 Radar list command，返回当前页和 `total`；保存、删除、合并重复组后刷新当前有效页，不改变同步/合并业务规则。 | `cargo test` 覆盖 `favorite DESC, updated_at DESC, lower(name)` 顺序、COUNT 和 LIMIT/OFFSET；前端测试覆盖删除和合并后的页码修正。 |
| PAG-4 | todo | 实现 Projects 分页：保持项目搜索、标签、启动状态、归档筛选语义；翻页后保留仍可见选中项，否则选中新页第一项；不影响启动日志详情页和运行中状态显示。 | 前端测试覆盖筛选回第一页、归档筛选和启动状态筛选下分页；Rust 测试覆盖 `ORDER BY lower(name)` 和 total。 |
| PAG-5 | todo | 接入 Skills 本地列表分页：保留现有 `skillFilters.ts` 语义、分类下拉、全局工具切换、项目启用详情；只对 `visibleSkills` 结果分页，不改变扫描、启用、冲突解决或分类数据模型。 | 前端测试覆盖 Skills 搜索/分类/工具/项目筛选回第一页、分页后操作列仍可用、详情选择修正。 |
| PAG-6 | todo | 接入技能市场和更新页分页：复用 `PaginationBar` 对当前缓存/状态结果做前端分页；安装、卸载、更新检查、批量更新继续按完整状态集合计算，不让当前页限制业务操作状态。 | 前端测试覆盖市场筛选统计不被当前页截断、安装进度仍跨子视图恢复、更新页只允许可更新项勾选。 |
| PAG-7 | todo | 完成样式和可访问性整理：分页控件放在列表区域底部或列表头/底部稳定位置，键盘可操作，窄宽度不挤压行级操作列。 | Playwright/RTL 检查控件标签、disabled 状态；人工检查默认窗口宽度下 Projects、Radar、Skills 不出现横向裁切。 |
| PAG-8 | todo | 更新必要文档和验证：如分页成为项目级 UI 规则，更新 `DESIGN.md`；如能力行为变化，更新相关 capability docs；运行统一验证。 | `pnpm verify`；必要时运行 Dev Flow 文档检查命令。 |

## Validation Strategy

- Rust:
  - Radar 分页查询返回稳定排序、正确 total、合法页大小和空结果。
  - Projects 分页查询返回稳定排序、正确 total，并保留启动项加载。
  - 删除或合并导致当前页为空时，前端能请求或落回有效页。
- Frontend:
  - 搜索、筛选、每页数量变化回到第一页。
  - 翻页后详情面板不显示已不在当前结果集的对象。
  - 分页控件在 loading、error、empty、single-page、多页状态下行为正确。
  - Skills 市场统计和更新批量状态不被当前页截断。
- Manual:
  - 默认窗口宽度下 Projects、Skills 操作列完整可见。
  - Radar Row Card 底部分页不遮挡重复组合并面板。
  - 浅色和深色主题下分页控件可读。

## Risks

- 当前前端 App shell 持有多模块数据，若实现时把分页请求状态上提到 `App.tsx`，会继续放大中心组件。应优先让分页状态留在 owner 视图中。
- Radar 和 Projects 的筛选当前在前端完成；若直接改成后端分页，需要同步迁移筛选参数，否则会出现“只分页未筛选的全量数据”或 total 不准确。
- Projects 启动状态筛选依赖当前内存启动会话，不完全是数据库字段。第一版若要后端分页 Projects，必须明确哪些筛选仍在前端完成；否则会产生数据库无法判断运行状态的问题。
- Skills 状态来自文件扫描、SQLite 元信息和工具目录状态合成，后端分页可能会破坏事实源边界。第一版应避免。
- 每页数量不持久化会让重启后恢复默认值，这是已确认取舍，不应偷偷写入 `app_settings`。

## Acceptance Criteria

- Radar、Projects、Skills 本地列表、技能市场和更新页使用一致的分页控件和页码行为。
- Radar 和 Projects 至少一个 SQLite owner 查询具备可测试的 `LIMIT/OFFSET + COUNT` 实现；最终实现路线应优先让本地数据库列表不再依赖一次性全量加载。
- 搜索或筛选变化后页码回到第一页。
- 当前页为空时自动回退到有效页或显示空状态，不出现无效页。
- 翻页后详情面板符合确认规则：保留仍在结果中的选中项，否则选中新页第一项。
- 未新增每页数量持久化设置。
- 未引入通用 DataTable、无限滚动、虚拟列表或 cursor 分页。
- `pnpm verify` 通过，或明确记录未通过原因和阻塞项。

## Artifact Routing

- Plan: `docs/plans/2026-06-23-pagination-system.md`。
- Source audit: none。
- Covered findings: none。
- Deferred findings: none。
- Capability docs: maybe；若实现改变用户可见能力，更新 `docs/capabilities/project-management.md`、`docs/capabilities/resource-radar.md`、`docs/capabilities/skills-management.md` 中对应列表能力描述。
- Design system: maybe；若分页控件成为通用项目级 UI 规则，使用 `/dev-design-system` 更新 `DESIGN.md`。
- Changelog: maybe；分页是用户可见能力，若项目维护 changelog，本实现完成后应通过 `/dev-changelog` 判断是否记录。
- Distill: needed；实现完成后运行 `/dev-distill`，关闭或归档本计划，并判断 capability/context-map/ADR 是否需要更新。
- ADR gate: not needed for第一版；采用传统页码分页和不持久化每页数量是可逆 UI/实现决策。若后续把分页契约确认为长期跨模块 API 标准，可在 distill 阶段重新判断。

## Completion

本计划完成条件：所有非延后步骤完成，无 blocked 步骤；相关测试和验证结果已记录；必要文档完成更新；本计划通过 `/dev-distill` 关闭、归档或明确保留。

## Next Step

使用 `/dev-branch` 在任务分支中实施。建议按 Radar -> Projects -> Skills/Market/Updates 的顺序分阶段提交和验证。
