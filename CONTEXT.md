# Workbench App Context

## 当前阶段

Workbench App 已完成第一阶段基础能力验证，当前进入进阶开发阶段。正式工程已经建立，项目管理、Skills 管理和资源 Radar 均已接入本地 Tauri 后端与 SQLite。

## 核心产品边界

- 独立桌面软件，不是 Obsidian 插件或目录型工作流。
- 本地优先，数据默认保存在本机。
- Agent 配置中心、Obsidian 连接、后台资源采集和自动化入口属于后续方向，进入实现前需要单独计划。
- Skills 使用 `~/.workbench/skills` 作为统一真实来源。
- `skills.sh` 是当前唯一接入的在线 Skills 来源；安装和更新通过隔离临时目录调用官方 `npx skills add` 提取内容，再由 Workbench 写入统一 Skills 根目录并维护来源记录。

## 已确认实现方向

- 前端：React、TypeScript、Vite。
- 桌面与本地能力：Tauri 2、Rust。
- 本地存储：SQLite，数据库路径为 `~/.workbench/workbench.sqlite`。
- UI：固定左侧导航 + 右侧列表详情工作区。
- Skills 启用：Auto 同步，优先 Symlink，失败时 Copy。

## 当前模块状态

- 项目：基本信息、启动项、归档状态、目录选择和内嵌启动会话已接入 SQLite 与 Tauri 本地能力。
- Skills：扫描、分类、导入、skills.sh 市场安装/卸载、skills.sh 来源更新、全局启用、项目启用、冲突解决和删除已接入真实后端。
- 资源 Radar：本地增删改查、搜索筛选、收藏、打开链接和 GitHub Stars 手动同步已接入 SQLite 与 Tauri commands。
- 设置：展示数据位置、Skills 根目录、工具目录和主题。
- 验证：统一 `pnpm verify` 覆盖前端构建、Rust 格式、测试和 Clippy；Tauri Release 构建与 Windows 安装包构建通过。

## 重要约束

- 不覆盖用户已有 Skills 内容。
- 停用只移除 Workbench 管理的链接或副本。
- 内容冲突通过用户选择唯一版本源解决，替换前备份。
- 删除或市场卸载 Skill 不删除未被 Workbench 管理的工具目录内容；skills.sh 来源 Skill 删除时同步清理来源记录。
- 市场安装和更新依赖 Node.js、npm 和 npx；缺失或网络/CLI 失败时在市场页用统一 warning 提示具体原因和重试入口。
- 项目归档只更新 Workbench SQLite 记录，不移动、不删除、不修改本地项目目录。
