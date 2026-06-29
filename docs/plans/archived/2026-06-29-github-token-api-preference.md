---
artifact_type: plan
status: archived
created: 2026-06-29
updated: 2026-06-29
owner: dev-branch
---

# GitHub Token API 优先计划

## 目标

为 GitHub Skill 导入和 GitHub 来源更新增加可选 GitHub Token 配置：用户配置 token 后优先使用 GitHub API 获取 public 仓库内容和引用信息；未配置 token 时保持现有 `git clone --depth 1` 路径；token 不在 UI 回显、不写日志、不进入诊断复制内容。

## 范围

- 设置页 `Skills` 分类新增 GitHub 来源配置区，支持保存、清除和测试 GitHub Token。
- 后端把 token 第一版保存到本地 SQLite `app_settings`，只返回是否已配置，不向前端回传明文。
- GitHub Skill 导入和 GitHub 分支来源更新读取本地 token：
  - 有 token：优先调用 GitHub API 获取 repo/default branch/ref，并通过 GitHub API zipball 下载仓库内容到隔离临时目录。
  - 无 token：沿用当前本机 `git clone --depth 1`。
  - API 网络类失败可降级到 `git clone`；401、token 403 权限或失效类错误必须明确失败，不静默降级掩盖配置问题。
- 固定 commit 链接继续使用隔离归档下载与既有限制。
- 更新前端类型、API、测试、能力文档、上下文文档和变更日志。

## 非目标

- 不支持 private GitHub 仓库。
- 不接入 Windows Credential Manager、macOS Keychain 或 Linux Secret Service；系统凭据存储作为后续增强。
- 不把 token 用于 `git clone` 凭据或私有仓库访问。
- 不把 GitHub CLI 登录态作为本功能 token 来源。
- 不改变 `skills.sh` 市场安装和更新的官方 CLI 适配路径。
- 不把 token 加入诊断信息、日志、toast 详情或错误堆栈。

## 假设与决策

- 决策：第一版 token 存入本地 SQLite `app_settings`，这是用户确认的简化路线；风险通过 UI 不回显、诊断不复制、日志脱敏和后续凭据存储迁移说明控制。
- 决策：只支持 public GitHub 仓库；token 只用于提高 API 限额和稳定默认分支/ref 解析，不改变访问边界。
- 决策：前端只知道 `githubTokenConfigured: boolean`，不会从后端读取 token 明文。
- 决策：保存 token 时 trim 输入；空 token 等价于清除。
- 决策：API 请求统一设置 `Authorization: Bearer <token>`、GitHub JSON `Accept` 和 Workbench `User-Agent`。
- 决策：401 和明确 token 权限/失效 403 返回“Token 无效或权限不足”；匿名限流或网络失败在无 token 路径中继续提示 clone fallback 或 clone 错误。
- 决策：不需要新增 ADR；这是现有 GitHub public 来源适配的凭据配置增强，不改变统一 Skills 根目录、来源记录或更新语义。若后续接入系统凭据存储，再由 dev-distill 评估 ADR gate。

## 事实来源

- `AGENTS.md`：默认中文、简单优先、外科手术式修改、计划和分支工作流。
- `CONTEXT.md`：本地优先、SQLite、统一 Skills 根目录；当前关于在线来源的旧表述需要实现后收口。
- `docs/ai/context-map.md`：Settings、Skills、API、类型和后端入口。
- `docs/capabilities/skills-management.md`：GitHub public 导入、来源更新、数据所有权和同步边界。
- `DESIGN.md`：设置页使用专业软件偏好设置布局，路径/设置行紧凑组织。
- `src-tauri/src/skills/github_import.rs`：GitHub URL 解析、仓库获取、候选扫描、导入和远端更新提取 owner。
- `src-tauri/src/skills/db.rs`：`app_settings` 读写和 settings 默认值 owner。
- `src-tauri/src/skills.rs`：Tauri command facade 和 `get_skills_state`。
- `src/views/settings/SettingsView.tsx`：设置页 `Skills` 分类 UI owner。
- `src/lib/api/workbenchApi.ts`、`src/lib/types/domain.ts`：前端 API 与 DTO owner。
- `src/App.test.tsx`：Settings 和 GitHub Skill 导入交互测试入口。

## Split Guidance

Dev Split 结论：本任务不做结构性拆分，但必须约束代码放置。

- `src-tauri/src/skills.rs` 已是 large-file 候选，只允许增加薄 command wrapper，不放 GitHub API 请求、token 解析或存储细节。
- `src-tauri/src/skills/github_import.rs` 继续拥有 GitHub 仓库获取策略、API/clone fallback、zipball 下载和更新提取逻辑。
- `src-tauri/src/skills/db.rs` 拥有 `app_settings` 中 token 的读取、保存、清除和“是否配置”判断。
- `src-tauri/src/skills/types.rs` 只放必要 DTO，不放行为逻辑。
- `src/views/settings/SettingsView.tsx` 可以增加一个紧凑 GitHub 来源设置分区；如果状态或交互明显变复杂，再抽到 `src/views/settings/GithubSourceSettings.tsx`，不得创建 generic settings utils。
- `src/App.tsx` 只负责把设置变更 API 接入现有刷新/toast 编排，不承载 token 表单状态。
- `src/lib/api/workbenchApi.ts` 只新增调用边界和 preview fallback，不放 UI 策略。

## 执行步骤与验证

| ID | 状态 | 步骤 | 验证 |
|---|---|---|---|
| PLAN-1 | done | 固化 token 设置模型：在后端增加 `github_api_token` app setting 读写、清除、配置状态返回和测试连接 DTO；`SkillsState.settings` 只返回是否已配置。 | Rust 单测覆盖空值不算已配置；状态 DTO 不回传 token 明文。 |
| PLAN-2 | done | 增加 GitHub API 请求路径：有 token 时通过 API 解析 repo/default branch/ref，并使用 API zipball 获取仓库内容；无 token 继续走 `git clone --depth 1`；鉴权错误 fail loud，非鉴权 API 失败可降级 clone。 | Rust 单测覆盖 GitHub API ref 路径编码；既有 GitHub 导入测试覆盖 clone/固定版本路径。 |
| PLAN-3 | done | 接入导入和更新流程：`inspect_github_skill_import`、`import_github_skills`、GitHub 来源更新检查和更新执行共用同一仓库准备策略，保持 `.git` 元数据排除和根目录 Skill 目录名规则。 | 目标 Rust GitHub 测试覆盖扫描、导入来源记录、固定版本不可更新、`.git` 不计入等既有行为。 |
| PLAN-4 | done | 设置页新增 GitHub 来源配置区：显示已配置/未配置状态，提供 password 输入、保存、清除、测试按钮；输入不回显已保存 token。 | React 测试覆盖已配置状态、输入不回显、测试/保存/清除调用。 |
| PLAN-5 | done | 更新前端 API、类型和 preview fallback：新增 token 配置命令调用，`AppSettings` 增加 `githubTokenConfigured`，preview 数据保持无 token。 | `pnpm exec tsc --noEmit` 通过；React 目标测试通过。 |
| PLAN-6 | done | 文档和变更日志收口：更新 `CHANGELOG.md`、`docs/capabilities/skills-management.md`、`docs/ARCHITECTURE.md`、`docs/ai/context-map.md`、`CONTEXT.md`，记录 token 存储边界和系统凭据存储后续方向。 | 文档不再声称 `skills.sh` 是唯一在线 Skills 来源；Dev Flow docs validation 进入最终验证。 |
| PLAN-7 | done | 完整验证和人工检查。 | `pnpm verify` 通过；Dev Flow docs validation 通过，仅保留与本次无关的历史 warning。 |

## 边界情况清单

- 用户未配置 token：现有 Git clone 导入和更新路径保持可用。
- 用户保存空白 token：后端清除 token，状态变为未配置。
- token 无效、过期或缺少可读 public repo 能力：设置页测试失败；GitHub 导入和更新返回明确错误，不输出 token。
- GitHub API 返回匿名或非鉴权限流：无 token 时不调用 API；有 token 且判断为 token 限流时提示 token 限流或权限问题。
- GitHub API 网络失败但 token 格式存在：允许降级 clone 时必须在错误路径中不暴露 token。
- git 不可用但 token 可用：API zipball 路径仍可导入 public 仓库。
- token 已配置但用户想临时不用：清除 token 后回到 clone 路径；本计划不做“临时禁用”开关。
- 诊断复制信息：不得包含 token 或 token 长度。
- 日志和错误：不得包含 `Authorization` header 或 token 原文。
- Web preview：不持久保存真实 token，只模拟已配置/未配置状态。

## 验收标准

- 设置页 Skills 分类能配置、清除和测试 GitHub Token。
- UI 只显示 token 是否已配置，不回显保存过的 token。
- 后端本地 SQLite 保存 token，但任何 `get_skills_state`、诊断和错误信息都不返回明文 token。
- 配置 token 后，GitHub Skill 导入和 GitHub 来源更新优先走 GitHub API 仓库获取路径。
- 未配置 token 时，现有 `git clone --depth 1` 导入和更新路径保持不变。
- token 鉴权失败不会静默降级为 clone 并误导用户。
- public-only 边界保持不变；private repo 不作为本次支持范围。
- `pnpm verify` 通过。

## 交付物路由

- Plan：`docs/plans/2026-06-29-github-token-api-preference.md`
- Source audit：无
- Covered findings：无
- Deferred findings：系统凭据存储后续单独规划。
- Capability docs：更新 `docs/capabilities/skills-management.md`
- Architecture docs：更新 `docs/ARCHITECTURE.md`
- Context map：如新增 settings 子组件或 GitHub API owner 函数，更新 `docs/ai/context-map.md`
- Context：更新 `CONTEXT.md` 中在线 Skills 来源事实
- Changelog：需要；这是用户可见的 GitHub 来源配置和请求策略变化。
- Tests：需要；Rust token/API 策略测试和 React 设置页交互测试。
- Distill：需要；实现完成后归档或更新本计划，收口能力文档和上下文。
- ADR gate：暂不需要；后续系统凭据存储或 private repo 支持再评估。
- Design system impact：none；复用设置页现有分区、设置行、状态徽标和按钮模式。

## 完成条件

用户可以在设置页配置 GitHub Token；配置后 public GitHub Skill 导入和 GitHub 分支来源更新优先使用 GitHub API，未配置时保持 git clone 路径；token 不回显、不进诊断复制、不出现在日志或错误中；测试、文档、变更日志和验证命令完成。
