---
artifact_type: plan
status: archived
created: 2026-06-18
updated: 2026-06-18
owner: codex
---

# Skills 分类表与分类管理计划

## Goal

将 Skills 分类从 `skill_metadata.category` 文本值升级为正式分类实体表，支持分类新增、重命名、删除迁移和合并，并保持 Skills 列表筛选、行内分类选择和启用管理行为稳定。

## Scope

- 新增 SQLite `skill_categories` 表，作为 Skills 分类的 source of truth。
- 将现有 `skill_metadata.category` 文本迁移为 `category_id` 引用。
- `未分类` 作为系统保底分类，必须存在，不允许删除。
- `SkillsState` 返回分类列表和每个 Skill 的分类 ID/名称。
- 保留前端显示用 `Skill.category` 名称，新增 `Skill.categoryId` 用于写入和管理。
- 更新分类选择：行内分类下拉从分类表读取；新建分类创建分类记录后把当前 Skill 归入新分类。
- 增加分类管理弹窗：新增、重命名、删除并迁移、合并分类。
- 更新 PRD、ARCHITECTURE、DESIGN 和 `docs/capabilities/skills-management.md`。
- 增加 Rust 和前端测试覆盖迁移、分类 CRUD、合并/删除迁移和 UI 交互。

## Non-Goals

- 不实现二级分类。
- 不实现分类颜色、图标、拖拽排序或复杂统计看板。
- 不改变 Skill 文件目录、工具目录、符号链接或 Copy 同步结构。
- 不改变全局启用、项目启用、导入、冲突解决和删除 Skill 的核心语义。
- 不把参考项目代码合并进本仓库。

## Assumptions And Decisions

- 已确认：分类需要成为可管理对象，因此引入分类表。
- 已确认：第一版仍使用一级分类。
- 分类 source of truth 从 Skill 文本字段迁移到 `skill_categories` 表。
- `未分类` 是系统分类，后端 seed，所有无分类或删除迁移默认可落到它。
- 分类删除不删除 Skills；删除非空分类时必须提供迁移目标。
- 分类合并等价于把源分类下所有 Skills 迁移到目标分类，然后删除源分类。
- 重命名分类只更新分类表名称，不逐条改 Skill 元数据。
- ADR gate: maybe。该改动改变分类数据 source of truth，但范围局限在 Skills 模块；实现完成后由 `/dev-distill` 判断是否需要 ADR。

## Fact Sources

- `AGENTS.md`：要求中文沟通、简单优先、外科手术式修改、不直接 push。
- `CONTEXT.md`：Skills 使用 `~/.workbench/skills` 作为统一真实来源；分类只属于 Workbench 内整理。
- `docs/ai/context-map.md`：Skills 入口为 `src/App.tsx`、`src/lib/types/domain.ts`、`src/lib/api/workbenchApi.ts`、`src-tauri/src/skills.rs` 和 `docs/capabilities/skills-management.md`。
- `docs/capabilities/skills-management.md`：当前分类是 Workbench 内整理能力，筛选和行内分类下拉已存在。
- `DESIGN.md`：Skills 使用表格行、顶部工具栏筛选、详情面板避免重复操作；弹窗用于聚焦任务。
- `src-tauri/src/skills.rs`：当前 SQLite 只有 `skill_metadata(directory_name, category TEXT NOT NULL DEFAULT '未分类')`，`set_skill_category` 按文本写入。
- `src/lib/types/domain.ts`：已有 `SkillCategory { id, name }` 类型雏形，`Skill` 当前只有 `category: string`。
- `src/App.tsx`：分类列表当前由 `skills.map(skill.category)` 去重派生；行内下拉支持选择和新建分类。
- `src/App.test.tsx`：已有 Skills 筛选、分类选择、新建分类和详情去重测试。

## Data Model

新增表：

```sql
CREATE TABLE IF NOT EXISTS skill_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

迁移 `skill_metadata`：

```text
旧：directory_name TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT '未分类'
新：directory_name TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES skill_categories(id)
```

迁移规则：

- 读取现有 `skill_metadata.category` 去重，创建对应 `skill_categories`。
- 空值或缺失值归入 `未分类`。
- 为每条 `skill_metadata` 写入对应 `category_id`。
- 迁移后读写只使用 `category_id`。
- 旧 `category` 字段是否物理移除由实现选择；若 SQLite 重建表成本可控，第一版重建为新结构，避免双源长期存在。

## API Design

后端新增或调整 commands：

- `get_skills_state() -> SkillsState`：返回 `settings`、`skills`、`categories`。
- `set_skill_category(directory_name, category_id)`：将 Skill 归入已有分类。
- `create_skill_category(name) -> SkillsState`。
- `rename_skill_category(category_id, name) -> SkillsState`。
- `delete_skill_category(category_id, replacement_category_id) -> SkillsState`。
- `merge_skill_category(source_category_id, target_category_id) -> SkillsState`。

后端校验：

- 分类名 trim 后不能为空。
- 分类名唯一。
- `未分类` 不允许删除或合并到其他分类。
- 删除非空分类必须提供有效 replacement。
- 合并源和目标不能相同。
- `set_skill_category` 只能引用已存在分类。

前端类型：

```ts
interface SkillCategory {
  id: string;
  name: string;
  sortOrder: number;
  skillCount?: number;
}

interface Skill {
  categoryId: string;
  category: string;
}

interface SkillsState {
  settings: AppSettings;
  skills: Skill[];
  categories: SkillCategory[];
}
```

## UI Design

- Skills 顶部保留现有分类筛选，下拉项来自 `state.categories`。
- 行内分类下拉来自 `state.categories`；选择已有分类调用 `setSkillCategory(directoryName, categoryId)`。
- 行内“新建分类...”创建分类后，将当前 Skill 归入新分类。
- 页面操作区增加 `管理分类` 按钮，打开聚焦弹窗。
- 分类管理弹窗使用紧凑表格：
  - 分类名
  - Skills 数量
  - 操作：重命名、合并、删除
- 删除非空分类必须选择迁移目标；默认可选 `未分类`。
- 合并分类必须选择目标分类；源分类删除。
- 不在详情面板重复展示分类管理。

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| SCT-1 | done | 用 Rust 测试固定迁移与分类实体语义：旧 `skill_metadata.category` 迁移为分类表与 `category_id`；`未分类` seed；空分类归入 `未分类`。 | `cargo test --manifest-path src-tauri/Cargo.toml category` 通过。 |
| SCT-2 | done | 实现后端数据模型和 commands：分类表、迁移、list/create/rename/delete/merge/set category，并注册 Tauri commands。 | Rust 测试覆盖分类 CRUD、重名校验、删除迁移、合并迁移、系统分类保护。 |
| SCT-3 | done | 更新前端类型、API 和 mock 数据：`SkillsState.categories`、`Skill.categoryId/category`、分类管理 API 边界。 | `pnpm exec tsc --noEmit` 和 `pnpm test -- --run src/App.test.tsx` 通过。 |
| SCT-4 | done | 更新 Skills UI：分类筛选和行内下拉改用分类表；新建分类创建实体；新增分类管理弹窗。 | 前端测试覆盖筛选、行内选择、新建分类、重命名、删除迁移、合并分类。 |
| SCT-5 | done | 更新文档：PRD、ARCHITECTURE、DESIGN、skills capability、CHANGELOG；必要时更新 context-map。 | `rg "skill_categories|分类表|管理分类" docs DESIGN.md CHANGELOG.md` 可见新规则。 |
| SCT-6 | done | 执行完整验证和 UI 检查。 | `pnpm verify` 通过；前端交互由新增 Skills 分类管理测试覆盖。 |

## Acceptance Criteria

- 旧数据库打开后自动迁移现有分类为 `skill_categories` 记录。
- `get_skills_state` 返回分类列表，前端不再从 Skills 字符串去重作为唯一分类来源。
- 每个 Skill 有稳定 `categoryId` 和展示名 `category`。
- 可新增分类。
- 可重命名分类，相关 Skills 展示新名称。
- 可删除空分类。
- 删除非空分类时必须迁移到其他分类或 `未分类`。
- 可合并分类，源分类消失，源分类下 Skills 移到目标分类。
- `未分类` 始终存在，不可删除。
- 分类管理不会影响 Skill 文件目录、启用记录、工具目录链接或副本。
- 前端、Rust 和完整验证通过，或明确记录未运行原因。

## Risks

- SQLite 迁移若保留旧 `category` 字段会产生双源风险；计划倾向重建 `skill_metadata` 表消除双源。
- 现有用户数据库可能有重复、空白或大小写相近分类名；迁移时需要 trim，并保持中文分类稳定。
- 分类管理弹窗如果同时承担新增、重命名、删除、合并，交互容易拥挤；第一版保持表格 + 聚焦确认区，不做复杂多面板。
- 前端仍保留 `Skill.category` 展示字段，需确保它只来自 join 后的分类表名称，不再作为写入 source of truth。

## Artifact Routing

- Plan: `docs/plans/2026-06-18-skill-categories-table.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: update `docs/capabilities/skills-management.md`
- Architecture docs: update `docs/ARCHITECTURE.md`
- PRD: update `docs/PRD.md`
- DESIGN: update `DESIGN.md`
- Changelog: needed；分类管理和数据模型迁移是用户可见能力。
- Distill: needed；分类 source of truth 改变，需更新 durable knowledge，并运行 ADR gate。
- ADR gate: maybe；由 `/dev-distill` 根据最终实现决定是否记录为 ADR。
- `docs/ai/context-map.md`: maybe；如果只更新现有 Skills capability 和同一代码入口，可能不需要改。

## Completion

当 SCT-1 到 SCT-6 全部完成、无阻塞项、验证结果记录完成，并且分类表成为唯一分类 source of truth 时，本计划完成。
