---
artifact_type: capability
status: current
created: 2026-06-17
updated: 2026-06-20
source_of_truth: src-tauri/src/skills.rs
adr: none
---

# Skills 管理

Skills 管理模块使用统一 Skills 根目录作为本地 Skill 内容的真实来源，并通过 Workbench SQLite 记录分类、全局启用、项目级启用、同步方式和冲突状态。前端入口位于 `src/App.tsx`，后端 source of truth 为 `src-tauri/src/skills.rs`。

## 当前能力

- 扫描统一 Skills 根目录中包含 `SKILL.md` 的 Skill。
- 从 ZIP 文件或已解压文件夹导入一个或多个 Skills。
- 从 `skills.sh` 技能市场浏览、搜索、查看详情、安装和卸载 GitHub 来源 Skills。
- 在 `更新` 子视图检查和更新由 Workbench 从 `skills.sh` 安装的 Skills。
- 支持 `skills.sh` 来源 Skill 的单项更新、选中批量更新和更新全部可更新项。
- 更新页复选框只对状态为可更新的 Skill 启用；已是最新、检查失败或更新执行中的条目保持禁用，避免批量更新误选不可执行项。
- 市场页支持按状态筛选，并统计全部、已安装、未安装、可更新、不支持和当前结果数量。
- 市场列表在当前应用进程内缓存，手动刷新会绕过缓存，安装完成后会清除缓存并刷新本地状态；安装任务完成后返回市场页会重新加载列表以同步已安装状态。
- 市场初次加载使用列表与详情骨架屏，加载失败时展示错误和重试入口。
- 市场安装使用后端阶段事件反馈百分比进度，同一时间只允许执行一个市场安装操作；安装过程中切换 Skills 子视图或离开 Skills 主页面再返回时，会恢复显示当前安装进度或最终结果。
- 市场状态使用语义图标标签，“已安装”和“不支持”只展示状态，不作为可点击安装按钮；已安装条目的操作列提供“卸载”动作。
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
- 设置页支持新增、编辑和删除自定义 Agent 工具；自定义工具只提供全局 Skills 目录，不支持项目级启用。
- 自定义工具图标由用户选择本地文件，保存到 `~/.workbench/tool-icons/` 后由 Workbench 管理。
- 自定义工具新增时由后端根据工具名称生成内部 key；用户界面不展示或要求填写该内部标识。
- 自定义工具名称不能与内置工具或其他自定义工具重复；表单错误在弹窗内展示。
- 设置页“支持的工具目录”展示工具图标、内置/自定义类型、路径、排序、打开目录和可用状态。
- Skills 列表中的全局工具列按用户设置顺序展示前 4 个彩色工具图标，剩余工具通过 `+N` 浮层展示和操作。
- Skills 列表隐藏可见滚动条，并通过收紧列宽和保留操作列空间减少默认窗口下的横向溢出。
- 在 Skill 详情中按项目批量启用或停用支持项目级 Skills 的工具；当前项目级工具为 Codex、Claude Code 和 OpenCode。
- 设置页支持调整全局工具展示顺序。
- 当检测到全局工具目录中的内容冲突时，通过 Skill 级冲突面板选择唯一版本源并统一同步。

## 数据所有权

- 统一 Skills 根目录保存 Skill 内容的唯一真实副本。
- `skills.sh` 是当前唯一接入的在线来源；市场安装和更新由 Workbench 自行下载 GitHub 仓库内容，不调用 `npx skills` 作为核心路径。
- `skill_sources` 记录由 Workbench 从 `skills.sh` 安装的 Skill 来源元数据，用于更新检查和更新执行。
- 卸载或删除由 `skills.sh` 安装的 Skill 时，同步清理对应 `skill_sources` 记录，避免市场和更新页保留幽灵来源状态。
- 非 GitHub 来源的 `skills.sh` 条目暂不支持 Workbench 自管安装。
- 市场安装后的 Skill 默认不启用到任何 Agent 工具目录。
- 市场详情中的安装入口只保留在列表操作列；右侧详情用于展示来源、状态、安全提示和 `SKILL.md` 预览。
- 市场安装和更新只接受单层 Skill 目录名，拒绝绝对路径、父目录和嵌套路径后再访问统一 Skills 根目录。
- 市场下载设置连接和读取超时，并限制 100 MiB 压缩包、500 MiB 解压规模和仓库文件数量。
- 分类只用于 Workbench 内整理，不改变 Skill 文件目录、工具目录或符号链接结构。
- `未分类` 是系统分类，后端保证存在且不允许删除或重命名。
- 删除或合并分类只迁移该分类下 Skills 的 `category_id`，不删除 Skills。
- 全局启用和项目级启用由 `skill_enablements` 记录；目标目录中的 Workbench 管理链接或副本是派生结果。
- 工具目标由后端内置注册表和 `custom_tool_targets` 自定义表合并得到；用户展示顺序保存在 `app_settings.tool_target_order`。
- 自定义工具 key 是后端内部标识，新增时自动生成，编辑名称时保持不变。
- 设置页打开不存在的工具 Skills 目录时，用户确认后会创建目录并打开。
- 不支持项目级 Skills 的工具只能用于全局启用，后端会拒绝 project scope 启用。
- 删除自定义工具只删除 Workbench 配置、展示排序和该工具相关启用记录，不删除外部工具目录。
- Workbench 停用、删除或市场卸载 Skill 时，只清理 Workbench 管理的链接或副本，不删除未被 Workbench 管理的外部工具目录内容。

## 同步边界

- 启用 Skill 时使用 Auto 同步：优先创建符号链接；无法创建符号链接时回退为 Copy。
- Copy 副本不会在扫描时自动覆盖。
- 目标目录已有内容且不属于 Workbench 管理时，不自动覆盖；冲突必须由用户选择唯一版本源后解决。
- 解决冲突前，后端会备份被替换版本。
- `skills.sh` 更新检查通过重新下载远端 GitHub Skill 并计算内容 hash 判断是否变化；该 hash 只用于本地更新检测，不是安全签名。
- `skills.sh` 更新执行前会备份统一根目录中的旧版本。
- `skills.sh` 更新只替换统一 Skills 根目录内容，不自动重同步已启用的 Copy 副本。
- 批量更新按项执行并返回逐项结果，单项失败不会中断后续项。
- 批量更新目标来自用户勾选的可更新项；不可更新项不会进入批量更新目标集合。
- `SKILL.md` 预览会移除从 `skills.sh` 页面数据带入的 Next.js 内部占位标记。

## 验证

- 前端测试覆盖工具筛选、项目筛选、组合筛选、分类选择、新建分类、分类管理、详情区去重、自定义工具设置入口、自定义工具表单校验、市场骨架 Loading、市场安装入口、市场安装进度跨子视图和主导航恢复、市场卸载入口和 `skills.sh` 来源选中批量更新。
- 后端 Rust 测试覆盖扫描、导入、启用、停用、冲突检测、备份、删除边界、旧分类迁移、分类管理、自定义工具排序合并、自动 key 生成、名称唯一性、`skills.sh` 市场数据解析、来源记录持久化、市场卸载来源记录清理和市场 Skill 目录名校验。
