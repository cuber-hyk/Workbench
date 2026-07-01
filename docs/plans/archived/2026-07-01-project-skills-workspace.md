---
artifact_type: plan
status: archived
created: 2026-07-01
updated: 2026-07-02
owner: dev-plan
---

# 项目 Skills 工作区计划

## 目标

在项目模块中新增以当前项目为中心的 `项目 Skills` 工作区，默认按单个项目级工具管理该工具下的全部 Skills，并保留跨工具对比视图用于排查不同工具间的状态差异；本地 Skills 页继续只负责统一根目录、全局工具启用、分类、导入、同步和更新。

## 范围

- 在项目详情中增加项目 Skills 摘要和入口，点击后进入项目模块内的独立 `项目 Skills` 工作区。
- 首期只管理当前选中项目，不做跨项目总览。
- 只展示后端标记为支持项目级 Skills 的工具，不展示仅支持全局目录的自定义工具；当前内置工具均支持项目级 Skills。
- 默认使用工具视图：用户先选当前项目级工具，再用普通表格管理该工具下的全部 Skills。
- 保留跨工具对比视图：以 `Skill x Project Tool` 矩阵展示项目级目标状态，默认只显示当前工具和少量常用/已选工具，并通过工具工作集控制可见列。
- 工具视图和跨工具对比视图都使用右侧选中详情区承载完整路径、说明和写入动作；矩阵单元格保持紧凑，只展示状态和摘要。
- 支持单项启用、停用、修复缺失目标、重建受管目标、处理冲突和刷新只读扫描。
- 支持对当前项目的选中 Skills 批量启用到选中工具；批量操作逐项返回结果。
- 保留现有 `skill_enablements` project scope 数据模型，不做数据库迁移。
- 更新前端类型、API、测试、能力文档、设计规则和 changelog。

## 非目标

- 不恢复本地 Skills 表格中的项目启用列。
- 不把项目级关系塞回单个 Skill 详情。
- 不做项目组、模板、推荐配置或“一键同步所有项目”。
- 不支持不具备 project scope 的工具。
- 不自动覆盖项目目录中已有的用户内容。
- 不自动重同步所有项目级 Copy 副本。
- 不迁移或清理用户已有项目级启用记录。
- 不改变统一 Skills 根目录作为 Skill 内容真实来源的架构。

## 假设与已确认决策

- 决策：入口放在项目模块，项目详情只保留摘要和入口，完整管理能力进入独立 `项目 Skills` 工作区；这是项目环境配置，不是全局 Skill 仓库管理。
- 决策：首期以项目为中心，不做 Skill 中心或全局矩阵。
- 决策：项目级关系按 `Project x Skill x Project Tool` 建模和展示；Project Tool 指后端 `supports_project_scope = true` 的工具，不等同于全局工具列表。
- 决策：项目 Skills 工作区不提供“全部工具”展示模式，不显示全局-only 工具；未来新增内置项目级工具时，只要后端注册表提供 `project_path`，前端自动进入候选项目级工具集合。
- 决策：工具视图是默认工作流，因为用户大概率在固定工具下开发；跨工具对比降级为辅助入口，用于排查同一 Skill 在多个工具下的差异。
- 决策：矩阵用于扫描和比较状态，单元格内不堆叠打开、修复、启用等动作；选中单元格后在右侧详情区执行动作。
- 决策：跨工具对比横向滚动时必须固定第一列 `Skill` 和表头，右侧详情区固定在页面右侧，不参与横向滚动。
- 决策：批量启用不在工具列选择器里常驻“批量”复选框；点击批量启用后再选择目标工具。
- 决策：工具视图下批量启用默认目标是当前工具；需要启用到多个工具时，再在批量启用弹窗中选择更多项目级工具。
- 决策：扫描当前项目的项目级 Skills 目录时只读，不创建目录、不修复、不写数据库。
- 决策：所有会修改项目目录的动作必须由用户显式触发。
- 决策：Workbench 只删除或重建它能证明自己管理的目标；未受管同名内容进入冲突流程。
- 决策：覆盖项目目录已有同名 Skill 前必须备份。
- 决策：批量操作不做全局事务回滚，按项返回成功、跳过、冲突和失败。
- 决策：本计划不需要 ADR；它是在现有项目级启用能力上补齐独立工作区，不改变长期数据所有权。

## 状态模型

项目 Skills 单元格状态首期使用以下语义：

- `disabled`：没有启用记录，也没有项目目标目录。
- `managed_symlink`：Workbench 管理的符号链接，指向统一根目录对应 Skill。
- `managed_copy`：Workbench 管理的 Copy 副本，内容与统一根目录一致。
- `stale_copy`：Workbench 管理的 Copy 副本存在，但内容与统一根目录不一致。
- `missing_target`：数据库记录存在，但项目目录目标已缺失。
- `source_missing`：数据库记录存在，但统一根目录中的源 Skill 已缺失。
- `conflict`：项目目录存在同名目标，但不是当前 Workbench 可安全管理的目标。
- `unsupported`：工具不支持项目级 Skills；不显示为项目 Skills 工作区列。
- `project_missing`：项目路径不存在或不是目录；整页只读并展示错误。

## 事实来源

- `CONTEXT.md`：Skills 使用统一根目录作为真实来源，启用优先 Symlink，失败回退 Copy。
- `docs/capabilities/skills-management.md`：项目级启用数据和后端命令保留，本地 Skills 页暂不展示项目启用摘要。
- `docs/ARCHITECTURE.md`：项目级启用必须通过 `supports_project_scope` 守卫；项目 Skills 工作区只使用后端返回的项目级工具集合。
- `DESIGN.md`：本地 Skills 详情不展示项目启用摘要，项目关系管理进入独立设计。
- `src-tauri/src/skills.rs`：现有 `set_skill_enabled` 支持 `scope = project`。
- `src-tauri/src/skills/types.rs`、`src/lib/types/domain.ts`：现有 `ProjectEnablement` / `enabledProjects` 类型。
- `src/App.tsx`：当前 app-level 仍保留项目级批量开关回调，但 UI 入口已移除。
- `src/views/projects/ProjectsView.tsx`：项目模块负责项目列表、详情摘要和进入项目 Skills 独立工作区。

## Dev Split 约束

分类：`proposed split` for new behavior placement, but no broad mechanical split.

原因：相关中心文件已经较大，新增项目级状态扫描、矩阵 UI 和批量结果处理会扩展职责；需要把新行为放到明确 owner 模块，避免继续堆进 facade 或应用壳。

代码放置约束：

- 后端 command 注册和薄入口可以留在 `src-tauri/src/skills.rs`，但项目级 Skills 状态扫描和批量操作逻辑必须放入 `src-tauri/src/skills/project_scope.rs` 或同等明确命名模块。
- 后端文件系统副作用继续复用 `src-tauri/src/skills/filesystem.rs`，不得新增 `utils`、`helpers`、`common` 这类空泛模块。
- 工具路径解析继续复用 `tool_targets.rs`；项目级守卫不在前端重复成为唯一事实源。
- 前端项目 Skills UI 放入 `src/views/projects/ProjectSkillsView.tsx`，`ProjectsView.tsx` 只负责选择项目、展示摘要入口和切换到独立工作区。
- `src/App.tsx` 只编排 API 调用和 toast，不承载矩阵选择状态、批量结果状态或冲突弹窗内部状态。
- API 包装放在 `src/lib/api/workbenchApi.ts`，类型放在 `src/lib/types/domain.ts`；不要创建新的泛用前端 helper。
- 测试优先保留 `src/App.test.tsx` 作为集成交互覆盖；如果 ProjectSkillsView 纯状态格式化逻辑变多，再新增靠近 owner 的小型单元测试。

Owner module review:

| Module | Owner responsibility | May depend on | Must not own |
|---|---|---|---|
| `src-tauri/src/skills/project_scope.rs` | 当前项目下项目级 Skill 目标扫描、状态归类、单项/批量操作结果 | `filesystem.rs`, `tool_targets.rs`, `db.rs`, `types.rs` | 全局 Skills 同步、市场更新、项目 CRUD |
| `src/views/projects/ProjectSkillsView.tsx` | 项目 Skills 工具视图、跨工具对比视图、筛选、选中详情、批量结果展示 | `components/ui`, `ToolIcon`, project/skills domain types | app-level 数据加载、全局 Skills 列表、后端状态判定 |
| `src/lib/types/domain.ts` | 前端项目 Skills DTO 类型 | 后端 serde 字段约定 | 业务计算 |
| `src/lib/api/workbenchApi.ts` | Tauri command 包装 | domain types | UI 状态 |

## 执行步骤

| ID | 状态 | 步骤 | 验证 |
|---|---|---|---|
| PSW-1 | done | 建立项目级 Skills 后端状态 DTO 和只读扫描 command，返回当前项目、支持工具、Skill 列表、每个 `Skill x Tool` 单元格状态、目标路径和说明。 | Rust 测试覆盖项目不存在、disabled 和 conflict；后端状态模型包含 managed symlink/copy、stale copy、missing target 和 project missing。 |
| PSW-2 | done | 实现项目级单项操作 command：启用、停用、修复 missing target、重建 stale copy、处理 conflict；所有写操作复用现有 Auto 同步、受管目标删除和备份规则。 | Rust 测试覆盖已有同名冲突不覆盖；既有启用/停用/Auto 同步测试继续通过。 |
| PSW-3 | done | 实现当前项目批量启用和受管目标重建，按项返回结果；冲突和未受管目标跳过，不做自动覆盖。 | 前端批量启用测试通过；后端批量启用按项返回结果。 |
| PSW-4 | done | 增加前端类型和 API：项目级状态读取、单项操作、批量操作和刷新；保留现有 `setSkillEnabled` 兼容路径，避免一次性删除旧 API。 | `pnpm exec tsc --noEmit` 通过；mock/web preview 返回稳定示例数据。 |
| PSW-5 | done | 在项目详情中增加项目 Skills 摘要入口，并接入独立 `ProjectSkillsView` 工作区：搜索 Skill、按状态筛选、矩阵展示项目级工具、单元格状态和路径详情。 | React 测试覆盖项目详情可进入项目 Skills 工作区和矩阵展示。 |
| PSW-6 | done | 实现单元格事件和确认弹窗：disabled 直接启用；managed 走停用确认；stale/missing 走修复确认；conflict 走版本选择/打开目录/打开统一根目录。 | 危险操作使用确认弹窗；missing target 支持重建和清理记录；conflict 支持显式接管和打开路径。 |
| PSW-7 | done | 实现顶部操作：刷新、批量启用、重建受管目标；提交中禁用重复操作，部分成功保留结果面板，全成功 toast 汇总。 | 前端测试覆盖批量启用；UI 支持选中目标重建和结果面板。 |
| PSW-8 | done | 更新文档、设计规则和 changelog；实现完成后通过 distill/check closeout。 | `docs/capabilities/skills-management.md`、`docs/ARCHITECTURE.md`、`DESIGN.md`、`docs/ai/context-map.md`、`CHANGELOG.md` 已更新；Dev Flow docs validation 通过，仅剩既有 warning。 |
| PSW-9 | done | 完整验证和人工检查。 | `pnpm verify` 通过。 |
| PSW-10 | done | 根据 UI 复盘优化项目 Skills 工作区：只展示项目级工具集合，增加可见工具列选择器，矩阵单元格改为紧凑状态，右侧详情区承载路径、说明和动作。 | React 测试覆盖项目级工具选择器不显示全局-only 工具、选中单元格详情和批量启用；`pnpm exec tsc --noEmit` 通过。 |
| PSW-11 | done | 开通全部内置工具项目级 Skills，并调整批量启用交互：工具列选择器只负责显示列，批量启用弹窗负责选择目标工具。 | Rust 测试覆盖全部内置工具支持项目路径；React 测试覆盖批量启用弹窗。 |
| PSW-12 | done | 将项目 Skills 默认 UI 调整为工具视图：内部工具上下文栏选择当前工具，中间表格只展示该工具下全部 Skills，右侧详情固定；保留跨工具对比入口，并为矩阵表头和 Skill 第一列增加 sticky。 | React 测试覆盖默认进入工具视图、切换当前工具、批量启用默认当前工具、进入跨工具对比、矩阵横向滚动时 Skill 第一列保留 sticky class；`pnpm verify` 通过。 |
| PSW-13 | done | 优化项目 Skills 刷新和矩阵单元格体验：已有数据重扫时保留当前工作区，未启用矩阵单元格改为低强调 `+ 启用`，矩阵 Skill 说明补齐分类前缀，工作区高度吃满剩余页面空间。 | React 测试覆盖已有状态刷新时不显示扫描空态、矩阵分类前缀和低强调启用入口；项目 Skills 工作区滚动仍限定在列表、矩阵和详情内部。 |

## 交互与事件规则

- 进入 `项目 Skills`：只读扫描当前项目，不创建目录。
- 点击 `刷新`：重新执行只读扫描，不修复状态。
- 点击 disabled 单元格：若目标不存在，直接启用；若目标已存在，返回 conflict 并要求用户处理。
- 点击矩阵单元格：点击状态胶囊执行启用或停用；点击单元格空白只改变当前选中项并刷新详情区，不直接写入项目目录。
- 切换当前工具：工具视图只过滤展示该工具下的所有 Skills，不重新扫描；当前工具来自后端返回的项目级工具集合。
- 点击跨工具对比：进入矩阵辅助视图；矩阵横向滚动只作用于工具列区域，Skill 第一列和右侧详情保持可见。
- 点击 managed 单元格：进入停用确认；只删除 Workbench 管理目标。
- 点击 stale copy：进入重建确认；备份旧 Copy 后用统一根目录版本重建。
- 点击 missing target：提供重新创建目标和清理记录两种动作。
- 点击 conflict：打开冲突处理弹窗；默认不选择覆盖。
- 点击 `批量启用`：工具视图默认勾选当前工具；用户可在批量启用弹窗中增加或移除目标工具后执行；冲突项跳过并在结果里展示。
- 点击 `重建受管目标`：只处理已有 `skill_enablements` 记录，不接管未受管同名内容。
- 打开目录类操作：目标目录不存在时先确认是否创建并打开。

## 边界情况

- 项目路径不存在或不是目录：整页只读，不提供启用/重建。
- 统一根目录中的 Skill 被删除但项目记录仍存在：状态显示 source missing 或 invalid，并提供清理记录，不重建。
- 项目工具目录不存在：扫描显示 disabled；启用时可创建父目录。
- 目标路径是普通文件：显示 conflict，不删除。
- 目标是符号链接但指向非统一根目录：显示 conflict。
- 目标是符号链接但指向旧统一根目录：显示 conflict 或可重建受管目标，取决于数据库记录能否证明 Workbench 管理。
- Copy 内容与统一根目录不同：显示 stale copy，不自动覆盖。
- 受管目标被用户修改：停用或重建前必须检测，不能误删。
- 批量操作部分失败：不回滚已成功项，结果逐项展示。
- Windows 符号链接创建失败：回退 Copy，并记录 `sync_method = copy`。
- 备份失败：不删除、不替换、不写新状态。
- 工具不支持 project scope：不显示为可操作列；后端仍必须拒绝。

## 验收标准

- 项目详情中存在 `项目 Skills` 摘要入口，点击后进入独立项目 Skills 工作区；本地 Skills 页不恢复项目启用详情。
- 页面以当前项目为中心，默认按当前项目级工具展示该工具下全部 Skills，不显示全局-only 工具。
- 用户可以切换当前项目级工具；工具列表来自后端返回的项目级工具集合，前端不写死工具。
- 保留跨工具对比入口；当项目级工具数量较多时，用户可控制可见工具列，矩阵单元格保持紧凑，Skill 第一列和右侧详情在横向滚动时保持固定。
- 工具视图下批量启用默认使用当前工具作为目标，仍允许在确认弹窗中选择多个项目级工具。
- 用户可以对当前项目启用、停用、修复和重建项目级 Skill 目标。
- 冲突和覆盖操作必须显式确认，且覆盖前有备份。
- 批量操作按项返回结果，冲突不会被自动覆盖。
- 项目缺失、目标缺失、旧链接、过期 Copy、未受管同名内容均有可理解状态。
- 后端测试覆盖状态分类和文件系统安全边界。
- 前端测试覆盖项目 Skills 独立工作区、矩阵交互、确认弹窗和批量结果。
- `pnpm verify` 通过。

## 交付物路由

- Plan：`docs/plans/2026-07-01-project-skills-workspace.md`
- Source audit：无
- Covered findings：无
- Deferred findings：无
- Capability docs：实现时更新 `docs/capabilities/skills-management.md`
- Architecture docs：实现时更新 `docs/ARCHITECTURE.md`
- Context map：如新增 `ProjectSkillsView` 和 `skills/project_scope.rs`，更新 `docs/ai/context-map.md`
- Design system：需要更新 `DESIGN.md`，确认项目详情摘要入口和项目 Skills 独立矩阵工作区规则
- Changelog：需要；这是用户可见项目工作流新增能力
- Tests：需要；Rust 后端状态/操作测试和 React 前端交互测试
- Distill：需要；实现分支完成后归档或更新本计划，并同步能力文档
- ADR gate：暂不需要；若实施中决定引入项目 Skills 模板、项目组或新的状态持久化表，再重新评估 ADR

## 完成条件

所有计划步骤完成并通过验证后，用户可以在项目模块内完成当前项目的项目级 Skills 管理；本地 Skills 页保持全局 Skill 管理职责；项目目录中的用户内容不会被静默覆盖；本计划通过 `/dev-distill` 归档或明确保留后续项。

## 实施记录

- 新增后端 `src-tauri/src/skills/project_scope.rs`，并在 `src-tauri/src/skills.rs` / `src-tauri/src/lib.rs` 注册项目级 Skills 扫描、单项操作和批量启用 command。
- 新增前端 `src/views/projects/ProjectSkillsView.tsx`，项目详情只展示项目 Skills 摘要入口，矩阵进入项目模块内独立工作区。
- 优化项目 Skills 工作区 UI：项目级工具列来自后端 `supportsProjectScope` 集合，工具列选择器不展示全局-only 工具；矩阵单元格只显示状态摘要，右侧详情区承载完整路径和写入动作。
- 调整项目 Skills 工作区默认 UI：默认进入单工具视图，左侧选择项目级工具，中间表格管理当前工具下全部 Skills；保留跨工具对比入口，矩阵表头和 Skill 第一列固定。
- 完善项目 Skills 工具视图：收窄左右栏、简化工具列按钮、移除中间表格目标路径列、未启用状态可直接启用、移除底部常驻结果条，并复用 Skills 分类元数据支持分类筛选。
- 保留现有 `setSkillEnabled` 兼容路径；项目工作区使用独立 API。
- 验证：
  - `pnpm exec tsc --noEmit`
  - `pnpm test -- --runInBand`
  - `pnpm build`
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
  - `cargo test --manifest-path src-tauri/Cargo.toml project_scope`
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `pnpm verify`
  - `node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.9.0\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench`
