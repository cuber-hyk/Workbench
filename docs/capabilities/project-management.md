---
artifact_type: capability
status: current
created: 2026-06-16
updated: 2026-06-16
source_of_truth: src-tauri/src/projects.rs
adr: docs/adr/2026-06-16-project-open-profiles.md
---

# 项目管理

项目管理模块保存本地项目记录，并提供目录打开、外部工具打开、启动配置、归档和本次启动会话查看能力。项目数据默认保存在 Workbench SQLite 数据库中。

## 当前能力

- 新增、编辑、搜索、筛选、归档和恢复本地项目记录。
- 打开项目目录。
- 配置一个或多个项目启动项。
- 启动项目时执行所有启用且配置了命令的启动项。
- 在当前应用进程内维护本次启动会话、stdout / stderr 输出和状态快照。
- 通过全局项目打开方式 Profiles 用 VS Code、Trae、PowerShell、Claude Code 等外部工具打开项目目录。
- 在设置中管理项目打开方式 Profiles，包括启用、停用、命令、可执行文件路径、参数和工作目录。

## 数据所有权

- 项目记录保存在 `projects` 表。
- 项目启动项保存在 `project_launch_configs` 表，属于项目记录的一部分。
- 项目打开方式保存在 `project_open_profiles` 表，是全局配置，不属于单个项目。
- 默认打开方式 seed 状态保存在 `app_settings.project_open_profiles_seeded`，避免用户删除默认 Profile 后被再次自动恢复。
- 项目归档只更新 Workbench 数据库，不移动、不删除、不修改本地项目目录。

## 启动项目

- 启动项用于运行项目进程，例如 dev server、worker 或本地脚本。
- 启动项必须有命令和存在的工作目录。
- 启动后由 Workbench 捕获 stdout / stderr，并在项目模块内展示本次启动日志。
- 启动会话不持久化历史输出，应用重启后内存日志清空。
- 停止启动会话只作用于 Workbench 当前管理的子进程。

## 用工具打开

- 打开方式用于把项目目录交给外部工具，不等同于启动项。
- `app` 类型直接启动 GUI 程序。
- `app` 类型不会继承 Workbench 的 stdout / stderr，避免外部 GUI 工具的运行时 warning 打到 Workbench 控制台。
- `terminal` 类型通过外部终端启动交互式命令。
- `executablePath` 有值时优先使用它；否则从 PATH 解析 `command`。
- `args` 和 `workdir` 支持 `{projectPath}` 占位符。
- Claude Code 等交互式 CLI 必须通过外部终端打开，不进入 Workbench 内嵌启动日志。
- Workbench 不捕获外部工具输出，不持久化外部工具运行状态，不管理外部工具生命周期。

## 边界与错误

- 项目路径为空或不存在时，打开方式必须失败并给出提示。
- Profile 停用时不能执行。
- 命令和可执行文件路径都为空时不能保存或执行。
- 可执行文件路径不存在时不能保存或执行。
- PATH 缺失或命令无法启动时，提示用户检查 PATH 或在设置中选择可执行文件。
- Workbench 不自动安装外部工具，也不修改用户 PATH。
