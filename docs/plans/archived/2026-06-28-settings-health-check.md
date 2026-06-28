---
artifact_type: plan
status: archived
created: 2026-06-28
updated: 2026-06-28
owner: codex
---

# 设置页健康检查计划

## Goal

在设置页“诊断”中新增一个手动触发的“健康检查”区块，用于检查 Workbench 运行 Skills、Radar 和本地工具目录时最常见的本机依赖与权限问题。

目标是让用户不用离开 Workbench，就能看到 Node/npm/npx、GitHub CLI、skills.sh、符号链接能力和工具目录可写性是否满足当前功能需要。

## Scope

- 在 `诊断` 设置页新增“健康检查”区块。
- 默认不自动运行；用户点击“开始检查”后执行。
- 展示整体检查时间和逐项状态。
- 每个检查项至少包含：
  - 名称。
  - 状态：`可用`、`缺失`、`需要配置`、`无权限`、`检查失败`、`跳过`。
  - 一句简短说明。
  - 可选版本号或路径摘要。
- 第一版检查项：
  - `Node / npm / npx`：检查命令可执行并展示版本。
  - `GitHub CLI`：检测 `gh` 是否安装、是否登录，复用现有 Radar 的状态分类语义。
  - `skills.sh`：检查当前 Node/npm/npx 链路是否足以调用 skills.sh 的只读版本检查。
  - `符号链接权限`：在临时目录内做非破坏性 symlink 探测，完成后清理临时目录。
  - `工具目录可写性`：检查当前已配置工具目录是否存在、是否可写；不自动创建真实工具目录。

## Non-Goals

- 不做 GitHub Releases 可访问性检查；这属于网络/更新诊断，后续单独规划。
- 不做代理设置、DNS 检查、GitHub API 限流解释。
- 不自动安装 Node、GitHub CLI 或 skills.sh。
- 不自动登录 GitHub CLI。
- 不创建真实工具目录。
- 不修改用户 Skills、工具目录、配置或数据库 schema。
- 不导出问题包，不上传诊断结果。
- 不在设置页打开时后台自动检查。

## Assumptions And Decisions

- 按上一轮确认方向，第一版只做本机依赖与权限健康检查，GitHub Releases 网络检查暂缓。
- 健康检查是诊断页的一个 section，不新增设置分类，也不新增 App Shell 导航。
- 检查必须由用户手动触发，避免设置页打开时启动外部进程或卡顿。
- 后端检查是只读或临时目录内可回滚操作；真实用户目录只做存在性和写入权限探测，不创建缺失目录。
- GitHub CLI 检查沿用现有 Radar 的 `missing / unauthenticated / ready` 语义，但 UI 文案映射到诊断页状态。
- `skills.sh` 检查不得调用安装命令；只允许使用短超时的只读命令或依赖链路检查。

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `DESIGN.md`
- `src/views/settings/DiagnosticsSettings.tsx`
- `src/views/settings/settingsLayout.tsx`
- `src/lib/api/diagnosticsApi.ts`
- `src-tauri/src/diagnostics.rs`
- `src-tauri/src/radar/github.rs`
- `src-tauri/src/skills/cli.rs`
- `src-tauri/src/skills/filesystem.rs`
- `src/App.test.tsx`

## Split Guidance

Classification: proposed split within diagnostics ownership.

Reason:

- `SettingsView.tsx` 仍是候选大文件，只应继续作为设置分类编排入口。
- `src-tauri/src/skills.rs` 已经很大，健康检查不能把诊断用的命令探测继续堆进 Skills facade。
- 当前已有 `DiagnosticsSettings.tsx`、`diagnosticsApi.ts`、`diagnostics.rs`，健康检查自然属于 diagnostics owner。

Code placement constraints:

| Module | Owner responsibility | May depend on | Must not own |
|---|---|---|---|
| `src/views/settings/DiagnosticsSettings.tsx` | 诊断页组合、触发健康检查、展示结果 | `diagnosticsApi`、settings layout、UI components | 外部命令细节、文件系统探测实现 |
| `src/lib/api/diagnosticsApi.ts` | 前端 diagnostics API 类型、Tauri 调用、Web preview fallback | Tauri invoke | UI 状态、展示文案细节 |
| `src-tauri/src/diagnostics.rs` | 诊断命令 facade 和 DTO | diagnostics owner 子模块、现有 radar/skills 可复用纯逻辑 | 大量命令执行细节 |
| `src-tauri/src/diagnostics/health.rs` | 健康检查聚合、命令版本探测、symlink 临时探测、工具目录可写性探测 | `std::process`、`tempfile`、现有 radar GitHub CLI 分类或公开 wrapper | Skills 安装/同步、Radar 数据同步、数据库读写 |
| `src-tauri/src/skills/cli.rs` | skills.sh CLI 相关纯工具函数 | 标准库命令执行 | 诊断结果聚合 UI 语义 |

Do not add to:

- 不把健康检查 UI 直接写进 `SettingsView.tsx`。
- 不把健康检查后端实现写进 `skills.rs` 或 `radar.rs` facade。
- 不创建 `utils`、`helpers`、`common`、`misc` 模块。

## Implementation Steps

1. `todo` 后端 DTO 与健康检查 command
   - 在 diagnostics owner 下定义 `HealthCheckResult`、`HealthCheckItem`、状态枚举和 `run_diagnostic_health_check` command。
   - Verification: TypeScript/Rust 类型映射清晰，command 注册编译通过。

2. `todo` 本机依赖检查
   - 检查 `node --version`、`npm --version`、`npx --version`，使用 Windows shim 规则。
   - 复用或暴露 `skills_cli_command_name`，避免重复 Windows `.cmd` 处理。
   - Verification: Rust 单测覆盖成功、缺失和版本输出清洗。

3. `todo` GitHub CLI 与 skills.sh 检查
   - GitHub CLI 复用现有检测语义。
   - skills.sh 使用短超时只读检查；如果该命令不稳定，则降级为“Node/npm/npx 可用，但 skills.sh 未确认”状态，不调用安装命令。
   - Verification: Rust 单测覆盖 missing、unauthenticated、ready、skills.sh 跳过/失败文案。

4. `todo` 权限与目录检查
   - 在临时目录中创建 source/target 并尝试目录 symlink，完成后清理。
   - 对 `settings.toolTargets` 中的目录做存在性和可写性检查；缺失显示 `跳过` 或 `缺失`，不创建。
   - Verification: Rust 单测使用 tempdir 覆盖可写目录、缺失目录、symlink fallback。

5. `todo` 前端 API 与 UI
   - `diagnosticsApi` 增加健康检查 API 和 Web preview fallback。
   - `DiagnosticsSettings` 增加“健康检查”section、开始检查按钮、loading 状态、逐项结果列表。
   - 结果行复用现有 settings row/table 视觉和 `StatusBadge`，路径/命令文本安全换行。
   - Verification: 前端测试覆盖点击检查、loading、结果渲染、Web preview fallback。

6. `todo` 文档与收尾
   - 更新 `CHANGELOG.md`。
   - 如新增 diagnostics 子模块或 API 入口，更新 `docs/ai/context-map.md`。
   - 实现完成后归档本计划。
   - Verification: Dev Flow docs validation 通过，或只剩既有无关 warnings。

## Verification

- `node_modules\\.bin\\tsc.cmd --noEmit`
- `node_modules\\.bin\\vitest.cmd run src/App.test.tsx`
- `node_modules\\.bin\\vite.cmd build`
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `node_modules\\.bin\\tauri.cmd build --no-bundle`
- 手动 UI 检查：
  - 诊断页默认不自动检查。
  - 点击“开始检查”后按钮进入 loading。
  - 结果行状态文字清晰，不只依赖颜色。
  - 长路径和命令输出不撑破设置页布局。

## Risks

- 外部命令可能很慢；后端检查必须设置短超时，不能卡住 UI。
- skills.sh 只读检查可能受网络影响；第一版必须把网络失败描述为“未确认/检查失败”，不能误报本机不可用。
- 符号链接权限探测必须只在临时目录内执行，不能影响用户真实 Skills 或工具目录。
- 工具目录可写性如果通过写入临时文件验证，必须删除临时文件；如果删除失败要在结果中说明。
- 复用 Radar GitHub CLI 逻辑时要避免把 Radar 同步行为引入诊断。

## Acceptance Criteria

- 诊断页出现“健康检查”区块，并且需要手动点击才运行。
- 检查结果覆盖 Node/npm/npx、GitHub CLI、skills.sh、符号链接权限和工具目录可写性。
- 所有检查结果都有中文状态和简短原因。
- 健康检查不修改用户真实配置、数据库或 Skills 内容。
- Web preview 下显示可理解的 fallback，不抛出未处理错误。
- 前端和 Rust 测试覆盖主要状态映射与失败路径。

## Artifact Routing

- Plan: `docs/plans/2026-06-28-settings-health-check.md`
- Changelog: implementation branch should update `CHANGELOG.md` because这是用户可见功能。
- Context map: implementation branch should update `docs/ai/context-map.md` if新增 diagnostics 子模块或 API entry。
- Capability docs: not required for first implementation unless health check behavior becomes a durable capability contract.
- ADR: not needed；这是诊断页内的普通功能扩展，不是硬不可逆架构决策。
- Design system impact: none；复用现有 settings layout、StatusBadge、Button，不新增项目级 UI 规则。

## Closeout

实现分支完成后应运行 `/dev-distill`：

- 归档或删除本计划。
- 根据实际新增模块更新 context-map。
- 如变更了长期 diagnostics 能力边界，再补 capability doc；否则不新增能力文档。
