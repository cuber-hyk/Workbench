# Workbench App 架构说明

## 1. 架构目标

Workbench App 是一个本地优先的桌面应用。MVP 只围绕项目管理、Skills 管理、AI Radar 和设置四个模块设计，不引入独立 HTTP 后端、插件系统、在线市场或云同步。

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

SQLite 用于保存项目、Skills 元信息、分类、启用关系、AI Radar 条目和应用设置。

数据库文件放在系统 app data 目录，例如：

```text
AppData/Roaming/workbench-app/workbench.sqlite
```

源码目录只保存代码、文档和静态原型。

### 2.4 本地系统能力

通过 Tauri command 实现：

- 选择目录或文件。
- 打开目录或文件。
- 扫描 `SKILL.md`。
- 复制导入的 Skill。
- 创建和移除由 Workbench 管理的符号链接。
- 在新的系统终端窗口中执行项目启动命令。

MVP 不内嵌终端，不捕获项目启动日志，不管理已启动进程。

## 3. 项目目录结构

建议目录结构：

```text
Workbench/
├─ docs/
│  ├─ PRD.md
│  └─ ARCHITECTURE.md
├─ UI/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ routes.tsx
│  │  └─ providers.tsx
│  ├─ components/
│  │  ├─ layout/
│  │  ├─ ui/
│  │  └─ shared/
│  ├─ features/
│  │  ├─ projects/
│  │  ├─ skills/
│  │  ├─ radar/
│  │  └─ settings/
│  ├─ lib/
│  │  ├─ api/
│  │  ├─ types/
│  │  └─ utils/
│  ├─ main.tsx
│  └─ index.css
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ commands/
│  │  ├─ db/
│  │  ├─ services/
│  │  ├─ models/
│  │  └─ platform/
│  ├─ tauri.conf.json
│  └─ Cargo.toml
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

说明：

- `docs/` 保存产品和架构文档。
- `UI/` 保存讨论用静态原型，不作为正式前端代码入口。
- `src/features/` 按业务模块组织 React 页面、组件和 hooks。
- `src/lib/api/` 封装 Tauri `invoke` 调用。
- `src-tauri/src/commands/` 存放前端可调用的 Tauri commands。
- `src-tauri/src/services/` 存放业务逻辑，例如 Skills 扫描、导入、符号链接管理。
- `src-tauri/src/db/` 存放数据库连接、迁移和仓储逻辑。
- `src-tauri/src/platform/` 存放系统差异逻辑，例如终端启动、路径打开、符号链接创建。

## 4. 前端模块说明

### 4.1 App Shell

职责：

- 左侧模块导航。
- 顶部页面标题和主要操作。
- 浅色 / 深色主题切换。
- 右侧工作区布局。

MVP 导航模块：

- 项目
- Skills
- AI Radar
- 设置

### 4.2 项目管理模块

职责：

- 展示本地项目列表。
- 添加和编辑项目基本信息。
- 搜索和按标签筛选项目。
- 查看项目详情。
- 打开项目目录。
- 配置启动命令和启动工作目录。
- 通过启动按钮调用 Tauri command，在新的系统终端窗口执行命令。

边界：

- 不内嵌终端。
- 不捕获命令输出。
- 不管理进程停止、重启和重复启动。

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
- 从 ZIP 文件或已解压文件夹导入 Skills。

关键原则：

- Workbench Skills 根目录保存 Skill 唯一真实副本。
- 全局工具目录和项目工具目录只放由 Workbench 管理的符号链接。
- 创建符号链接失败时明确提示，不回退复制。
- 目标位置已有真实目录或非 Workbench 管理的符号链接时，不覆盖、不删除。

### 4.4 AI Radar 模块

职责：

- 本地维护 AI 信息条目。
- 添加和编辑条目。
- 搜索条目。
- 按分类和标签筛选。
- 收藏条目。
- 打开条目链接。

分类固定为：

- 项目
- 资讯
- 论文
- 其他

边界：

- MVP 只支持用户在 Workbench 中手动录入和维护。
- MVP 不做趋势统计、自动抓取、LLM 总结、评分或推荐。
- 后续优先支持 JSON、Markdown、CSV 或现有 ai-radar 导出数据的导入。
- 外部 collector 或 Codex automation 可以把采集结果写入 radar inbox。
- Workbench 负责解析、规范化、去重、入库和展示，不负责采集和调度。

### 4.5 设置模块

职责：

- 查看本地数据库位置。
- 管理 Workbench Skills 根目录。
- 查看支持的工具及其全局 Skills 目录。
- 展示 Skills 路径映射关系。
- 管理主题偏好。

## 5. Tauri 后端模块说明

### 5.1 Commands 层

Commands 是前端唯一可调用入口。

建议按模块拆分：

```text
commands/
├─ project_commands.rs
├─ skill_commands.rs
├─ radar_commands.rs
├─ settings_commands.rs
└─ system_commands.rs
```

Commands 层只做：

- 参数接收。
- 基础校验。
- 调用 service。
- 返回结构化结果。

不在 Commands 层堆业务逻辑。

### 5.2 Services 层

Services 承载核心业务逻辑。

建议拆分：

```text
services/
├─ project_service.rs
├─ skill_service.rs
├─ radar_service.rs
├─ settings_service.rs
├─ import_service.rs
└─ symlink_service.rs
```

重点服务：

- `project_service`：项目增删改查、启动命令校验、启动请求封装。
- `skill_service`：Skills 扫描、元信息解析、分类管理。
- `import_service`：ZIP / 文件夹扫描、导入冲突检查、复制到根目录。
- `symlink_service`：创建、检测、移除 Workbench 管理的符号链接。
- `radar_service`：Radar 条目增删改查、搜索和筛选。
- `settings_service`：应用设置读写。

### 5.3 DB 层

DB 层负责：

- SQLite 连接初始化。
- 数据库迁移。
- Repository 查询封装。

建议使用显式 SQL 和迁移文件，避免 MVP 阶段引入复杂 ORM。

### 5.4 Platform 层

Platform 层封装系统差异。

职责：

- 打开文件或目录。
- 选择文件或目录。
- 在系统终端启动命令。
- 创建目录符号链接。
- 判断路径是否为符号链接。

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
| launch_command | 启动命令 |
| launch_workdir | 启动工作目录 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- `path` 应唯一。
- `launch_workdir` 默认等于 `path`。

### 6.2 skill_categories

保存 Skill 分类。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| name | 分类名称 |
| sort_order | 排序 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- 分类名称唯一。
- 未分类不一定入库，可作为系统默认视图。

### 6.3 skills

保存扫描到或导入的 Skill 元信息。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| name | Skill 名称 |
| description | Skill 描述 |
| directory_name | 根目录下的目录名 |
| root_path | Workbench Skills 根目录 |
| skill_path | `SKILL.md` 完整路径 |
| category_id | 分类 ID |
| source | 来源：local / zip / folder |
| content_hash | 内容哈希 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- `directory_name` 在统一 Skills 根目录下唯一。
- 每个 Skill 只能属于一个分类。

### 6.4 tool_targets

保存支持的工具及其全局 Skills 目录。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| tool_key | 工具标识，例如 codex / claude / opencode |
| name | 展示名称 |
| global_skills_dir | 全局 Skills 目录 |
| supports_project_scope | 是否支持项目级启用 |
| enabled | 是否在 Workbench 中启用该工具 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

### 6.5 skill_enablements

保存 Skill 启用关系。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| skill_id | Skill ID |
| tool_key | 工具标识 |
| scope | global / project |
| project_id | 项目 ID，仅项目级启用时存在 |
| link_path | 符号链接目标路径 |
| managed_by_workbench | 是否由 Workbench 管理 |
| status | active / conflict / error |
| last_error | 最近错误 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- 全局启用唯一键：`skill_id + tool_key + scope`
- 项目启用唯一键：`skill_id + tool_key + scope + project_id`
- Workbench 停用时只移除 `managed_by_workbench = true` 的链接。

### 6.6 radar_items

保存 AI Radar 本地条目。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| name | 条目名称 |
| category | 项目 / 资讯 / 论文 / 其他 |
| url | 链接 |
| tags_json | 标签数组 |
| note | 备注 |
| favorite | 是否收藏 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- `category` 固定枚举。
- `url` 可为空，但有值时应符合 URL 格式。

后续导入能力可以增加 `radar_import_runs` 表记录导入批次，包括来源类型、来源路径、导入数量、跳过数量、冲突数量和导入时间。该表不进入 MVP 初始实现。

### 6.7 app_settings

保存应用设置。

| 字段 | 说明 |
| --- | --- |
| key | 设置键 |
| value_json | 设置值 |
| updated_at | 更新时间 |

建议设置项：

- `skills_root_path`
- `theme`
- `database_path`
- `tool_targets`

## 7. 关键流程

### 7.1 启动项目

流程：

1. 前端点击项目启动按钮。
2. 前端调用 `launch_project(project_id)`。
3. 后端读取项目启动命令和工作目录。
4. 后端校验工作目录存在。
5. 后端调用系统终端执行命令。
6. 后端返回启动请求结果。

边界：

- 只负责发起系统终端启动。
- 不保存日志。
- 不追踪进程。

### 7.2 扫描 Skills 根目录

流程：

1. 用户配置 Workbench Skills 根目录。
2. 前端调用 `scan_skills()`。
3. 后端递归查找 `SKILL.md`。
4. 后端解析 frontmatter 中的 `name` 和 `description`。
5. 后端更新 `skills` 表。
6. 前端刷新 Skills 列表。

### 7.3 启用 Skill

流程：

1. 用户选择 Skill、工具和启用范围。
2. 前端调用 `enable_skill(...)`。
3. 后端计算符号链接目标路径。
4. 后端检查目标路径。
5. 若目标不存在，创建符号链接并记录启用关系。
6. 若目标已存在且非 Workbench 管理，返回冲突。

### 7.4 停用 Skill

流程：

1. 用户关闭启用开关。
2. 前端调用 `disable_skill(enablement_id)`。
3. 后端确认该链接由 Workbench 管理。
4. 后端移除符号链接。
5. 后端更新启用关系状态。

### 7.5 导入 Skills

流程：

1. 用户选择 ZIP 文件或已解压文件夹。
2. 后端扫描所有包含 `SKILL.md` 的目录。
3. 前端展示可导入列表和冲突列表。
4. 用户勾选导入项。
5. 后端复制选中目录到统一 Skills 根目录。
6. 同名目录不覆盖、不合并，返回冲突。
7. 导入完成后默认不启用。

### 7.6 管理 AI Radar

流程：

1. 用户新增或编辑条目。
2. 前端调用 Radar command。
3. 后端校验分类和 URL。
4. 后端写入 SQLite。
5. 前端刷新列表和详情。

### 7.7 导入 AI Radar 数据源

该流程属于后续阶段，不进入 MVP。

流程：

1. 外部 collector、Codex automation 或用户手动准备 JSON、Markdown、CSV 数据文件。
2. 数据文件放入 radar inbox，或由用户在 Workbench 中选择导入文件。
3. 后端解析文件并转换为统一的 Radar 条目结构。
4. 后端根据名称、URL 和分类进行去重与冲突检查。
5. 后端写入 SQLite，并记录导入结果。
6. 前端展示新增、跳过和冲突数量。

边界：

- Workbench 不负责网页抓取。
- Workbench 不负责定时任务调度。
- Workbench 不负责调用 LLM 做内容总结或评分。

## 8. 错误处理原则

- 文件系统操作失败时返回结构化错误，不吞掉异常。
- 符号链接冲突必须显式提示用户。
- 导入同名 Skill 时不覆盖、不合并。
- 启动命令工作目录不存在时禁止启动。
- 数据库迁移失败时阻止应用继续进入主界面。

## 9. 测试策略

### 9.1 Rust 后端

重点测试：

- `SKILL.md` 扫描和解析。
- ZIP / 文件夹导入冲突处理。
- 符号链接创建和冲突判断。
- 项目启动命令参数校验。
- SQLite repository 增删改查。

### 9.2 前端

重点测试：

- 页面导航。
- 项目新增和编辑表单。
- Skills 分类和启用状态展示。
- 导入弹窗流程。
- AI Radar 搜索和筛选。
- 主题切换。

### 9.3 手动验证

MVP 必须手动验证：

- Windows 下打开目录。
- Windows 下新终端执行启动命令。
- Windows 下创建目录符号链接。
- 目标路径存在时不会覆盖用户文件。

## 10. 后续扩展边界

以下内容不进入 MVP，但架构保留自然扩展空间：

- 内嵌终端和进程管理。
- Agent 配置、prompts、MCP 和规则文件管理。
- Skills 在线安装和远程仓库同步。
- AI Radar 导入式数据源和 radar inbox。
- 外部 collector 或 Codex automation 数据采集。
- Obsidian 知识库连接。
- 自动化任务入口。
