---
artifact_type: capability
status: current
created: 2026-06-16
updated: 2026-06-24
source_of_truth: src-tauri/src/projects.rs
adr: docs/adr/2026-06-16-project-open-profiles.md
---

# 项目管理

项目管理模块保存本地项目记录，并提供本地项目添加、GitHub/Gitee 远程导入、目录打开、外部工具打开、启动配置、删除记录和本次启动会话查看能力。项目数据默认保存在 Workbench SQLite 数据库中。

## 当前能力

- 新增、编辑、搜索、筛选、分页浏览和删除本地项目记录。
- 从 GitHub 或 Gitee 远程仓库导入项目：用户选择本地父目录，Workbench 调用本机 `git clone` 克隆到父目录下的仓库名子目录，并在成功后保存项目记录。
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
- 删除项目只删除 Workbench 数据库中的项目记录和启动项，不移动、不删除、不修改本地项目目录。
- 远程导入只会创建目标 clone 目录和 Workbench 项目记录；不会覆盖已有目录，不会自动配置 Git 凭据，也不会安装 Git。
- 远程导入失败时，只清理本次导入创建且导入前不存在的目标目录；已有目录或用户文件不由 Workbench 删除。

## 远程导入

- 项目页“添加项目”入口提供本地导入和 GitHub/Gitee 导入两个动作。
- 支持 `https://github.com/owner/repo(.git)`、`git@github.com:owner/repo.git`、`https://gitee.com/owner/repo(.git)` 和 `git@gitee.com:owner/repo.git`。
- 远程导入依赖本机 `git` 命令；未检测到 `git` 时提示用户安装或加入 PATH 后重试，不自动安装。
- 导入进度是阶段性进度，用于表达校验、Git 检查、clone、保存记录和完成状态，不代表下载字节的精确百分比。
- 导入开始前同时检查 Workbench 是否已有相同路径记录，以及本地目标目录是否存在：
  - 记录和目录都不存在：正常 clone 并保存项目记录。
  - 记录和目录都存在：不重复 clone，允许用户直接查看已有项目。
  - 记录存在但目录缺失：经用户确认后重新 clone，并保留原项目名称、标签、备注和启动配置。
  - 记录不存在但目录存在：不接管、不覆盖已有目录，要求选择其他父目录。
- 导入失败时进度区显示明确失败状态和错误信息，可由用户重新尝试，不保留“正在检查 Git”等运行中状态。
- 导入成功后的项目与本地导入项目行为一致，并创建一个空命令启动项，工作目录为 clone 后的项目目录。
- 远程 URL 只用于导入过程，不作为项目记录的长期来源元数据保存。

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
- `terminal` 类型的 `command` 可以包含内联参数，例如 `deveco -c --skip-agreement`；保存到 `args` 的参数会继续追加在后面。
- `args` 和 `workdir` 支持 `{projectPath}` 占位符。
- `workdir` 留空时按 `{projectPath}` 处理；只有外部工具要求项目路径作为参数时，才需要在 `args` 中填写 `{projectPath}`。
- Claude Code 等交互式 CLI 必须通过外部终端打开，不进入 Workbench 内嵌启动日志。
- Workbench 不捕获外部工具输出，不持久化外部工具运行状态，不管理外部工具生命周期。

## 边界与错误

- 项目路径为空或不存在时，打开方式必须失败并给出提示。
- 打开目录、外部工具打开或启动项目时，如果访问到的项目路径或启动工作目录不存在，前端应提示用户是否删除该 Workbench 项目记录。
- 缺失路径确认删除只删除 Workbench 记录，不删除本地文件。
- 远程导入只接受 GitHub 和 Gitee 仓库地址；其他 host、非 owner/repo 结构、带查询参数或片段的地址必须失败并提示。
- 远程导入的父目录必须存在且是文件夹；未受管目标目录已存在时必须停止导入，不能覆盖。
- `git clone` 因网络、认证、仓库不存在、SSH host key 或其他 Git 错误失败时，错误信息必须反馈给用户。
- Profile 停用时不能执行。
- 命令和可执行文件路径都为空时不能保存或执行。
- 可执行文件路径不存在时不能保存或执行。
- PATH 缺失或命令无法启动时，提示用户检查 PATH 或在设置中选择可执行文件。
- Workbench 不自动安装外部工具，也不修改用户 PATH。
