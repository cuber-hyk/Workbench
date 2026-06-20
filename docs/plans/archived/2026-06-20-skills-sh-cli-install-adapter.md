---
artifact_type: plan
status: archived
created: 2026-06-20
updated: 2026-06-20
owner: codex
---

# skills.sh CLI 混合安装适配计划

## Goal

将 Workbench 的 `skills.sh` 市场安装、更新检查和更新执行切换为“隔离调用官方 `skills` CLI 提取 Skill 内容，再由 Workbench 复制到统一 Skills 根目录并维护数据库记录”的单一路径，移除当前自研 GitHub 下载、解压和仓库遍历安装逻辑，同时统一 Node/npm、网络、CLI 失败和安装边界提示。

## Scope

- 替换 `src-tauri/src/skills.rs` 中市场安装使用的 `download_github_skill_with_progress` 路径。
- 替换 `check_skill_updates` 和 `update_skill_from_market` 使用的自研远端下载/hash 路径，避免保留旧安装/更新双轨逻辑。
- 保留 Workbench 的统一 Skills 根目录、`skill_sources` 记录、分类、启用、冲突、删除和备份边界。
- 保留市场页现有列表 + 详情 + 行级安装进度布局，不新增独立页面。
- 对 Node/npm/npx 缺失、`skills` CLI 拉取失败、网络失败、找不到 Skill、临时目录提取失败、统一根目录冲突等情况提供可理解、可操作的中文提示。
- 同步审查并统一 Skills 市场页的图标、按钮、状态徽标、操作列控件尺寸和间距，避免“状态像按钮”“按钮尺寸跳变”“同类操作图标规格不一致”等问题。
- 更新能力文档、ADR、CHANGELOG 和测试。

## Non-Goals

- 不让 `skills` CLI 直接安装到用户真实 Codex/Claude/OpenCode 等 Agent 目录。
- 不把 `skills` CLI 的输出作为唯一事实来源；最终以临时安装目录中的 `SKILL.md` 和文件内容为准。
- 不新增通用远程来源框架；本次仍只处理 `skills.sh` 来源。
- 不新增批量安装、安装取消、后台队列或代理配置 UI。
- 不实现字节级下载进度；市场安装仍展示阶段百分比。
- 不保留当前自研 GitHub zip 下载/解压/遍历作为 fallback。失败时明确告知原因，而不是静默切回旧逻辑。

## Assumptions And Decisions

- 用户已确认采用混合方案：官方 `skills.sh` 工具负责 Skill 内容选择/提取，Workbench 控制最终安装路径和元数据。
- 用户已确认移除自研下载逻辑，避免旧逻辑和新逻辑并存。
- `skills.sh` CLI 通过 `npx -y skills add <owner/repo> --skill <skillId> -g --agent codex -y --copy` 调用；`HOME`、`USERPROFILE`、`APPDATA` 等环境变量指向 Workbench 创建的临时隔离目录。
- 临时安装结果从 `<temp-home>/.agents/skills/<skillId>` 读取；只有确认存在 `SKILL.md` 后才复制到统一 Skills 根目录。
- Workbench 继续写入 `skill_sources`，`package_slug` 仍用 `<source>/<skillId>`，`repo_url` 仍来自 GitHub source，`skill_path` 记录 CLI 提取后的目录名或相对来源说明。
- 更新检查通过隔离 CLI 提取远端 Skill 后计算内容 hash；更新执行先备份本地统一根目录旧版本，再用 CLI 提取内容替换。
- 市场项是否可安装仍以 GitHub `owner/repo` 来源为准；非 GitHub 来源继续显示“不支持”，不尝试调用 CLI。
- UI 提示分类采用现有模式：行级按钮显示进行中状态，市场页 inline warning 承载可重试/可操作错误，Toast 只承载非阻断结果通知，确认弹窗只用于删除/覆盖等高副作用操作。
- UI 控件一致性采用语义优先：可点击命令使用 Button/IconButton，稳定状态使用 StatusBadge/SkillStatusIndicator，非可点击状态不得做成按钮视觉；同一列表操作列内的安装、卸载、不支持、安装中应共享高度、字号、图标尺寸和最小宽度规则。

## Decision Notes

- ADR gate: needed. 现有 `docs/adr/2026-06-19-skills-sh-self-managed-install.md` 明确接受“不依赖 `npx skills`”的自管下载安装方案，本次会反转该决策。实现分支必须更新该 ADR 或新增替代 ADR，并通过 `/dev-distill` 运行 ADR gate。
- Design system impact: update. 用户明确要求各种提示信息和提示样式布局尽可能统一；实现分支需要通过 `/dev-design-system` 检查，必要时把“提示分类与组件复用规则”补充到 `DESIGN.md`。

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/capabilities/skills-management.md`
- `DESIGN.md`
- `docs/adr/2026-06-19-skills-sh-self-managed-install.md`
- `src-tauri/src/skills.rs`
- `src-tauri/src/lib.rs`
- `src/App.tsx`
- `src/lib/api/workbenchApi.ts`
- `src/components/ui.tsx`
- `src/styles.css`
- `src/App.test.tsx`

## Implementation Plan

1. `done` 现状锁定和测试基线。
   - 验证：新增或调整 Rust 单元测试，证明当前 `download_github_skill*` 会被替换为 CLI 适配器入口。
   - 验证：保留既有市场安装、更新检查、更新执行、来源记录、删除来源记录相关测试语义。
   - 验证：补一个回归用例，模拟包含 `node_modules/.bin` 或不适合 Windows 路径的仓库内容不再进入 Workbench 自研遍历路径。

2. `done` 新增隔离 `skills` CLI 适配器。
   - 实现：在 `src-tauri/src/skills.rs` 中新增小而明确的内部函数，例如 `extract_skill_with_skills_cli(source, skill_id, on_progress)`。
   - 实现：创建临时 HOME/USERPROFILE/APPDATA，调用 `npx -y skills add <source> --skill <skillId> -g --agent codex -y --copy`，设置超时和受控环境变量。
   - 实现：运行前做 Node/npm/npx 预检；缺失时返回明确中文错误，不进入安装。
   - 实现：CLI 成功后只从临时 `.agents/skills/<skillId>` 读取内容，验证 `SKILL.md` 存在，再计算 hash。
   - 实现：不解析 CLI 彩色 UI 作为核心依据；CLI stdout/stderr 只用于错误诊断摘要。
   - 验证：Rust 单元测试覆盖命令构造、隔离目录解析、缺失 `SKILL.md`、CLI 失败输出摘要、临时目录清理边界。

3. `done` 替换安装、更新检查和更新执行入口。
   - 实现：`install_skill_from_market_sync` 使用 CLI 提取目录，复制到统一 Skills 根目录，写入 `skill_sources`。
   - 实现：`check_skill_updates` 使用 CLI 提取远端内容并对比 hash，更新 `remote_ref` 和 `last_checked_at`。
   - 实现：`update_skill_from_market` 使用 CLI 提取远端内容，hash 不同时先备份本地目录，再替换统一根目录并更新来源记录。
   - 实现：删除 `download_github_skill`、`download_github_skill_with_progress` 及只服务旧逻辑的 zip 下载/解压限制常量和测试，避免双轨残留。
   - 验证：后端测试确认 market install/update 不再引用旧下载函数；`rg "download_github_skill"` 应无生产代码命中。

4. `done` 统一错误分类和用户提示。
   - 实现：后端将错误分类为 `missing_runtime`、`network_or_registry`、`cli_failed`、`skill_not_found`、`target_conflict`、`unsupported_source`、`io_failed` 等可映射文案；如果不改 API 类型，至少统一错误消息前缀和中文操作建议。
   - 实现：市场页 inline warning 继续显示安装/刷新/详情错误，并提供“重试”；错误内容包含下一步动作，例如安装 Node.js LTS、检查网络或稍后重试。
   - 实现：Toast 只显示简短结果，例如“Skill 已安装”或“安装失败：未检测到 Node.js”；详细修复建议放在市场页 warning。
   - 实现：详情页安全提示更新为“Workbench 使用官方 skills.sh CLI 提取 Skill，但第三方 Skill 仍需用户自行信任来源”。
   - 验证：前端测试覆盖缺少 Node/npm、网络失败和 CLI 找不到 Skill 的提示文案；样式复用 `.warning`、`StatusBadge`、Toast，不新增页面专用提示样式。

5. `done` 统一市场页按钮、图标和状态视觉。
   - 实现：审查 Skills 市场页顶部操作按钮、筛选工具栏按钮、市场行级安装/卸载按钮、不可安装状态、详情区来源跳转 IconButton、状态徽标和 warning 提示块。
   - 实现：将“未安装/已安装/可更新/不支持/检查失败”等稳定状态统一为状态徽标语义，不让不可点击状态呈现为主按钮或危险按钮。
   - 实现：行级操作列只保留真正可点击的 Button；不可安装时展示同尺寸但明确不可点击的状态呈现，或使用禁用 Button 但外观必须和状态语义一致，不能比可点击操作更突出。
   - 实现：统一同一区域内 lucide 图标尺寸、按钮高度、内边距、最小宽度和文字权重；优先复用 `Button`、`IconButton`、`StatusBadge`、`ActionGroup` 和现有 `.row-actions` 规则。
   - 验证：前端测试或 DOM 断言覆盖不可安装项不会暴露为可点击安装/卸载按钮；必要时用浏览器截图检查市场页顶部按钮、行级按钮、状态徽标和详情图标在深色主题下对齐一致。

6. `done` 更新文档、ADR 和发布说明。
   - 实现：更新 `docs/capabilities/skills-management.md`，移除“不依赖 `npx skills`”和自研下载限制描述，记录混合安装路径、Node/npm 依赖、隔离目录和统一根目录所有权。
   - 实现：更新或替代 `docs/adr/2026-06-19-skills-sh-self-managed-install.md`，说明从自研下载迁移到 CLI 混合适配的原因、替代方案和后果。
   - 实现：如 UI 提示分类规则被确认为项目级规则，更新 `DESIGN.md` 的提示/Toast/inline warning 规则。
   - 实现：更新 `CHANGELOG.md` 的 `Unreleased`，记录市场安装改用官方 `skills.sh` 提取并改善 Node/npm/网络错误提示。
   - 验证：运行 Dev Flow 文档校验；如 ADR 或 context map 路由需要调整，同分支完成。

7. `done` 完整验证和真实场景抽样。
   - 验证：`pnpm test -- src/App.test.tsx`。
   - 验证：`cargo test --manifest-path src-tauri/Cargo.toml skills -- --nocapture` 或更精确的新增后端测试集合。
   - 验证：`pnpm verify`。
   - 验证：在隔离环境手动执行或通过后端测试模拟安装 `heygen-com/hyperframes@hyperframes`，确认不触发 `node_modules/.bin/puppeteer` Windows 路径错误。
   - 验证：手动检查市场页缺少 Node/npm、网络失败、CLI 失败、目标已存在四类提示使用统一布局。

## Error And Prompt Taxonomy

- 行级状态：安装/更新执行中，显示在市场或更新列表操作列；按钮禁用并展示阶段百分比。
- Inline warning：当前页面内可恢复或需用户处理的错误，例如 Node/npm 缺失、网络失败、CLI 找不到 Skill、目标目录冲突；保留重试或相关操作按钮。
- Toast：非阻断短反馈，例如安装完成、更新完成、检查失败摘要；不承载长修复步骤。
- 状态徽标：稳定状态，例如未安装、已安装、可更新、不支持、检查失败；不能只靠颜色表达。
- 确认弹窗：删除、覆盖、替换、迁移等高副作用操作；本次安装流程不新增确认弹窗。

## Control And Icon Consistency Rules

- 顶部页面操作：使用文字按钮 + 16px 左侧图标，按钮高度一致；主要动作用 primary，次要动作用 default。
- 工具栏操作：搜索、筛选、刷新保持同一控件高度；刷新使用 default Button，不和行级操作混用特殊尺寸。
- 行级操作列：安装、卸载、安装中共享同一按钮高度、字号、图标尺寸和最小宽度；按钮点击必须阻止行选择。
- 稳定状态：未安装、已安装、可更新、不支持、检查失败使用状态徽标或禁用态状态控件，不使用醒目的可点击按钮视觉。
- 详情区图标按钮：仅用于打开来源等紧凑操作，使用统一 `IconButton` 尺寸，不和文字 Button 混排。
- Warning/风险提示：使用统一 `.warning` 或后续抽取的提示组件，不在市场页单独写大色块样式。

## Risks

- `npx skills` 行为或输出未来变化；缓解方式是只依赖临时安装目录结构和 `SKILL.md`，不把 CLI 输出当事实源。
- 用户机器没有 Node.js/npm/npx；必须前置检测并给出明确操作建议。
- 网络可达性涉及 npm registry、GitHub 和 skills.sh；错误提示需要避免笼统的“安装失败”。
- CLI 可能写入真实用户目录；必须用隔离 HOME/USERPROFILE/APPDATA 并测试 Windows 路径。
- CLI 执行耗时可能超过当前阶段进度预期；需要设置合理超时和阶段反馈。
- 更新检查如果逐项调用 CLI 会比自研 hash 下载更慢；批量检查需要保留逐项结果，单项失败不阻塞其他项。
- 反转既有 ADR 是长期决策变更，文档和能力说明必须同分支更新。

## Acceptance Criteria

- 市场安装 `heygen-com/hyperframes@hyperframes` 不再遍历仓库内 `packages/producer/node_modules/.bin/puppeteer`，并能从 CLI 提取后的 Skill 目录安装到 Workbench 统一 Skills 根目录。
- 生产代码不再保留自研 GitHub zip 下载、解压、仓库遍历安装/更新逻辑。
- Workbench 仍能控制最终安装路径、来源记录、卸载、更新检查、更新执行、备份和启用逻辑。
- 缺少 Node/npm/npx 时，用户在市场页看到明确中文提示和下一步建议。
- 网络或 CLI 失败时，市场页提示能区分大类原因，并提供重试入口。
- 非 GitHub 来源仍保持不支持安装，不尝试调用 CLI。
- 市场安装和更新仍同一时间按现有任务约束执行，页面切换后仍可恢复进度。
- UI 提示样式符合 `DESIGN.md` 的 Toast、warning、状态徽标和弹窗分工。
- Skills 市场页的顶部操作按钮、筛选工具栏按钮、行级操作按钮、不可安装状态、详情图标按钮在尺寸、图标规格、可点击语义和视觉权重上保持一致。
- `pnpm verify` 和 Dev Flow 文档校验通过，或只剩与本任务无关的既有 warning 并明确记录。

## Artifact Routing

- Plan: `docs/plans/archived/2026-06-20-skills-sh-cli-install-adapter.md`
- Code: `src-tauri/src/skills.rs`, `src/App.tsx`, `src/lib/api/workbenchApi.ts` as needed
- Tests: `src/App.test.tsx`, `src-tauri/src/skills.rs` tests
- Capability: update `docs/capabilities/skills-management.md`
- ADR: update or replace `docs/adr/2026-06-19-skills-sh-self-managed-install.md`
- Design: update `DESIGN.md` if implementation establishes reusable提示分类规则 or button/icon/status consistency rules beyond existing rules
- Changelog: update `CHANGELOG.md`
- Context map: update only if new core files or ADR paths are introduced

## Closeout

- 已通过 `/dev-branch` 完成实现、验证、设计系统 gate、changelog gate、distill/ADR gate 和 review gate。
- 验证结果：`pnpm test -- src/App.test.tsx --runInBand` 通过，`pnpm verify` 通过，手动隔离测试确认 `hyperframes` 可通过官方 CLI 提取安装且不触发 Windows `node_modules/.bin/puppeteer` 路径错误。
- 文档结果：能力文档、ADR、CHANGELOG、CONTEXT、DESIGN 和 context map 已更新；旧自研安装 ADR 已归档。
