---
artifact_type: reference
status: current
created: 2026-06-18
updated: 2026-06-18
source_project: E:\Development\12-工具-Utility\Agent\skills-manager
source_of_truth: reference project source inspection
---

# Skills Manager 工程借鉴

本文记录 `skills-manager` 对 Workbench 进阶开发有参考价值的工程经验。它不是实现计划，也不是 Workbench 当前能力事实；后续真正改造前仍需通过 `docs/plans/` 写清目标、边界和验证。

## 适用前提

Workbench 已完成第一阶段基础能力验证，后续扩展会增加 Skills、项目、Radar、Agent 工具、外部来源和自动化入口的复杂度。当前原则仍然是本地优先、简单优先、单一实现、不合并参考项目代码。

因此，借鉴目标是学习边界划分、安全策略、测试维度和可复用工程底座，而不是搬运 `skills-manager` 的完整功能或代码结构。

## 1. 业务 core 与 Tauri commands 分离

`skills-manager` 将可复用业务能力放在 `src-tauri/src/core/`，Tauri commands 只做外部调用边界。核心模块包括：

- `central_repo`：中央 Skills 仓库路径和目录约定。
- `installer`：本地、归档、Git 和远端来源的安装流程。
- `scanner`：工具目录和本地 Skills 发现。
- `sync_engine`：Symlink、junction、copy 和目标移除。
- `skill_store`：SQLite 数据访问和设置持久化。
- `tool_adapters`：不同 Agent/工具的路径和能力描述。
- `path_guard`：路径安全和名称清洗。
- `file_watcher`、`audit_log`：文件变更刷新和操作记录。

Workbench 当前 `src-tauri/src/skills.rs` 仍然集中承载扫描、导入、SQLite、同步、冲突和删除逻辑。第一阶段这是合理选择；进入进阶开发后，应优先把高风险、可单测、会被多入口复用的能力拆成小模块。

建议拆分顺序：

1. `skills/sync.rs`：创建、检测、移除 Workbench 管理目标。
2. `skills/importer.rs`：ZIP、文件夹、Git 和 URL 导入。
3. `skills/tool_targets.rs`：Codex、Claude Code、OpenCode 和自定义工具的路径与能力。
4. `skills/store.rs`：Skills 设置、分类、启用关系、来源元数据和冲突状态的 SQLite 读写。
5. `skills/scanner.rs`：统一根目录、全局工具目录、项目工具目录扫描。

拆分要求：

- 每次只迁移一类职责。
- 不改变前端 API 语义。
- 迁移前后运行 `pnpm verify`。
- 新模块必须保留或增加原有边界测试。

## 2. Tool Adapter 模型

`skills-manager` 使用 `ToolAdapter` 表达不同工具的差异，包括：

- 工具 key 和展示名。
- 全局 skills 目录。
- 安装探测目录。
- 额外扫描目录。
- 项目级 skills 相对目录。
- 用户自定义路径。
- 是否递归扫描。

Workbench 当前只支持 Codex、Claude Code、OpenCode，但已经同时存在全局启用和项目级启用。继续增加工具、自定义路径、项目级差异和诊断能力时，不应在业务流程里追加散落的 `match` 或 `if tool == ...`。

建议引入轻量 `ToolTarget`/`ToolAdapter`：

- 作为工具路径和能力的唯一来源。
- 前端显示、扫描、同步、冲突检测共用同一份定义。
- 支持项目级路径与全局路径不同的工具。
- 内置工具和自定义工具走同一套能力描述。
- 新增 Agent 时先验证路径、项目级目录和扫描规则。

## 3. 同步引擎的安全边界

`skills-manager` 的 `sync_engine` 对 Workbench 最有直接参考价值。关键做法：

- 复制前拒绝目标目录位于源目录内部，避免递归复制无限嵌套。
- Windows 下优先目录 symlink；失败后尝试 junction；再失败才 copy。
- Copy 模式记录源内容 hash，用于判断目标是否需要重新同步。
- 移除目标时区分文件、目录、符号链接、Windows junction 和 dangling link。
- 同步状态判断集中在一个函数内，避免 UI、扫描和删除流程各写一套判断。

Workbench 后续优化同步时，应补齐以下测试维度：

- 目标等于源目录时拒绝。
- 目标位于源目录内部时拒绝。
- 目标为普通目录、普通文件、symlink、junction、dangling symlink 时移除行为正确。
- Copy 副本被用户删除后，即使记录中 hash 一致，也必须能重新同步。
- 目标已有非 Workbench 管理内容时不覆盖。

## 4. 导入流程的安全边界

`skills-manager` 的 `installer` 对归档导入做了几类保护：

- ZIP 解压使用安全路径，跳过绝对路径和包含 `..` 的条目。
- 复制 skill 目录时跳过 `.git`、`.DS_Store` 和 symlink。
- 导入前先解析并清洗目录名。
- 目标同名冲突时不覆盖。
- 临时目录 staging 成功后再落到最终目录。

Workbench 已支持 ZIP 和文件夹导入。进阶开发如果增加 Git、URL、Marketplace 或外部 collector 来源，也应复用同一套安全边界：

- ZIP Slip 防护。
- symlink 跳过，避免把 Skill 外部文件复制进统一根目录。
- 多 Skill 扫描时一个失败不应静默影响其它结果。
- 同名冲突必须显式返回给用户。
- 导入后的 Skill 默认不启用，除非用户在导入流程中明确选择同步目标。
- 远端来源必须记录 source metadata，方便更新、诊断和回滚。

## 5. SQLite 运行策略

`skills-manager` 的 SQLite store 使用：

- `PRAGMA journal_mode=WAL`
- `PRAGMA foreign_keys=ON`
- `busy_timeout`
- schema migration 版本检查
- 对敏感设置加密保存

Workbench 作为本地桌面应用，后续如果加入文件监听、外部 CLI、批量操作、远端来源、后台刷新或自动化任务，建议优先采用：

- WAL：降低读写互相阻塞。
- foreign keys：减少孤儿启用记录、孤儿来源记录。
- busy timeout：避免短时间并发写入直接失败。
- 显式 migration：让数据库演进可验证。
- 敏感设置加密：保存 token、代理凭据、远程仓库 URL、API key 或同步认证信息前必须考虑。

## 6. CLI 与自动化复用 core

`skills-manager` 有 `skills-manager-cli`，桌面 app 和 CLI 复用同一套 Rust core。Workbench 目前没有 CLI 入口，但后续 Codex automation、资源导入、环境诊断或批处理任务可能会需要无 UI 调用。

建议保留这个方向：

- 不为了 CLI 提前设计复杂接口，但业务逻辑应尽量保持可复用。
- 新增业务逻辑时避免写死在 Tauri command 函数体内。
- 能用纯 Rust 函数表达的业务规则，优先放到可单测模块。
- 命令式入口、自动化入口和 UI 入口共享同一套 core，避免行为分叉。

## 7. 文件变更与操作记录

`skills-manager` 有文件 watcher 和 audit log，用于刷新 UI 状态和导出问题报告。

Workbench 进阶开发可以分阶段借鉴：

- 显式刷新按钮或页面进入时刷新。
- 统一操作日志，用于导入、删除、启用、冲突解决、更新、同步和启动会话。
- 导出诊断包，包含近期日志、版本、配置摘要和脱敏路径。
- 文件 watcher 进入实现前需要明确刷新范围、去抖策略和与 SQLite 写入的并发关系。

## 8. 需要单独计划的工程复杂度

以下内容不是禁止项，但需要单独计划，因为它们会扩大测试面、数据模型和失败恢复成本：

- Git 来源安装和更新检查。
- Marketplace API 和 AI search。
- 托盘菜单中的快速操作。
- 大量 Agent 的完整适配表。
- Git 备份和版本恢复。
- 多设备同步。

这些能力可以进入进阶路线图，但不能作为“顺手改造”混入其它任务。只有当对应功能进入明确计划时，再按 Workbench 自己的数据所有权、安全边界和验证方式实现。

## 后续实施建议

近期最有性价比的工程优化是：

1. 为 Skills 同步逻辑提取 `sync` 模块。
2. 为工具路径提取 `tool_targets` 模块。
3. 为 ZIP/文件夹导入补齐安全测试，并为远端来源预留 source metadata。
4. 为 SQLite 初始化补 WAL、foreign keys 和 busy timeout。
5. 为操作日志设计最小表结构和导出格式。

这些优化属于工程稳固，适合在扩展在线来源、批量操作、自定义工具和自动化入口前先做。
