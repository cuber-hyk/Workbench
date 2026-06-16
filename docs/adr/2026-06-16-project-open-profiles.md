---
artifact_type: adr
status: accepted
created: 2026-06-16
updated: 2026-06-16
---

# 项目打开方式使用全局 Profiles

## Context

项目模块已经有启动配置。启动配置用于运行 dev server、worker 或脚本，并由 Workbench 捕获本次启动日志。用户还需要用 VS Code、Trae、PowerShell、Claude Code 等外部工具打开项目目录。

这两类行为表面上都“执行命令”，但生命周期不同：

- 启动配置由 Workbench 管理进程和日志。
- 外部工具打开只把项目目录交给另一个程序。
- Claude Code 等交互式 CLI 不能放入非交互式内嵌启动日志。

## Decision

项目打开方式使用全局 `project_open_profiles` 配置，不并入 `project_launch_configs`。

每个 Profile 保存名称、类型、PATH 命令、可选可执行文件路径、参数、工作目录、启用状态和排序。所有项目共享 Profiles。项目列表通过“用工具打开”菜单选择 Profile。

`app` 类型直接启动外部程序。`terminal` 类型通过外部终端在项目目录中启动交互式命令。Workbench 不捕获外部工具输出，不管理外部工具进程生命周期。

## Alternatives

1. 把打开方式并入启动配置。
   - 优点：少一张表和一套 UI。
   - 缺点：混淆“受 Workbench 管理的启动会话”和“外部工具入口”，Claude Code 等交互式 CLI 会落入错误生命周期。

2. 每个项目单独配置打开方式。
   - 优点：项目可定制默认工具。
   - 缺点：第一版增加项目编辑复杂度，并让通用工具配置重复出现在每个项目中。

3. 只内置固定工具，不允许配置。
   - 优点：实现最小。
   - 缺点：Trae、VS Code、Claude Code 的 PATH 和安装路径因机器不同而不稳定，缺少 exePath 兜底。

## Consequences

- 项目启动和外部工具打开保持不同数据模型和生命周期。
- 设置页需要管理全局 Profiles。
- 用户可以用 PATH 命令，也可以在 PATH 缺失时选择可执行文件路径。
- 后续如果需要项目级默认工具，应作为 Profile 选择偏好扩展，而不是改变启动配置语义。
