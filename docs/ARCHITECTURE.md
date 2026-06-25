# Workbench 架构说明

## 1. 架构目标

Workbench 是一个本地优先的桌面应用。第一阶段已经完成项目管理、Skills 管理、资源 Radar 和设置四个基础模块；当前进入进阶开发阶段，在保持本地优先和清晰边界的前提下扩展 Agent 工具、Skills 来源、资源导入和自动化能力。

核心目标：

- 本地数据持久化。
- 单一 Skills 真实来源。
- 清晰的前端页面与本地能力边界。
- 用 Tauri 提供文件系统、符号链接、终端启动等桌面能力。
- 保持实现路径简单，不为历史项目做兼容层。

## 2. 技术栈

### 2.1 桌面框架

- Tauri
- Rust

Tauri 负责应用窗口、系统能力调用和打包。Rust 后端不作为独立服务运行，只通过 Tauri command 暴露本地能力。

### 2.2 前端

- React
- TypeScript
- Vite

前端负责页面状态、表单、列表、筛选、详情面板和基础交互。前端不直接访问文件系统和数据库。

### 2.3 数据存储

- SQLite

SQLite 用于保存项目、Skills 元信息、分类、启用关系、自定义工具目标、资源 Radar 条目和应用设置。

数据库文件放在 Workbench 本地数据根目录：

```text
~/.workbench/workbench.sqlite
```

默认 Skills 唯一真实副本目录为 `~/.workbench/skills`。源码目录只保存代码、文档和静态原型。

### 2.4 本地系统能力

通过 Tauri command 实现：

- 选择目录或文件。
- 打开目录或文件。
- 使用外部工具打开项目目录。
- 扫描 `SKILL.md`。
- 复制导入的 Skill。
- 选择并复制自定义工具图标。
- 创建和移除由 Workbench 管理的符号链接。
- 为项目启用的启动项创建非交互式内嵌启动会话。

启动会话只保留当前运行期间的内存日志，不持久化历史输出，不提供交互式 shell。

## 3. 项目目录结构

当前目录结构：

```text
Workbench/
├─ AGENTS.md
├─ CONTEXT.md
├─ docs/
│  ├─ ai/
│  │  └─ context-map.md
│  ├─ adr/
│  ├─ audits/
│  ├─ capabilities/
│  ├─ plans/
│  ├─ PRD.md
│  └─ ARCHITECTURE.md
├─ UI/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ src/
│  ├─ components/
│  │  └─ dialogs/
│  ├─ lib/
│  │  ├─ api/
│  │  ├─ ui/
│  │  ├─ types/
│  ├─ views/
│  │  ├─ projects/
│  │  ├─ radar/
│  │  ├─ settings/
│  │  └─ skills/
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ styles.css
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ lib.rs
│  │  ├─ projects.rs
│  │  ├─ projects/
│  │  ├─ radar.rs
│  │  ├─ radar/
│  │  ├─ skills.rs
│  │  └─ skills/
│  ├─ tauri.conf.json
│  └─ Cargo.toml
├─ DESIGN.md
├─ design-tokens.json
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

说明：

- `AGENTS.md` 保存项目级 Agent 工作规则。
- `CONTEXT.md` 保存当前阶段、模块状态和重要边界。
- `docs/` 保存产品和架构文档。
- `docs/ai/context-map.md` 保存长期上下文索引。
- `docs/capabilities/`、`docs/audits/`、`docs/adr/` 保存后续可沉淀的能力、审核和架构决策记录。
- `UI/` 保存讨论用静态原型，不作为正式前端代码入口。
- `src/lib/api/` 封装 Tauri `invoke` 调用。
- `src/lib/ui/` 保存跨页面复用的前端 UI 辅助组件和资源映射。
- `src/views/` 保存从 `App.tsx` 拆出的页面级视图模块。
- `src/components/dialogs/` 保存按功能域拆分的项目、设置和 Skills 弹窗。
- `src-tauri/src/projects.rs` 是当前 Project command facade；类型、SQLite、项目打开方式 Profiles 和启动会话进程管理位于 `src-tauri/src/projects/`。
- `src-tauri/src/skills.rs` 是当前 Skills command facade；类型、SQLite、文件系统同步、工具目标、分类、自定义工具、导入、根目录迁移、skills.sh 市场和 CLI 适配位于 `src-tauri/src/skills/`。

## 4. 前端模块说明

### 4.1 App Shell

职责：

- 左侧模块导航。
- 顶部页面标题和主要操作。
- 浅色 / 深色主题切换。
- 右侧工作区布局。
- 应用级数据加载、Tauri 事件订阅、toast、更新提示和弹窗编排。

`src/App.tsx` 不承载各业务视图的具体列表、表单或详情实现；项目、Skills、Radar 和设置视图分别位于 `src/views/<feature>/`，功能弹窗位于 `src/components/dialogs/<feature>/`。`WorkbenchApp` 仍是应用级状态与副作用的所有者，后续如需拆分状态或 hooks 需要单独计划。

当前导航模块：

- 项目
- Skills
- 资源 Radar
- 设置

### 4.2 项目管理模块

职责：

- 展示本地项目列表。
- 添加和编辑项目基本信息。
- 从 GitHub 或 Gitee 仓库导入项目到本地父目录。
- 删除 Workbench 项目记录。
- 通过系统目录选择器选择项目路径和启动工作目录。
- 搜索和按标签筛选项目。
- 查看项目详情。
- 打开项目目录。
- 使用全局项目打开方式 Profiles 打开项目目录。
- 配置一个或多个启动项。
- 通过启动按钮调用 Tauri command，为所有启用启动项创建本次内嵌启动会话。

边界：

- 不提供交互式 shell 输入。
- 不持久化命令输出。
- 只管理当前运行中的启动会话，重复启动会创建新的会话组。
- 删除项目只删除 Workbench SQLite 项目记录，不访问、不移动、不删除项目目录。
- 访问项目目录或启动工作目录时发现路径不存在，前端提示用户是否删除 Workbench 项目记录。
- 远程导入通过无副作用预检查组合判断项目记录和目标目录状态；任何已有本地目录都不会被覆盖。
- 项目打开方式是外部工具入口，不捕获输出，不管理外部进程生命周期。

### 4.3 Skills 管理模块

职责：

- 管理 Workbench Skills 根目录。
- 扫描根目录下的 `SKILL.md`。
- 解析 Skill 名称、描述和路径。
- 展示 Skills 列表。
- 搜索和按分类筛选 Skills。
- 管理 Skill 分类。
- 管理 Skill 的全局工具启用关系。
- 管理 Skill 的项目级工具启用关系。
- 管理自定义 Agent 工具的全局 Skills 目录。
- 通过“同步 Skills”刷新统一根目录，并在用户确认后导入和接管已注册工具全局目录中的既有 Skills。
- 切换统一 Skills 根目录后检查旧根目录迁移和受管启用目标重建。
- 从 ZIP 文件或已解压文件夹导入 Skills。
- 从 `skills.sh` 浏览、安装和卸载 GitHub 来源 Skills。
- 检查并更新由 Workbench 从 `skills.sh` 安装的 Skills。

关键原则：

- Workbench Skills 根目录保存 Skill 唯一真实副本。
- 外部工具目录只作为发现来源和启用目标，不成为真实来源；发现阶段只读，不创建、不复制、不写数据库。
- 用户确认同步外部工具 Skills 后，Workbench 会导入统一根目录并接管对应工具目录目标；接管前备份原工具目录内容，再创建 Workbench 管理的链接或副本。
- 切换统一 Skills 根目录只改变当前真实来源并记录上一个根目录，不自动迁移、不重建、不删除旧目录。
- 旧根目录迁移和受管启用目标重建必须由用户显式触发。
- 全局工具目录和项目工具目录只放由 Workbench 管理的符号链接或复制副本。
- 默认使用 Auto 同步：优先创建符号链接，失败时原子复制。
- 目标位置已有内容且没有对应 Workbench 启用记录时，不覆盖、不删除。
- 停用时依据数据库记录，只移除对应的受管符号链接或完整副本。
- 扫描全局工具目录时识别内容一致状态和内容冲突状态。
- 内容一致状态在扫描时自动登记为 Workbench 管理，不修改文件内容。
- 解决内容冲突必须由用户显式触发。
- 内容冲突按 Skill 统一解决：用户从 `.workbench` 和所有存在版本的全局工具目录中选择一个唯一版本源。
- 解决冲突前必须备份被替换版本，不自动合并目录内容。
- 删除或市场卸载 Skill 只删除统一根目录内容和 Workbench 管理的启用目标，不删除未被 Workbench 管理的工具目录。
- 自定义工具只支持全局 Skills 目录；项目级启用必须由后端拒绝。
- 删除自定义工具只删除 Workbench 配置、排序项和启用记录，不删除外部工具目录。
- `skills.sh` 安装和更新由 Workbench 自行下载 GitHub 仓库内容，不调用 `npx skills` 作为核心路径。
- 从 `skills.sh` 安装或更新后默认不自动启用到任何 Agent 工具目录。
- 非 GitHub 来源的 `skills.sh` 条目暂不支持 Workbench 自管安装。

### 4.4 资源 Radar 模块

职责：

- 本地维护资源条目。
- 添加和编辑条目。
- 删除本地条目。
- 搜索条目。
- 按分类、领域、来源、语言、收藏、来源状态和重复状态筛选。
- 收藏条目。
- 打开条目链接。
- 处理 GitHub Stars 与手动资源的来源合并和重复组。

分类固定为：

- 项目
- 资讯
- 论文
- 其他

边界：

- 支持用户在 Workbench 中手动录入和维护资源。
- 支持通过当前 `gh` CLI 账号手动同步 GitHub Stars。
- 不做趋势统计、后台抓取、定时同步、LLM 总结、评分或推荐。
- 后续优先支持 JSON、Markdown 或 CSV 数据的导入。
- 外部 collector 或 Codex automation 可以把采集结果写入 radar inbox。
- Workbench 负责解析、规范化、去重、入库和展示，不负责采集和调度。

### 4.5 设置模块

职责：

- 查看本地数据库位置。
- 管理 Workbench Skills 根目录。
- 查看支持的工具及其全局 Skills 目录。
- 新增、编辑和删除自定义 Agent 工具。
- 展示 Skills 路径映射关系。
- 管理主题偏好。

## 5. Tauri 后端模块说明

`src-tauri/src/lib.rs` 注册前端唯一可调用的 Tauri commands。

当前已实现的 Skills command 入口位于 `src-tauri/src/skills.rs`，类型、SQLite、文件系统同步、工具目标、分类、自定义工具、导入、根目录迁移、skills.sh 市场和 CLI 适配位于 `src-tauri/src/skills/`：

- 扫描和解析 `SKILL.md`。
- 系统选择器、ZIP / 文件夹导入与冲突检查。
- 已注册工具全局目录只读发现、显式导入、旧根目录迁移检查和受管启用目标重建。
- SQLite 设置、分类和启用关系读写。
- 固定工具目标注册表、目标路径计算和项目级支持守卫。
- 工具目录创建与打开。
- Auto 同步：优先创建受管符号链接，失败时复制完整目录。
- 检测全局工具目录中的内容一致状态和内容冲突。
- 扫描时自动登记内容一致的全局启用，统一解决 Skill 级版本冲突并备份被替换版本。
- 创建、检测和移除受管符号链接或副本。
- 删除统一根目录中的 Skill 并清理对应 Workbench 管理记录。
- `skills.sh` 市场列表、详情、安装、卸载、更新检查、单项更新和批量更新。
- 打开本地文件或目录。

当前 Skills 后端按 command facade、类型、数据库、文件系统同步、工具目标、分类、自定义工具、导入、根目录迁移、受管目标重建、skills.sh 市场和 CLI 适配拆分；启用、冲突、删除和市场 command wrapper 仍由 `src-tauri/src/skills.rs` 承载 command 编排。

## 6. 核心数据模型

以下为逻辑模型，具体 SQL 字段类型可在实现阶段细化。

### 6.1 projects

保存本地项目。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| name | 项目名称 |
| path | 本地项目路径 |
| note | 备注 |
| tags_json | 标签数组 |
| archived | 历史归档字段，当前产品入口不再使用 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- `path` 应唯一。
- 项目启动项保存在 `project_launch_configs`。
- 当前项目列表和 Skills 项目启用列表不再按 `archived` 过滤；删除记录通过删除 `projects` 行完成。

### 6.2 project_launch_configs

保存项目启动项。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| project_id | 所属项目 |
| name | 启动项名称 |
| command | 启动命令 |
| workdir | 启动工作目录 |
| enabled | 是否启用 |
| sort_order | 展示顺序 |

约束：

- 点击项目启动按钮时执行所有启用且配置了命令的启动项。
- 每个启动项在独立内嵌启动会话中执行。

### 6.2.1 project_open_profiles

保存全局项目打开方式 Profiles。所有项目共享这组配置。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| name | 打开方式名称 |
| kind | `app` / `terminal` |
| command | 从 PATH 启动的命令名称 |
| executable_path | 可选可执行文件路径，优先于 `command` |
| args_json | 参数数组，支持 `{projectPath}` 占位符 |
| workdir | 工作目录，默认 `{projectPath}` |
| enabled | 是否在项目列表菜单中显示 |
| sort_order | 展示顺序 |

约束：

- 默认 Profiles 包括 VS Code、Trae、PowerShell 和 Claude Code。
- 当 `executable_path` 有值时优先使用该路径；否则从 PATH 解析 `command`。
- `app` 类型直接启动外部程序。
- `terminal` 类型通过外部终端在项目目录中启动交互式命令。
- 打开方式不写入项目记录，删除 Profile 不影响项目数据。

### 6.3 skill_categories

保存 Workbench 内 Skills 分类实体。分类只用于本地整理，不改变 Skill 文件目录、工具目录或启用记录。

| 字段 | 说明 |
| --- | --- |
| id | 分类 ID，主键 |
| name | 分类名称，唯一 |
| sort_order | 展示顺序 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- `未分类` 是系统分类，后端启动时保证存在。
- `未分类` 不允许删除或重命名。
- 删除或合并分类时，必须把该分类下的 Skills 迁移到另一个分类。

### 6.4 skill_metadata

保存扫描结果之外需要持久化的 Skill 元信息。Skill 名称、描述和路径直接从根目录扫描获得，不重复写入数据库。

| 字段 | 说明 |
| --- | --- |
| directory_name | Skill 目录名，主键 |
| category_id | Skill 所属分类 ID，默认 `uncategorized` |

约束：

- `directory_name` 在统一 Skills 根目录下唯一。
- 每个 Skill 只能属于一个分类。
- 分类展示名来自 `skill_categories.name`，`skill_metadata` 不保存分类名称文本。

### 6.5 工具目标

工具目标由后端内置注册表和 `custom_tool_targets` 表合并得到。内置注册表包含工具 key、展示名、全局 Skills 目录和是否支持项目级 Skills；自定义工具由用户在设置页维护，只支持全局 Skills 目录。

| 工具 | 全局 Skills 目录 | 项目级目录 |
| --- | --- | --- |
| Codex | `~/.codex/skills` | `<project>/.codex/skills` |
| Claude Code | `~/.claude/skills` | `<project>/.claude/skills` |
| OpenCode | `~/.config/opencode/skills` | `<project>/.opencode/skills` |
| DevEco Code | `~/.config/deveco/skills` | 不支持 |
| Hermes | `~/.hermes/skills` | 不支持 |
| Kimi Code | `~/.kimi-code/skills` | 不支持 |
| Pi Agent | `~/.pi/agent/skills` | 不支持 |
| Gemini CLI | `~/.gemini/skills` | 不支持 |
| Qwen Code | `~/.qwen/skills` | 不支持 |
| Goose | `~/.agents/skills` | 不支持 |
| Kilo Code | `~/.kilo/skills` | 不支持 |
| Cline | `~/.cline/skills` | 不支持 |
| Roo Code | `~/.roo/skills` | 不支持 |
| Factory Droid | `~/.factory/skills` | 不支持 |
| Amp | `~/.config/agents/skills` | 不支持 |
| Kiro CLI | `~/.kiro/skills` | 不支持 |
| Junie CLI | `~/.junie/skills` | 不支持 |

项目级启用必须先通过 `supports_project_scope` 守卫。当前只有 Codex、Claude Code 和 OpenCode 支持项目级 Skills；自定义工具固定不支持项目级 Skills。

### 6.5.1 custom_tool_targets

保存用户自定义 Agent 工具目标。自定义工具只作为全局 Skills 目录参与扫描、筛选和启用。

| 字段 | 说明 |
| --- | --- |
| key | 工具唯一标识，不能与内置工具冲突 |
| name | 展示名 |
| global_skills_dir | 全局 Skills 目录 |
| icon_path | Workbench 管理的本地图标路径，可为空 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- 自定义工具 key 使用 slug 格式，并与内置工具 key 共用唯一命名空间。
- 自定义工具 key 是后端内部标识，新增时根据工具名称自动生成；编辑工具名称时不改变 key。
- 自定义工具名称不能与内置工具或其他自定义工具重复。
- 自定义工具图标从用户选择的本地文件复制到 `~/.workbench/tool-icons/`。
- 自定义工具图标通过 Tauri asset protocol 暴露给前端；加载失败时前端回退到字母图标。
- 删除自定义工具会清理 `custom_tool_targets`、`app_settings.tool_target_order` 中的排序项和该工具相关 `skill_enablements`，不删除 `global_skills_dir` 指向的外部目录。

### 6.5.2 skill_sources

保存由 Workbench 管理的远程 Skill 来源记录。当前只写入 `skills_sh` 来源，用于市场状态、更新检查和更新执行。

| 字段 | 说明 |
| --- | --- |
| directory_name | 统一 Skills 根目录下的 Skill 目录名，主键 |
| source | 来源类型，当前为 `skills_sh` |
| package_slug | `skills.sh` 包标识 |
| repo_url | GitHub 仓库 URL |
| skill_path | 仓库内 Skill 目录路径 |
| installed_ref | 安装时使用的远端分支或引用 |
| installed_hash | 安装后本地内容 hash |
| remote_ref | 最近一次检查得到的远端内容 hash |
| last_checked_at | 最近检查时间 |
| installed_at | 安装时间 |
| updated_at | 来源记录更新时间 |

约束：

- `skill_sources` 只描述 Workbench 从市场安装的 Skill，不参与本地 ZIP / 文件夹导入。
- 删除或市场卸载对应 Skill 时必须同步删除 `skill_sources` 记录。
- 更新检查通过重新下载远端 GitHub Skill 并计算内容 hash 判断是否变化。
- 内容 hash 用于本地更新检测，不作为安全校验或可信签名。
- 远端下载设置连接和读取超时，并限制压缩包大小、解压大小和仓库文件数量。
- 更新执行前会把统一根目录中的旧版本备份到 `~/.workbench/backups/skills/market/<timestamp>/<skill>`。
- 更新成功只替换统一 Skills 根目录内容，不自动重同步已启用的 Copy 副本。

### 6.6 skill_enablements

保存 Skill 启用关系。

| 字段 | 说明 |
| --- | --- |
| directory_name | Skill 目录名 |
| tool | 工具标识 |
| scope | global / project |
| project_name | 项目名称，全局启用时为空 |
| project_path | 项目路径，全局启用时为空 |
| link_path | 符号链接目标路径 |
| sync_method | 实际同步方式：symlink / copy |

约束：

- 唯一键为 `directory_name + tool + scope + project_path`。
- Symlink 停用前必须确认目标指向统一根目录对应 Skill。
- Copy 停用时允许删除数据库明确记录的完整目标副本。

### 6.7 radar_items

保存资源 Radar 本地条目。手动资源与 GitHub Stars 共用一张表，外部来源使用 `source + external_id` 唯一标识。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| name | 条目名称 |
| category | 项目 / 资讯 / 论文 / 其他 |
| domain | 单选领域，默认 `未分类` |
| url | 链接 |
| tags_json | 标签数组 |
| note | 备注 |
| favorite | 是否收藏 |
| created_at | 创建时间 |
| updated_at | 更新时间 |
| source | `manual` / `github_star` |
| sources_json | 来源列表，用于表达手动添加和 GitHub Stars 合并来源 |
| external_id | 外部来源稳定标识 |
| source_description | 来源描述快照 |
| source_metadata_json | 语言、Topics、Stars 数量等来源元数据 |
| source_active | 来源当前是否有效 |
| last_synced_at | 最后成功同步时间 |

约束：

- `category` 固定枚举。
- `domain` 不能为空；GitHub Stars 新增条目默认 `未分类`。
- `url` 可为空，但有值时应符合 URL 格式。
- 手动来源资源不允许保存与另一条手动来源资源相同的规范化 URL。

### 6.7.1 radar_duplicate_groups

保存 GitHub Stars 同步时发现的待处理重复组。当前阶段只处理 GitHub Stars 与手动资源之间的重复。

| 字段 | 说明 |
| --- | --- |
| id | 重复组主键 |
| source | 当前为 `github_star` |
| external_id | GitHub `owner/repo` |
| source_description | 来源描述快照 |
| source_metadata_json | 来源元数据快照 |
| candidate_ids_json | 候选资源 ID 列表 |
| status | `open` / `resolved` |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- 同一 `source + external_id` 最多存在一个打开状态重复组。
- 同步再次发现相同重复组时更新候选列表和来源快照。
- 合并成功后重复组标记为 `resolved`。

后续导入能力可以增加 `radar_import_runs` 表记录导入批次，包括来源类型、来源路径、导入数量、跳过数量、冲突数量和导入时间。

### 6.8 app_settings

保存应用设置。

| 字段 | 说明 |
| --- | --- |
| key | 设置键 |
| value | 设置值 |

建议设置项：

- `skills_root`
- `tool_target_order`
- `close_behavior`
- `close_tray_hint_dismissed`
- `project_open_profiles_seeded`

`tool_target_order` 只影响 Skills 表格和设置页中的展示顺序，不改变工具目录路径或启用数据所有权。删除自定义工具时，后端会从该设置中移除对应 key。

`close_behavior` 控制主窗口关闭请求的处理方式，取值为 `exit` 或 `hide_to_tray`。默认值为 `hide_to_tray`。

`close_tray_hint_dismissed` 记录隐藏到托盘首次提示是否已经确认，默认值为 `false`。

## 7. 关键流程

### 7.0 关闭窗口

流程：

1. 前端通过 Tauri window API 监听主窗口关闭请求。
2. 当前 `close_behavior` 为 `exit` 时，前端调用 `exit_app` 命令，后端退出进程。
3. 当前 `close_behavior` 为 `hide_to_tray` 且 `close_tray_hint_dismissed` 为 `false` 时，前端阻止默认关闭并展示一次性托盘提示。
4. 用户确认托盘提示后，前端调用 `set_close_tray_hint_dismissed` 写入设置，再调用 `hide_main_window` 命令隐藏主窗口。
5. 后续关闭窗口时，前端直接调用 `hide_main_window` 命令。
6. 托盘菜单提供“显示 Workbench”和“退出应用”，分别恢复主窗口或退出进程。

边界：

- 最小化按钮保持系统默认行为，不进入托盘。
- 隐藏到托盘不启动后台任务，只保持应用进程和托盘入口。
- 退出应用是显式进程退出，不保留窗口恢复状态。

### 7.1 保存项目

流程：

1. 用户在项目弹窗中新增或编辑项目。
2. 前端调用 `save_project(project)`。
3. 后端校验项目 ID、名称和路径不为空。
4. 后端写入 SQLite `projects` 表。
5. 后端返回更新后的项目列表。
6. 前端刷新列表并选中保存后的项目。

边界：

- 删除项目只删除 Workbench 记录和关联启动项，不删除本地项目目录。
- 当前不校验项目路径必须存在；启动时再校验启动工作目录。

### 7.1.1 远程导入项目

流程：

1. 用户填写 GitHub/Gitee 仓库地址并选择本地父目录。
2. 前端调用 `inspect_remote_project_import(request)`，后端解析目标路径并检查 Workbench 记录和本地目录。
3. 记录和目录都不存在时，前端调用 `import_remote_project(request)` 正常 clone。
4. 记录和目录都存在时，不执行 clone，前端允许用户定位已有项目。
5. 记录存在但目录缺失时，用户确认重新导入；后端验证 `replace_project_id` 与原记录一致，clone 成功后保留原项目记录和启动配置。
6. 记录不存在但目录存在时，不执行 clone，要求用户选择其他父目录。
7. clone 失败时只清理本次创建的目标目录，前端将进度状态切换为失败并显示错误。

边界：

- 不覆盖、接管或删除已有本地目录。
- 预检查无文件系统写入；执行导入时再次检查目标目录，避免检查后的状态变化。
- 远程 URL 不持久化，导入成功后的项目与本地项目没有生命周期差异。

### 7.1.2 删除项目记录

流程：

1. 用户在项目列表或详情中点击删除项目记录。
2. 前端先检查当前内存中的启动会话；项目仍有运行中会话时拒绝删除。
3. 前端显示删除确认，说明只删除 Workbench 记录，不删除本地文件。
4. 后端删除 SQLite `projects` 行；关联启动项通过外键级联删除。
5. 项目列表刷新并选择剩余第一项。

路径缺失触发：

1. 用户打开项目目录、使用外部工具打开项目或启动项目。
2. 后端返回项目路径或启动工作目录不存在。
3. 前端显示同一删除确认，说明路径可能已被移动或删除。
4. 用户确认后删除 Workbench 项目记录；取消则保留记录。

边界：

- 不删除、移动或修改本地项目目录。
- 不修改项目内代码、配置或 Git 状态。

### 7.2 启动项目

流程：

1. 前端点击项目启动按钮。
2. 前端调用 `launch_project(name, launch_configs)`。
3. 后端筛选所有启用且配置了命令的启动项。
4. 后端校验每个启动项的工作目录存在且是文件夹。
5. 后端为每个启动项创建受管理子进程，并捕获 stdout / stderr。
6. 后端返回本次启动会话组，并通过 Tauri event 推送输出和状态更新。

边界：

- 项目详情面板只展示本次启动摘要和日志入口，完整内存日志在项目模块内的启动日志详情页展示。
- 启动日志详情页由前端当前 `LaunchRun` 状态渲染，支持“全部”和单个启动项输出视图。
- 后端在当前应用进程内维护启动会话内存快照，日志详情页可通过只读命令同步当前输出；快照不落盘，应用重启后清空。
- 不保存历史日志。
- 只追踪当前运行中的启动会话。
- 启动参数由当前项目记录传入。
- 当前不单独启动某一个启动项；项目启动主操作执行所有启用启动项。单独启动可作为后续项目工作台能力。

### 7.2.1 用外部工具打开项目

流程：

1. 前端点击项目行中的“用工具打开”菜单。
2. 前端列出所有启用的项目打开方式 Profiles。
3. 用户选择一个 Profile。
4. 前端调用 `open_project_with_profile(projectPath, profile)`。
5. 后端校验项目路径存在且是文件夹。
6. 后端校验 Profile 已启用，并且配置了 `command` 或 `executable_path`。
7. 后端展开 `{projectPath}` 占位符。
8. `app` 类型直接启动外部程序。
9. `terminal` 类型优先通过 Windows Terminal 打开；不可用时回退 PowerShell。

边界：

- 不捕获外部工具 stdout / stderr。
- 不持久化外部工具运行状态。
- 不自动安装工具，不修改 PATH。
- PATH 缺失、可执行文件路径不存在、项目路径不存在和启动失败必须返回清楚错误。
- Claude Code 等交互式 CLI 不进入项目启动日志。

### 7.3 扫描 Skills 根目录

流程：

1. 用户配置 Workbench Skills 根目录。
2. 前端调用 `scan_skills()`。
3. 后端检查根目录各直接子目录中的 `SKILL.md`。
4. 后端解析 frontmatter 中的 `name` 和 `description`。
5. 后端从 `skill_metadata.category_id` 和 `skill_categories` 补齐分类 ID、分类展示名和分类列表。
6. 前端刷新 Skills 列表和分类筛选项。

### 7.4 启用 Skill

流程：

1. 用户选择 Skill、工具和启用范围。
2. 前端调用 `enable_skill(...)`。
3. 后端计算目标路径。
4. 后端检查目标路径。
5. 若目标不存在，优先创建符号链接；失败时原子复制，并记录实际同步方式。
6. 若目标已存在且非 Workbench 管理，返回冲突，不覆盖目标内容。
7. 若工具是自定义工具且启用范围为项目级，后端拒绝请求。

### 7.5 停用 Skill

流程：

1. 用户关闭启用开关。
2. 前端调用 `disable_skill(enablement_id)`。
3. 后端读取 Workbench 记录的实际同步方式和目标路径。
4. 后端移除受管符号链接或完整副本。
5. 后端更新启用关系状态。

### 7.6 导入 Skills

流程：

1. 用户点击导入，选择 ZIP 文件或已解压文件夹。
2. 前端调用系统文件选择器或文件夹选择器。
3. 后端扫描来源中所有包含 `SKILL.md` 的目录。
4. 后端将所有可导入目录复制到统一 Skills 根目录。
5. 同名目录不覆盖、不合并，返回跳过结果。
6. 导入完成后默认不启用。

### 7.6.1 同步外部工具目录 Skills

流程：

1. 用户在 Skills 页面点击“同步 Skills”。
2. 前端按钮进入 loading；后端先刷新当前统一 Skills 根目录，再只读扫描已注册工具的全局 Skills 目录，包括内置工具和自定义工具。
3. 后端只检查一级子目录中的 `SKILL.md`，不递归扫描项目级目录或嵌套仓库内容；耗时文件系统工作放到后台执行，避免窗口无响应。
4. 后端按 Skill 目录名合并多个工具来源；同名相同内容计入无待处理汇总，同名不同内容显示冲突。
5. 如果没有新增、冲突、不可用或不可读项，前端只显示 toast，不打开同步弹窗。
6. 同步弹窗按 `新增 / 冲突 / 已存在 / 不可用` 分 Tab 展示候选；新增项默认可导入并接管，冲突项必须选择保留 Workbench 或使用外部版本，已存在和不可用项只读。
7. 用户确认可执行项后，后端复制选定来源到当前统一 Skills 根目录，并接管对应工具目录目标。
8. 接管前必须备份工具目录原目标；接管后目标变为 Workbench 管理的链接或副本，并写入启用记录。

边界：

- 发现过程不创建目录、不复制文件、不写数据库。
- 当前统一根目录已存在同名相同内容时不接管、不修改工具目录；若提交时重新发现同名相同内容，后端返回跳过而不是失败。
- 当前统一根目录已存在同名不同内容时返回冲突，不覆盖；若提交时状态变化为同名不同内容，用户需重新扫描后选择版本来源。
- 自定义工具路径与当前统一根目录相同时跳过，避免把真实来源当成外部来源。

### 7.6.2 切换根目录、迁移和重建

流程：

1. 用户在设置页修改统一 Skills 根目录。
2. 前端弹出确认，说明切换不会自动迁移旧目录内容或重建工具目录链接。
3. 后端创建新根目录并记录上一个统一根目录，然后只切换当前真实来源。
4. 用户可在设置页检查旧根目录迁移状态。
5. 用户显式迁移时，后端从旧根目录复制选中 Skills 到当前根目录；同名相同内容跳过，同名不同内容返回冲突。
6. 用户可检查仍指向旧根目录的 Workbench 受管启用目标。
7. 用户显式重建时，后端只处理 `skill_enablements` 中记录的受管目标；符号链接会删除旧受管链接并重新指向当前根目录，Copy 副本只在能证明仍是受管副本时重建。

边界：

- 切换根目录不删除旧根目录。
- 符号链接不会自动随根目录设置变化，必须显式重建。
- Copy 副本不会自动随根目录设置变化；已被用户修改或无法证明受管的目标返回冲突。
- 未受管工具目录内容永不覆盖。

### 7.6.3 从 skills.sh 安装、卸载和更新 Skills

安装流程：

1. 用户在 Skills 模块切换到 `技能市场`。
2. 前端优先复用当前应用进程内的市场列表缓存；首次进入、手动刷新或安装完成后调用 `list_skill_market` 获取最新条目，并调用 `get_skill_market_detail` 查看详情。
3. 用户点击安装时，前端调用异步 `install_skill_from_market`，后端在 blocking worker 中下载对应 GitHub 仓库内容，定位包含 `SKILL.md` 的 Skill 目录。
4. 后端通过 `skill-install-progress` 事件回传阶段进度；前端用百分比展示安装反馈。
5. 后端将 Skill 复制到统一 Skills 根目录，同名目录已存在时失败并提示。
6. 后端写入 `skill_sources` 来源记录。
7. 前端刷新本地 Skills 状态；安装后的 Skill 默认不启用到任何 Agent 工具目录。

卸载流程：

1. 用户在市场列表已安装条目的操作列点击“卸载”。
2. 前端展示删除确认弹窗。
3. 后端复用统一 Skill 删除流程，删除统一根目录中的源 Skill、清理 Workbench 管理的启用副本或符号链接。
4. 后端删除该 Skill 的 `skill_sources` 来源记录。
5. 前端刷新本地 Skills、市场状态和更新列表。

更新流程：

1. 用户切换到 `更新` 子视图。
2. 前端调用 `list_skill_updates` 展示已记录的 `skills.sh` 来源 Skill。
3. 用户点击检查全部时，后端重新下载远端 Skill 并计算内容 hash。
4. hash 不一致时标记为可更新。
5. 前端只允许勾选状态为可更新的条目；已是最新、检查失败和更新执行中的条目不可勾选。
6. 用户可执行单项更新、选中批量更新或更新全部可更新项。
6. 每个更新项替换前先备份统一根目录旧版本；单项失败会返回该项错误并继续处理其他项。
7. 更新完成后刷新本地 Skills 状态和来源记录。

前端市场缓存只在当前应用进程内有效，不写入 SQLite 或磁盘；“刷新市场”始终绕过缓存。安装百分比由后端阶段事件驱动，只表达流程阶段，不代表已下载字节比例。

### 7.7 管理 Skill 分类

流程：

1. 用户在 Skills 页面点击“管理分类”，或在行内分类下拉中选择“新建分类”。
2. 新增分类时，后端写入 `skill_categories`；行内新建会继续把当前 Skill 归入新分类。
3. 重命名分类时，后端只更新 `skill_categories.name`，相关 Skills 的展示名通过 join 自动变化。
4. 删除分类时，用户必须选择迁移目标；后端把源分类下的 `skill_metadata.category_id` 改为目标分类后删除源分类。
5. 合并分类等价于迁移源分类下所有 Skills 到目标分类，然后删除源分类。
6. `未分类` 由后端保证存在，不允许删除或重命名。
7. 分类管理不改动 Skill 文件、全局工具目录、项目工具目录或启用记录。

### 7.8 全局启用状态扫描和冲突解决

流程：

1. 用户扫描 Skills。
2. 后端对每个 Skill 检查内置工具和自定义工具的全局目标目录。
3. 若目标不存在，状态为未启用。
4. 若目标由 Workbench 数据库记录管理，状态为 Workbench 管理。
5. 若目标存在但未被 Workbench 记录管理，后端比较目标目录和统一根目录中的 Skill 内容。
6. 内容一致时，后端自动登记为 Workbench 管理，不修改目标文件。
7. 内容不一致时，状态为冲突，前端展示 Skill 级冲突面板。
8. 用户从 `.workbench` 和所有存在版本的全局工具目录中选择一个唯一版本源。
9. 后端将被替换版本备份到 `~/.workbench/backups/skills/<timestamp>/<tool>/<skill>`。
10. 选中的版本写入 Workbench 根目录，已存在的全局工具目录统一重新同步。
11. 冲突解决不自动合并文件。

### 7.9 管理自定义工具

流程：

1. 用户在设置页点击添加或编辑自定义工具。
2. 前端收集工具名称、全局 Skills 目录和可选图标文件；用户界面不展示内部 key。
3. 后端校验名称和目录；新增时根据名称生成唯一内部 key，编辑时保留原 key。
4. 用户选择图标时，后端将图标复制到 `~/.workbench/tool-icons/` 并保存 `icon_path`。
5. 后端写入 `custom_tool_targets`，并返回合并后的 Skills 状态。
6. 删除自定义工具时，后端删除 Workbench 配置、排序项和该工具相关启用记录，不删除外部工具目录。

### 7.10 删除 Skill

流程：

1. 用户在 Skills 表格操作列点击删除图标，或在技能市场已安装条目操作列点击“卸载”。
2. 前端展示删除确认弹窗。
3. 后端读取该 Skill 的 Workbench 管理启用记录。
4. 后端移除仍然有效的受管符号链接或完整副本。
5. 后端删除该 Skill 的分类元信息、启用记录和市场来源记录。
6. 后端删除统一根目录中的 Skill。
7. 未被 Workbench 管理的外部工具目录内容保持不变。

### 7.11 管理资源 Radar

流程：

1. 用户新增或编辑条目。
2. 前端调用 Radar command。
3. 后端校验分类和 URL。
4. 后端写入 SQLite。
5. 前端刷新列表和详情。

删除条目、切换收藏状态也通过 Radar command 更新 SQLite，并返回最新条目列表。

### 7.11 同步 GitHub Stars

流程：

1. 用户点击同步 GitHub Stars。
2. 后端通过 `gh api user/starred --paginate` 完整获取当前账号 Stars。
3. 后端解析全部结果后，在一个事务中先按 `source + external_id` 查找已有 GitHub 来源资源。
4. 已有 GitHub 来源资源只更新来源字段，不覆盖用户维护的分类、领域、标签、备注和收藏状态。
5. 没有已有 GitHub 来源资源时，按规范化 GitHub repo URL 查找手动资源。
6. URL 唯一匹配一条手动资源时，将 GitHub 来源挂到该资源，并保留手动资源的分类、领域、标签、备注和收藏状态。
7. URL 匹配多条手动资源时，创建或更新 `radar_duplicate_groups`，不自动选择主资源。
8. 没有 URL 匹配时，创建新的 GitHub Stars 资源，分类为 `项目`，领域为 `未分类`。
9. 本次结果中缺失的已有 GitHub Star 标记为来源失效，不删除本地资源。
10. 前端展示新增、更新、失效和未变化数量。

### 7.12 合并 Radar 重复组

流程：

1. 前端读取打开状态重复组并展示候选资源。
2. 用户选择一个候选资源作为主资源。
3. 后端校验主资源属于重复组候选列表。
4. 后端合并来源列表、用户标签、备注和收藏状态。
5. 主资源保留自己的分类和领域。
6. GitHub 来源描述、元数据、`source + external_id` 写入主资源。
7. 副资源删除，重复组标记为 `resolved`。

边界：

- 名称相似但 URL 不同不自动合并。
- 同步阶段不删除手动资源。
- 删除副资源只发生在用户明确合并重复组之后。

边界：

- Workbench 不负责后台抓取或定时任务调度。
- Workbench 不保存 GitHub Token，依赖用户现有 `gh` CLI 认证。
- Workbench 不调用 LLM 做内容总结、分类或评分。

## 8. 错误处理原则

- 文件系统操作失败时返回结构化错误，不吞掉异常。
- Skills 目标冲突必须显式提示用户。
- 导入同名 Skill 时不覆盖、不合并。
- 全局工具目录同名 Skill 内容冲突不自动合并，替换前必须备份。
- 删除 Skill 不删除未被 Workbench 管理的工具目录内容。
- 任一启用启动项的工作目录不存在时禁止启动。
- 数据库迁移失败时阻止应用继续进入主界面。

## 9. 测试策略

### 9.1 Rust 后端

重点测试：

- `SKILL.md` 扫描和解析。
- ZIP / 文件夹导入冲突处理。
- Auto 同步创建、停用和冲突判断。
- 全局工具目录同名 Skill 状态检测。
- Skill 级冲突解决备份和统一替换。
- 删除 Skill 时清理受管目标和数据库记录。
- 项目启动项参数校验。
- SQLite repository 增删改查。

### 9.2 前端

重点测试：

- 页面导航。
- 项目新增和编辑表单。
- 项目删除确认和路径缺失清理提示。
- Skills 分类和启用状态展示。
- 导入弹窗流程。
- 资源 Radar 搜索、类型/领域/来源/语言/来源状态/重复状态筛选、重复组合并和 GitHub Stars 同步。
- 主题切换。

### 9.3 手动验证

关键手动验证：

- Windows 下打开目录。
- Windows 下新终端执行所有启用启动项。
- Windows 下 Auto 同步优先创建目录符号链接，权限不足时复制。
- 目标路径存在时不会覆盖用户文件。

### 9.4 统一验证入口

提交前运行：

```bash
pnpm verify
pnpm tauri:verify-build
```

`pnpm verify` 依次执行前端生产构建、前端交互测试、Rust 格式检查、Rust 测试和 Clippy。`pnpm tauri:verify-build` 验证 Release 桌面应用构建。

## 10. 后续扩展边界

以下内容属于进阶开发候选，进入实现前需要计划、数据模型和验证边界：

- 交互式终端、持久化启动日志和复杂进程编排。
- Agent 配置、prompts、MCP 和规则文件管理。
- Skills 在线安装和远程仓库同步。
- 资源 Radar 的其他导入式数据源和 radar inbox。
- 外部 collector 或 Codex automation 数据采集。
- Obsidian 知识库连接。
- 自动化任务入口。
