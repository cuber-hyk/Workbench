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

数据库文件放在 Workbench 本地数据根目录：

```text
~/.workbench/workbench.sqlite
```

默认 Skills 唯一真实副本目录为 `~/.workbench/skills`。源码目录只保存代码、文档和静态原型。

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
│  ├─ lib/
│  │  ├─ api/
│  │  ├─ types/
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ styles.css
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ lib.rs
│  │  └─ skills.rs
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
- `src-tauri/src/skills.rs` 集中实现当前 Skills commands、SQLite 与文件系统逻辑，避免 MVP 阶段提前拆分。

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
- 全局工具目录和项目工具目录只放由 Workbench 管理的符号链接或复制副本。
- 默认使用 Auto 同步：优先创建符号链接，失败时原子复制。
- 目标位置已有内容且没有对应 Workbench 启用记录时，不覆盖、不删除。
- 停用时依据数据库记录，只移除对应的受管符号链接或完整副本。
- 扫描全局工具目录时识别内容一致状态和内容冲突状态。
- 内容一致状态在扫描时自动登记为 Workbench 管理，不修改文件内容。
- 解决内容冲突必须由用户显式触发。
- 内容冲突按 Skill 统一解决：用户从 `.workbench`、`.codex`、`.claude`、`.opencode` 的可用版本中选择一个唯一版本源。
- 解决冲突前必须备份被替换版本，不自动合并目录内容。
- 删除 Skill 只删除统一根目录内容和 Workbench 管理的启用目标，不删除未被 Workbench 管理的工具目录。

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

`src-tauri/src/lib.rs` 注册前端唯一可调用的 Tauri commands。

当前已实现的 Skills 能力集中在 `src-tauri/src/skills.rs`：

- 扫描和解析 `SKILL.md`。
- 系统选择器、ZIP / 文件夹导入与冲突检查。
- SQLite 设置、分类和启用关系读写。
- Codex、Claude Code、OpenCode 的目标路径计算。
- Auto 同步：优先创建受管符号链接，失败时复制完整目录。
- 检测全局工具目录中的内容一致状态和内容冲突。
- 扫描时自动登记内容一致的全局启用，统一解决 Skill 级版本冲突并备份被替换版本。
- 创建、检测和移除受管符号链接或副本。
- 删除统一根目录中的 Skill 并清理对应 Workbench 管理记录。
- 打开本地文件或目录。

MVP 阶段保持单文件模块；当模块职责产生实际维护压力时再按 commands、database 和 filesystem 边界拆分。

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

### 6.2 skill_metadata

保存扫描结果之外需要持久化的 Skill 元信息。Skill 名称、描述和路径直接从根目录扫描获得，不重复写入数据库。

| 字段 | 说明 |
| --- | --- |
| directory_name | Skill 目录名，主键 |
| category | 分类名称，默认 `未分类` |

约束：

- `directory_name` 在统一 Skills 根目录下唯一。
- 每个 Skill 只能属于一个分类。

### 6.3 工具目标

工具目标暂不入库，由后端提供固定定义：

- Codex：`~/.codex/skills`，项目目录为 `<project>/.codex/skills`。
- Claude Code：`~/.claude/skills`，项目目录为 `<project>/.claude/skills`。
- OpenCode：`~/.config/opencode/skills`，项目目录为 `<project>/.opencode/skills`。

### 6.4 skill_enablements

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

### 6.5 radar_items

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

### 6.6 app_settings

保存应用设置。

| 字段 | 说明 |
| --- | --- |
| key | 设置键 |
| value | 设置值 |

建议设置项：

- `skills_root`

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
3. 后端检查根目录各直接子目录中的 `SKILL.md`。
4. 后端解析 frontmatter 中的 `name` 和 `description`。
5. 后端更新 `skills` 表。
6. 前端刷新 Skills 列表。

### 7.3 启用 Skill

流程：

1. 用户选择 Skill、工具和启用范围。
2. 前端调用 `enable_skill(...)`。
3. 后端计算目标路径。
4. 后端检查目标路径。
5. 若目标不存在，优先创建符号链接；失败时原子复制，并记录实际同步方式。
6. 若目标已存在且非 Workbench 管理，返回冲突，不覆盖目标内容。

### 7.4 停用 Skill

流程：

1. 用户关闭启用开关。
2. 前端调用 `disable_skill(enablement_id)`。
3. 后端读取 Workbench 记录的实际同步方式和目标路径。
4. 后端移除受管符号链接或完整副本。
5. 后端更新启用关系状态。

### 7.5 导入 Skills

流程：

1. 用户点击导入，选择 ZIP 文件或已解压文件夹。
2. 前端调用系统文件选择器或文件夹选择器。
3. 后端扫描来源中所有包含 `SKILL.md` 的目录。
4. 后端将所有可导入目录复制到统一 Skills 根目录。
5. 同名目录不覆盖、不合并，返回跳过结果。
6. 导入完成后默认不启用。

### 7.6 全局启用状态扫描和冲突解决

流程：

1. 用户扫描 Skills。
2. 后端对每个 Skill 检查 Codex、Claude Code、OpenCode 的全局目标目录。
3. 若目标不存在，状态为未启用。
4. 若目标由 Workbench 数据库记录管理，状态为 Workbench 管理。
5. 若目标存在但未被 Workbench 记录管理，后端比较目标目录和统一根目录中的 Skill 内容。
6. 内容一致时，后端自动登记为 Workbench 管理，不修改目标文件。
7. 内容不一致时，状态为冲突，前端展示 Skill 级冲突面板。
8. 用户从 `.workbench`、`.codex`、`.claude`、`.opencode` 的可用版本中选择一个唯一版本源。
9. 后端将被替换版本备份到 `~/.workbench/backups/skills/<timestamp>/<tool>/<skill>`。
10. 选中的版本写入 Workbench 根目录，已存在的全局工具目录统一重新同步。
11. 冲突解决不自动合并文件。

### 7.7 删除 Skill

流程：

1. 用户在 Skills 表格操作列点击删除图标。
2. 前端展示删除确认弹窗。
3. 后端读取该 Skill 的 Workbench 管理启用记录。
4. 后端移除仍然有效的受管符号链接或完整副本。
5. 后端删除分类记录和启用记录。
6. 后端删除统一根目录中的 Skill。
7. 未被 Workbench 管理的外部工具目录内容保持不变。

### 7.8 管理 AI Radar

流程：

1. 用户新增或编辑条目。
2. 前端调用 Radar command。
3. 后端校验分类和 URL。
4. 后端写入 SQLite。
5. 前端刷新列表和详情。

### 7.9 导入 AI Radar 数据源

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
- Skills 目标冲突必须显式提示用户。
- 导入同名 Skill 时不覆盖、不合并。
- 全局工具目录同名 Skill 内容冲突不自动合并，替换前必须备份。
- 删除 Skill 不删除未被 Workbench 管理的工具目录内容。
- 启动命令工作目录不存在时禁止启动。
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
- Windows 下 Auto 同步优先创建目录符号链接，权限不足时复制。
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
