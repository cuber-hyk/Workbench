---
artifact_type: plan
status: archived
created: 2026-06-18
updated: 2026-06-18
owner: codex
---

# Skills 全局 Agent 工具扩展计划

## 目标

把 Skills 管理从当前仅支持 Codex、Claude Code、OpenCode，扩展为覆盖已确认支持全局 `SKILL.md` / Agent Skills 目录的终端型 Coding Agent 工具；同时保持界面在工具数量增加后的可读性和可操作性。

## 范围

- 新增全局工具目标：DevEco Code、Hermes、Kimi Code、Pi Agent、Gemini CLI、Qwen Code、Goose、Kilo Code、Cline、Roo Code、Factory Droid、Amp、Kiro CLI、Junie CLI。
- 保留已有工具：Codex、Claude Code、OpenCode。
- 所有新增工具首期只支持全局启用，不进入项目级启用区。
- Skills 表格的“全局启用”列展示用户自定义顺序中的前 5 个工具图标和 `+N` 入口；`+N` 打开小浮层展示全部工具。
- 设置页提供工具展示顺序调整，采用上移 / 下移按钮，不做拖拽。
- 设置页继续展示每个工具的全局 Skills 目录和可用状态。
- 后端继续以 Workbench Skills 根目录作为唯一真实来源，目标工具目录只保存 Workbench 管理的 symlink 或 copy。

## 非目标

- 不新增类型分组。
- 不在详情面板新增全局启用区。
- 不把新增工具加入项目级启用，除非后续单独确认项目级支持。
- 不管理 Agent 配置文件内容、认证、MCP、环境变量或启动命令。
- 不实现在线安装 Skills、远程更新、批量操作或工具市场。
- 不引入图标资源管理的大型方案；首期只保证紧凑、可识别和不撑坏布局。

## 假设与已确认决策

- 新增工具全局启用即可满足本轮需求；项目级能力延后。
- 表格是全局启用的唯一操作入口，详情面板只保留项目级展示。
- 项目启用区只遍历 `supportsProjectScope=true` 的工具。
- 工具筛选继续保留在 Skills 顶部工具栏，匹配全局启用和项目级启用；当同时选择项目和 global-only 工具时，只匹配该项目级启用关系，因此通常不会命中。
- 默认展示顺序先保留当前三项：Codex、Claude Code、OpenCode；再按本轮确认顺序追加：DevEco Code、Hermes、Kimi Code、Pi Agent、Gemini CLI、Qwen Code、Goose、Kilo Code、Cline、Roo Code、Factory Droid、Amp、Kiro CLI、Junie CLI。
- 对于一个工具官方支持多个全局 Skills 目录时，首期选择一个推荐或专属目录作为 Workbench 管理目标，避免同一工具出现多个启用目标。
- Goose 使用 `~/.agents/skills/`，Amp 使用 `~/.config/agents/skills/`；其他工具优先使用各自专属目录。

## 已确认工具路径

| 工具 | 全局 Skills 目录 | 配置文件位置参考 | 项目级首期支持 |
| --- | --- | --- | --- |
| Codex | `~/.codex/skills` | 当前实现已支持 | 是 |
| Claude Code | `~/.claude/skills` | 当前实现已支持 | 是 |
| OpenCode | `~/.config/opencode/skills` | 当前实现已支持 | 是 |
| DevEco Code | `~/.config/deveco/skills` | `~/.config/deveco/deveco.jsonc`，项目 `.deveco/deveco.jsonc` 或 `deveco.jsonc` | 否 |
| Hermes | `~/.hermes/skills` | `~/.hermes/config.yaml`、`~/.hermes/.env`、`~/.hermes/auth.json` | 否 |
| Kimi Code | `~/.kimi-code/skills` | `~/.kimi-code/config.toml`、`~/.kimi-code/tui.toml`、用户 `~/.kimi-code/mcp.json`、项目 `.kimi-code/mcp.json` | 否 |
| Pi Agent | `~/.pi/agent/skills` | Pi Agent 文档确认全局和项目 Skills 目录 | 否 |
| Gemini CLI | `~/.gemini/skills` | Gemini CLI skills 文档；另支持 `~/.agents/skills` | 否 |
| Qwen Code | `~/.qwen/skills` | Qwen Code skills 文档 | 否 |
| Goose | `~/.agents/skills` | Goose skills 文档；兼容 `.goose` / `.claude` 目录 | 否 |
| Kilo Code | `~/.kilo/skills` | Kilo Code skills 文档；兼容 `.agents` / `.claude` 目录 | 否 |
| Cline | `~/.cline/skills` | Cline skills 文档 | 否 |
| Roo Code | `~/.roo/skills` | Roo Code skills 文档；另有 mode-specific skills 目录 | 否 |
| Factory Droid | `~/.factory/skills` | Factory CLI skills 文档 | 否 |
| Amp | `~/.config/agents/skills` | Amp Agent Skills 文档；兼容 `.agents` / `.claude` 目录 | 否 |
| Kiro CLI | `~/.kiro/skills` | Kiro CLI skills 文档 | 否 |
| Junie CLI | `~/.junie/skills` | Junie Agent Skills 文档，Windows 为 `%USERPROFILE%\.junie\skills` | 否 |

## 事实来源

- `CONTEXT.md`：Workbench Skills 根目录是统一真实来源。
- `docs/PRD.md`：Skills 管理、Agent 工具与配置边界。
- `docs/ARCHITECTURE.md`：Skills 后端、数据模型和同步流程。
- `docs/capabilities/skills-management.md`：当前 Skills 能力与筛选语义。
- `DESIGN.md`：表格、详情面板、设置页和全局工具启用 UI 规则。
- `src-tauri/src/skills.rs`：后端工具目标、路径计算、启用、冲突、删除和同步逻辑。
- `src/lib/types/domain.ts`：前端 `ToolTarget` 和 Skill 类型。
- `src/App.tsx`：Skills 表格、详情面板、冲突面板和设置页。
- `src/styles.css`：Skills 表格列宽、工具图标、设置行和浮层样式。
- `src/App.test.tsx`、`src/lib/api/mockData.ts`：前端测试和预览数据。
- 官方资料：DevEco Code、Hermes、Kimi Code、Pi Agent、Gemini CLI、Qwen Code、Goose、Kilo Code、Cline、Roo Code、Factory Droid、Amp、Kiro CLI、Junie CLI 的 Skills 或配置文档。

## 执行步骤

### 1. 建立工具目标定义

状态：todo

- 在后端集中定义工具目标：key、name、global path、是否支持项目级、默认展示顺序。
- 把 `tool_target_path` 从三工具 match 扩展为查表式路径解析。
- 对 project scope 增加守卫：只有 `supports_project_scope=true` 的工具允许项目级启用。
- 前端把 `ToolTarget["key"]` 从固定三值 union 放宽为字符串别名，避免每次新增工具都改类型 union。

验证：

- Rust 单元测试覆盖新增工具路径、global-only 工具拒绝 project scope、未知工具报错。
- TypeScript 编译通过，不再依赖三值 union。

### 2. 保存和读取工具展示顺序

状态：todo

- 在 `app_settings` 中新增工具展示顺序设置，例如 `tool_target_order`。
- 后端返回 `tool_targets` 时按用户顺序排序，缺失项按默认顺序追加。
- 增加 Tauri command 保存工具顺序，前端 API 封装对应调用。
- 不把工具目录本身变成用户自定义路径；路径覆盖留到后续单独计划。

验证：

- Rust 测试覆盖默认顺序、保存后的顺序、升级后新增工具追加。
- 前端测试覆盖设置页上移 / 下移后重新渲染顺序。

### 3. 扩展全局启用与冲突逻辑

状态：todo

- 扫描全局工具状态时遍历完整工具列表。
- `set_skill_enabled`、`open_global_skill_target`、冲突候选、备份路径和删除清理都使用统一工具定义。
- 冲突面板候选标签使用工具名或简短 key，避免继续暗示只有 `.codex`、`.claude`、`.opencode`。
- 对共享或兼容目录保持当前“目标路径已有内容不覆盖”的规则。

验证：

- Rust 测试覆盖新增工具的启用、停用、内容一致自动登记、内容冲突识别。
- 冲突解决测试覆盖新增工具作为版本来源。

### 4. 调整 Skills 表格和详情面板

状态：todo

- `GlobalToolIcons` 只渲染前 5 个工具图标，末尾显示 `+N` 小按钮。
- `+N` 使用已有 popover 风格展示全部工具，浮层内所有工具仍可点击切换。
- 图标按钮保留 managed、disabled、conflict 三种状态；conflict 仍不可直接切换。
- 详情面板的项目启用区只展示 `supportsProjectScope=true` 的工具。
- 项目“全部工具启用”只计算 project-capable 工具。

验证：

- 前端测试覆盖超过 5 个工具时出现 `+N`、浮层可打开、浮层内工具可切换。
- 前端测试覆盖 global-only 工具不出现在项目启用区。
- 手动检查默认窗口宽度下表格不横向撑坏。

### 5. 调整设置页工具目录管理

状态：todo

- 设置页“支持的工具目录”展示完整工具列表，按当前用户顺序排列。
- 每行展示工具名、全局 Skills 目录、可用状态和打开目录按钮。
- 增加上移 / 下移图标按钮；边界项禁用对应方向。
- 文案说明展示顺序会影响 Skills 表格全局工具列。

验证：

- 前端测试覆盖上移 / 下移按钮状态和调用。
- 手动检查 17 个工具列表在设置页滚动容器内可读，不撑坏布局。

### 6. 更新预览数据、文档和设计规则

状态：todo

- 更新 `src/lib/api/mockData.ts`，让预览模式包含扩展后的工具列表。
- 更新 `docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/capabilities/skills-management.md` 中的工具列表、全局 only 边界和表格展示规则。
- 如新增 UI 规则成为稳定设计约束，更新 `DESIGN.md`。
- 更新 `docs/ai/context-map.md` 的能力文档时间或相关索引，仅在能力文档新增路由时修改。

验证：

- Dev Flow 文档检查通过。
- 文档不保留旧的“三工具唯一支持”表述。

### 7. 完整验证与收尾

状态：todo

- 运行前端测试，重点看 Skills 筛选、表格、设置页。
- 运行 Rust 测试，重点看 Skills 路径、启用、冲突和删除。
- 运行 `pnpm verify`。
- 按项目规则在提交前展示 `git status` 和 `git diff`，等待确认后再提交。

验证：

- `pnpm verify` 通过。
- 若涉及发布验证，后续再运行 `pnpm tauri:verify-build`。

## 风险与处理

- 工具数量从 3 增加到 17，表格列宽和详情区最容易退化；通过固定前 5 个图标和 `+N` 浮层控制复杂度。
- 前端类型当前把工具 key 固定为三值 union，直接追加 union 会让后续维护继续变重；本轮应改为字符串 key。
- 部分工具同时支持 `.agents/skills` 或兼容 Claude Skills 目录；首期只选择一个 Workbench 管理目标，避免重复同步和重复冲突。
- `~/.agents/skills` 可能被多个工具共同读取；Workbench 仍按“目标目录 + skill name”处理冲突，不推断多个工具共享状态。
- Gemini CLI 文档提到特定用户层级的 CLI 迁移信息；本轮仍按已公开 Skills 路径纳入，后续如官方路径变化再调整。
- 设置顺序持久化是新状态；需要确保升级后旧数据库没有该设置也能按默认顺序工作。

## 验收标准

- 设置页显示 17 个工具，并能打开各自全局 Skills 目录。
- 用户可以调整工具展示顺序，刷新状态后顺序保持。
- Skills 表格全局工具列只显示前 5 个工具图标和 `+N`，不会因工具数量增加而撑坏列表。
- `+N` 浮层展示全部工具，并允许对非冲突工具执行全局启用 / 停用。
- 新增工具可以全局启用、停用、检测内容一致、识别内容冲突，并参与冲突解决。
- 详情面板项目启用区只显示 Codex、Claude Code、OpenCode。
- `supportsProjectScope=false` 的工具无法通过后端 project scope 启用。
- 现有 Codex、Claude Code、OpenCode 的全局和项目级能力不回退。
- `pnpm verify` 通过。

## Artifact Routing

- 计划：本文档。
- 实现：`src-tauri/src/skills.rs`、`src/lib/types/domain.ts`、`src/lib/api/workbenchApi.ts`、`src/lib/api/mockData.ts`、`src/App.tsx`、`src/styles.css`、相关测试。
- 能力文档：更新 `docs/capabilities/skills-management.md`。
- 产品 / 架构文档：更新 `docs/PRD.md`、`docs/ARCHITECTURE.md`。
- 设计系统：若 `+N` 浮层和设置页排序成为稳定规则，更新 `DESIGN.md`。
- ADR：暂不需要。当前是扩展既有固定工具目标和 UI 展示规则，不改变 Skills 单一真实来源或同步所有权；实现后若工具目标定义变成可配置注册表，再进入 ADR gate。
- Changelog：若本仓库维护用户可见变更记录，实施完成后通过 Dev Flow 收尾判断是否更新。

## 执行建议

本任务跨 Rust 后端、React UI、类型、测试和文档，建议下一步使用 `/dev-branch` 创建任务分支实施。实施前保持当前未提交的调研报告和图标目录可见，不把它们误当作本计划生成的新文件。
