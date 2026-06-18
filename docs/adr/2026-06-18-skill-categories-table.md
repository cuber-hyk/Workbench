---
artifact_type: adr
status: accepted
created: 2026-06-18
updated: 2026-06-18
---

# Skills 分类使用独立分类表

## Context

Skills 分类最初保存在 `skill_metadata.category` 文本字段中。这个模型足够支持单个 Skill 的分类选择，但无法自然表达分类本身的生命周期。

当前 Skills 页面需要支持选择已有分类、创建新分类、重命名分类、删除分类时迁移 Skills，以及合并分类。这些操作都以“分类是一个可管理对象”为前提。如果继续把分类只保存为 Skill 行上的文本，重命名和合并会变成批量字符串改写，并容易产生重复、空白或孤立分类。

## Decision

Skills 分类使用独立 `skill_categories` 表作为分类 source of truth。

`skill_metadata` 只保存 `directory_name` 和 `category_id`。Skill 列表展示时通过 `category_id` 关联 `skill_categories.name`，前端仍保留 `Skill.category` 作为展示字段，但写入只使用 `categoryId`。

`未分类` 是系统分类，后端保证存在，不允许删除或重命名。删除或合并分类时，只迁移该分类下 Skills 的 `category_id`，不删除 Skill 文件、工具目录内容或启用记录。

旧数据库打开时自动把 `skill_metadata.category` 文本值迁移为 `skill_categories` 记录和 `category_id` 引用，迁移后读写只使用 `category_id`。

## Alternatives

1. 继续使用 `skill_metadata.category` 文本字段。
   - 优点：不需要新表和迁移。
   - 缺点：分类没有稳定身份，重命名、删除迁移和合并都依赖批量字符串更新，容易形成双源和脏分类。

2. 在前端从 Skills 列表动态去重生成分类集合。
   - 优点：实现最少。
   - 缺点：无法管理空分类，也无法表达分类排序、计数、删除迁移和合并确认。

3. 使用目录结构表达分类。
   - 优点：分类与文件组织统一。
   - 缺点：会改变 Skills 统一根目录和工具同步边界，分类操作会变成文件移动，风险高且不符合“分类只用于 Workbench 内整理”。

## Consequences

- 分类管理有稳定数据模型，可以支持新增、重命名、删除迁移和合并。
- 数据库需要执行一次从文本分类到 `category_id` 的迁移。
- 前端分类筛选和行内分类下拉必须使用 `SkillsState.categories`，不能再从 `Skill.category` 去重作为唯一来源。
- 后续如果增加分类排序、颜色或统计，可以扩展 `skill_categories`，不需要改 Skill 文件目录结构。
