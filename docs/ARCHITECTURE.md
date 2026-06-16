# Workbench App 架构说明

## 1. 架构目标

Workbench App 是一个本地优先的桌面应用。MVP 只围绕项目管理、Skills 管理、资源 Radar 和设置四个模块设计，不引入独立 HTTP 后端、插件系统、在线市场或云同步。

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

SQLite 用于保存项目、Skills 元信息、分类、启用关系、资源 Radar 条目和应用设置。

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
- 资源 Radar
- 设置

### 4.2 项目管理模块

职责：

- 展示本地项目列表。
- 添加和编辑项目基本信息。
- 归档和恢复项目记录。
- 通过系统目录选择器选择项目路径和启动工作目录。
- 搜索和按标签筛选项目。
- 查看项目详情。
- 打开项目目录。
- 配置一个或多个启动项。
- 通过启动按钮调用 Tauri command，为所有启用启动项创建本次内嵌启动会话。

边界：

- 不提供交互式 shell 输入。
- 不持久化命令输出。
- 只管理当前运行中的启动会话，重复启动会创建新的会话组。
- 归档只更新 Workbench SQLite 记录，不访问、不移动、不删除项目目录。

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

### 4.4 资源 Radar 模块

职责：

- 本地维护资源条目。
- 添加和编辑条目。
- 删除本地条目。
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
| archived | 是否归档 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

约束：

- `path` 应唯一。
- 项目启动项保存在 `project_launch_configs`。
- 归档项目默认不出现在项目列表和 Skills 项目启用列表中。

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

### 6.3 skill_metadata

保存扫描结果之外需要持久化的 Skill 元信息。Skill 名称、描述和路径直接从根目录扫描获得，不重复写入数据库。

| 字段 | 说明 |
| --- | --- |
| directory_name | Skill 目录名，主键 |
| category | 分类名称，默认 `未分类` |

约束：

- `directory_name` 在统一 Skills 根目录下唯一。
- 每个 Skill 只能属于一个分类。

### 6.4 工具目标

工具目标暂不入库，由后端提供固定定义：

- Codex：`~/.codex/skills`，项目目录为 `<project>/.codex/skills`。
- Claude Code：`~/.claude/skills`，项目目录为 `<project>/.claude/skills`。
- OpenCode：`~/.config/opencode/skills`，项目目录为 `<project>/.opencode/skills`。

### 6.5 skill_enablements

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

### 6.6 radar_items

保存资源 Radar 本地条目。手动资源与 GitHub Stars 共用一张表，外部来源使用 `source + external_id` 唯一标识。

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
| source | `manual` / `github_star` |
| external_id | 外部来源稳定标识 |
| source_description | 来源描述快照 |
| source_metadata_json | 语言、Topics、Stars 数量等来源元数据 |
| source_active | 来源当前是否有效 |
| last_synced_at | 最后成功同步时间 |

约束：

- `category` 固定枚举。
- `url` 可为空，但有值时应符合 URL 格式。

后续导入能力可以增加 `radar_import_runs` 表记录导入批次，包括来源类型、来源路径、导入数量、跳过数量、冲突数量和导入时间。该表不进入 MVP 初始实现。

### 6.7 app_settings

保存应用设置。

| 字段 | 说明 |
| --- | --- |
| key | 设置键 |
| value | 设置值 |

建议设置项：

- `skills_root`

## 7. 关键流程

### 7.1 保存项目

流程：

1. 用户在项目弹窗中新增或编辑项目。
2. 前端调用 `save_project(project)`。
3. 后端校验项目 ID、名称和路径不为空。
4. 后端写入 SQLite `projects` 表。
5. 后端返回更新后的项目列表。
6. 前端刷新列表并选中保存后的项目。

边界：

- MVP 不删除项目。
- MVP 不校验项目路径必须存在；启动时再校验启动工作目录。

### 7.1.1 归档项目

流程：

1. 用户在项目列表或详情中点击归档或恢复。
2. 前端先检查当前内存中的启动会话；项目仍有运行中会话时拒绝归档。
3. 前端保存当前项目记录，并切换 `archived` 状态。
4. 后端只更新 SQLite `projects.archived` 字段及项目记录，不触碰项目路径。
5. 默认项目列表只显示未归档项目，筛选可查看已归档或全部项目。
6. Skills 项目启用列表默认只使用未归档项目。

边界：

- 不删除 Workbench 项目记录。
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
- MVP 不单独启动某一个启动项；项目启动主操作执行所有启用启动项。

### 7.3 扫描 Skills 根目录

流程：

1. 用户配置 Workbench Skills 根目录。
2. 前端调用 `scan_skills()`。
3. 后端检查根目录各直接子目录中的 `SKILL.md`。
4. 后端解析 frontmatter 中的 `name` 和 `description`。
5. 后端更新 `skills` 表。
6. 前端刷新 Skills 列表。

### 7.4 启用 Skill

流程：

1. 用户选择 Skill、工具和启用范围。
2. 前端调用 `enable_skill(...)`。
3. 后端计算目标路径。
4. 后端检查目标路径。
5. 若目标不存在，优先创建符号链接；失败时原子复制，并记录实际同步方式。
6. 若目标已存在且非 Workbench 管理，返回冲突，不覆盖目标内容。

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

### 7.7 全局启用状态扫描和冲突解决

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

### 7.8 删除 Skill

流程：

1. 用户在 Skills 表格操作列点击删除图标。
2. 前端展示删除确认弹窗。
3. 后端读取该 Skill 的 Workbench 管理启用记录。
4. 后端移除仍然有效的受管符号链接或完整副本。
5. 后端删除分类记录和启用记录。
6. 后端删除统一根目录中的 Skill。
7. 未被 Workbench 管理的外部工具目录内容保持不变。

### 7.9 管理资源 Radar

流程：

1. 用户新增或编辑条目。
2. 前端调用 Radar command。
3. 后端校验分类和 URL。
4. 后端写入 SQLite。
5. 前端刷新列表和详情。

删除条目、切换收藏状态也通过 Radar command 更新 SQLite，并返回最新条目列表。

### 7.10 同步 GitHub Stars

流程：

1. 用户点击同步 GitHub Stars。
2. 后端通过 `gh api user/starred --paginate` 完整获取当前账号 Stars。
3. 后端解析全部结果后，在一个事务中按 `source + external_id` 新增或更新来源字段。
4. 同步不覆盖用户维护的分类、标签、备注和收藏状态。
5. 本次结果中缺失的已有 GitHub Star 标记为来源失效，不删除本地资源。
6. 前端展示新增、更新、失效和未变化数量。

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
- 项目归档筛选。
- Skills 分类和启用状态展示。
- 导入弹窗流程。
- 资源 Radar 搜索、类型筛选、来源筛选和 GitHub Stars 同步。
- 主题切换。

### 9.3 手动验证

MVP 必须手动验证：

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

以下内容不进入 MVP，但架构保留自然扩展空间：

- 交互式终端、持久化启动日志和复杂进程编排。
- Agent 配置、prompts、MCP 和规则文件管理。
- Skills 在线安装和远程仓库同步。
- 资源 Radar 的其他导入式数据源和 radar inbox。
- 外部 collector 或 Codex automation 数据采集。
- Obsidian 知识库连接。
- 自动化任务入口。
