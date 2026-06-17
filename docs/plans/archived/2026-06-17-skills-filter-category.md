---
artifact_type: plan
status: archived
created: 2026-06-17
updated: 2026-06-17
owner: codex
---

# Skills 筛选与分类编辑改进计划

## Goal

改进 Skills 模块的筛选与分类编辑体验：支持按启用工具和项目筛选 Skills，将分类编辑从双击标签改为下拉选择或创建新分类，并移除详情区重复的分类展示。

## Scope

- 在 Skills 工具栏增加工具筛选和项目筛选。
- 工具筛选同时匹配全局启用和项目级启用。
- 项目筛选匹配在指定项目下启用过的 Skills。
- 工具筛选与项目筛选同时使用时，只显示在该项目下启用了该工具的 Skills。
- 将列表分类编辑改为可发现的下拉控件：选择已有分类，或创建新分类。
- 空分类统一保存为“未分类”。
- 移除 Skills 详情标题中的分类描述和详情底部的分类输入，减少重复信息。
- 更新 PRD 和 DESIGN 中关于分类编辑方式的描述。
- 增加或更新前端测试，覆盖新增筛选和分类编辑交互。

## Non-Goals

- 不修改 Skills 后端 SQLite 表结构。
- 不新增独立分类管理页面或分类表。
- 不改变 Skill 启用、停用、冲突解决、导入或删除逻辑。
- 不引入在线 Skills 市场、远程同步或自动分类。
- 不做无关样式重构。

## Assumptions And Decisions

- 已确认：工具筛选同时包含全局启用和项目级启用。
- 已确认：详情区不再展示分类，分类只在列表表格中查看和编辑。
- 已确认：双击分类编辑不再作为主要交互，改为下拉选择已有分类或创建新分类。
- 选择依据：当前 `Skill` 前端类型已包含 `globalToolStates`、`enabledTools` 和 `enabledProjects`，新增筛选可由前端派生，不需要新增数据源。
- ADR gate：不需要。该改动是局部 UI 与筛选语义调整，不改变长期架构或数据所有权。

## Fact Sources

- `AGENTS.md`：要求中文沟通、简单优先、外科手术式修改、不直接 push。
- `CONTEXT.md`：Skills 已接入真实后端；统一 Skills 根目录是真实来源。
- `docs/ai/context-map.md`：Skills 相关入口为 `src/App.tsx`、`src/lib/types/domain.ts`、`src/lib/api/workbenchApi.ts`、`src-tauri/src/skills.rs`。
- `DESIGN.md`：Skills 使用表格行；筛选位于列表上方；详情区避免重复展示列表操作。
- `docs/PRD.md`：Skills 支持分类、自定义分类、分类筛选和项目/工具启用。
- `src/App.tsx`：`SkillsView` 当前实现搜索、分类筛选、状态筛选、`InlineCategory` 双击编辑、详情区分类重复展示。
- `src/lib/types/domain.ts`：`Skill.enabledProjects` 包含 `projectName/projectPath/tool/syncMethod`；`ToolTarget` 包含工具 key 和显示名。
- `src/lib/api/mockData.ts`：已有 mock Skills 覆盖全局工具和项目级启用组合。
- `src/App.test.tsx`：现有 UI 测试主要覆盖项目与 Radar；需要补齐 Skills 筛选和分类编辑测试。

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| SFC-1 | done | 用测试先固定 Skills 筛选语义：工具筛选命中全局或项目级启用；项目筛选命中指定项目启用；工具 + 项目组合命中指定项目下该工具启用。 | 已新增前端测试；实施前失败于 `SkillsView` 未导出和新行为缺失，实施后通过。 |
| SFC-2 | done | 在 `SkillsView` 中增加 `toolFilter` 和 `projectFilter` 状态，基于 `settings.toolTargets` 与 `projects` 生成下拉项，并在 `visibleSkills` 中组合匹配搜索、分类、状态、工具和项目。 | `pnpm test -- --run src/App.test.tsx` 通过，覆盖工具、项目和组合筛选。 |
| SFC-3 | done | 将 `InlineCategory` 替换为列表内分类下拉控件，传入已有分类集合；支持选择已有分类；选择“新建分类...”后显示轻量输入并保存到当前 Skill。 | `pnpm test -- --run src/App.test.tsx` 通过，覆盖选择已有分类和新建分类保存。 |
| SFC-4 | done | 移除详情区分类冗余：`DetailHeader` 不再使用 `分类：...` 描述，删除详情底部 `category-field` 输入；保留描述、冲突、项目启用和 SKILL.md 路径。 | `pnpm test -- --run src/App.test.tsx` 通过，确认详情区不再重复分类文案和输入。 |
| SFC-5 | done | 更新 `docs/PRD.md` 与 `DESIGN.md`：把“双击分类标签编辑”改为“通过分类下拉选择或创建分类”；补充 Skills 支持按启用工具和项目筛选。 | 已更新 PRD、DESIGN 和 CHANGELOG；待最终文档检查。 |
| SFC-6 | done | 执行验证并修正回归：前端测试、项目统一验证，必要时补充视觉/可访问性检查。 | `pnpm test -- --run src/App.test.tsx` 通过；完整 `pnpm verify` 待 review gate 前运行。 |

## Acceptance Criteria

- Skills 工具栏出现工具筛选和项目筛选。
- 选择某个工具时，全局启用该工具或项目级启用该工具的 Skill 都会出现。
- 选择某个项目时，只显示在该项目启用过的 Skill。
- 同时选择工具和项目时，只显示在该项目下启用了该工具的 Skill。
- 分类可在列表中通过下拉选择已有分类。
- 可以从分类下拉创建新分类，并立即应用到当前 Skill。
- 空分类保存为“未分类”。
- 详情区不再展示分类标题描述，也不再有分类输入。
- PRD 和 DESIGN 不再要求双击分类编辑。
- 相关前端测试通过，统一验证通过或明确记录未运行原因。

## Risks

- 筛选栏控件增加后可能在默认桌面宽度下拥挤。第一版保持原生 `select`，不新增复杂 chips。
- 分类创建入口如果放在表格行内，需阻止事件冒泡，避免误选行。
- `selectedSkill` 可能被筛选排除；本计划不强制改选中逻辑，但实现时应确认详情是否仍符合当前 Skills 交互预期。

## Artifact Routing

- Plan: `docs/plans/2026-06-17-skills-filter-category.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: maybe；如果实现后形成长期能力说明，可新增或更新 Skills capability 文档，但本计划不强制。
- PRD: update needed
- DESIGN: update needed
- Changelog: needed；这是用户可见的 Skills 筛选与分类编辑体验变更。
- Distill: maybe；实现完成后由 `/dev-branch` 判断是否需要写入 capability 或 ADR。
- ADR gate: not needed
- `docs/ai/context-map.md`: likely no update；现有入口仍准确。

## Completion

当 SFC-1 到 SFC-6 全部完成、无阻塞项、测试和文档检查结果已记录时，本计划完成。
