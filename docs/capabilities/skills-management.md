---
artifact_type: capability
status: current
created: 2026-06-17
updated: 2026-06-18
source_of_truth: src-tauri/src/skills.rs
adr: none
---

# Skills 管理

Skills 管理模块使用统一 Skills 根目录作为本地 Skill 内容的真实来源，并通过 Workbench SQLite 记录分类、全局启用、项目级启用、同步方式和冲突状态。前端入口位于 `src/App.tsx`，后端 source of truth 为 `src-tauri/src/skills.rs`。

## 当前能力

- 扫描统一 Skills 根目录中包含 `SKILL.md` 的 Skill。
- 从 ZIP 文件或已解压文件夹导入一个或多个 Skills。
- 打开统一 Skills 根目录和单个 `SKILL.md` 文件。
- 删除统一根目录中的 Skill，并清理 Workbench 管理的全局和项目级启用记录。
- 通过 `skill_categories` 管理 Workbench 内分类，Skill 元信息只保存 `category_id`。
- 为每个 Skill 维护一个 Workbench 内分类；缺失分类统一归入“未分类”。
- 在 Skills 列表中通过分类下拉选择已有分类或创建新分类。
- 在分类管理弹窗中新增、重命名、删除迁移和合并分类。
- 按名称或描述搜索 Skills。
- 按分类、启用状态、启用工具和启用项目筛选 Skills。
- 工具筛选同时匹配全局启用和项目级启用。
- 项目筛选只匹配在指定项目下启用过的 Skills。
- 工具和项目组合筛选只匹配在该项目下启用了该工具的 Skills。
- 在 Skills 列表中切换支持的全局工具启用状态。
- 全局工具当前包括 Codex、Claude Code、OpenCode、DevEco Code、Hermes、Kimi Code、Pi Agent、Gemini CLI、Qwen Code、Goose、Kilo Code、Cline、Roo Code、Factory Droid、Amp、Kiro CLI 和 Junie CLI。
- Skills 列表中的全局工具列按用户设置顺序展示前 4 个彩色工具图标，剩余工具通过 `+N` 浮层展示和操作。
- Skills 列表隐藏可见滚动条，并通过收紧列宽和保留操作列空间减少默认窗口下的横向溢出。
- 在 Skill 详情中按项目批量启用或停用支持项目级 Skills 的工具；当前项目级工具为 Codex、Claude Code 和 OpenCode。
- 设置页支持调整全局工具展示顺序。
- 当检测到全局工具目录中的内容冲突时，通过 Skill 级冲突面板选择唯一版本源并统一同步。

## 数据所有权

- 统一 Skills 根目录保存 Skill 内容的唯一真实副本。
- 分类只用于 Workbench 内整理，不改变 Skill 文件目录、工具目录或符号链接结构。
- `未分类` 是系统分类，后端保证存在且不允许删除或重命名。
- 删除或合并分类只迁移该分类下 Skills 的 `category_id`，不删除 Skills。
- 全局启用和项目级启用由 `skill_enablements` 记录；目标目录中的 Workbench 管理链接或副本是派生结果。
- 工具目标由后端固定注册表定义；用户展示顺序保存在 `app_settings.tool_target_order`。
- 设置页打开不存在的工具 Skills 目录时，用户确认后会创建目录并打开。
- 不支持项目级 Skills 的工具只能用于全局启用，后端会拒绝 project scope 启用。
- Workbench 停用或删除 Skill 时，只清理 Workbench 管理的链接或副本，不删除未被 Workbench 管理的外部工具目录内容。

## 同步边界

- 启用 Skill 时使用 Auto 同步：优先创建符号链接；无法创建符号链接时回退为 Copy。
- Copy 副本不会在扫描时自动覆盖。
- 目标目录已有内容且不属于 Workbench 管理时，不自动覆盖；冲突必须由用户选择唯一版本源后解决。
- 解决冲突前，后端会备份被替换版本。

## 验证

- 前端测试覆盖工具筛选、项目筛选、组合筛选、分类选择、新建分类、分类管理和详情区去重。
- 后端 Rust 测试覆盖扫描、导入、启用、停用、冲突检测、备份、删除边界、旧分类迁移和分类管理。
