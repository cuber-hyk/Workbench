---
artifact_type: plan
status: archived
created: 2026-06-30
updated: 2026-06-30
owner: codex
---

# 第三方来源跳转

## Goal

为后续通过 `skills.sh`、public GitHub Skill 导入和 GitHub 项目远程导入创建的记录保存可信来源 URL，并在对应列表与详情中提供系统浏览器跳转；历史记录和所有本地来源保持无跳转。

## Scope

- 为项目记录和 Skill 远程来源记录增加显式 `sourceUrl`。
- 新安装的 `skills.sh` Skill 保存其 skills.sh 详情页 URL。
- 新导入的 public GitHub Skill 保存与安装版本、Skill 目录对应的 GitHub URL。
- 新导入的 GitHub 项目保存规范化 GitHub 仓库主页 URL。
- 项目和本地 Skills 的列表操作区、详情区按 `sourceUrl` 是否存在展示来源跳转。
- 复用现有系统浏览器打开能力，并统一前端 API 的领域命名。
- 更新相关测试、能力文档、设计规则和变更日志。

## Non-goals

- 不回填、推断或修改任何历史项目和历史 Skill 的来源 URL。
- 不读取 Git `origin` 判断项目来源。
- 不为本地添加项目、本地 Skill、ZIP/文件夹导入 Skill、外部工具同步 Skill 提供来源跳转。
- 不为 Gitee 项目或其他托管平台增加来源跳转。
- 不改变远程更新、安装、克隆和本地内容所有权规则。
- 不新增来源编辑、重新绑定或手工补录功能。

## Assumptions And Decisions

- 用户已确认仅对功能上线后的新来源记录启用，不迁移历史数据。
- `sourceUrl` 使用非空字符串表示可信可跳转来源，空字符串表示没有来源入口，保持当前领域类型处理可空文本的风格。
- `projects.source_url` 与 `skill_sources.source_url` 均以 `NOT NULL DEFAULT ''` 增量添加；现有行因此保持空值。
- Skill 来源写入采用“仅新建时赋值”：`skill_sources` 冲突更新不覆盖 `source_url`。这样历史来源记录即使后续检查或执行更新，也不会被隐式补齐。
- GitHub 项目仅在创建新的远程项目记录时写入规范化 `https://github.com/<owner>/<repo>`；恢复历史缺失目录时沿用旧项目记录及其空来源。
- 新 GitHub Skill 使用导入时已解析的 owner、repo、安装 revision 和 `skillPath` 构造稳定 GitHub 目录 URL，避免跳转内容随分支变化。
- 新 `skills.sh` Skill 使用官方详情路由 `https://skills.sh/<owner>/<repo>/<skill-id>`，其组成来自已校验的市场 `source` 和 `skillId`。
- Gitee 远程导入继续可用，但 `sourceUrl` 保持空值。
- UI 复用现有 `ExternalLink`、`IconButton`、`ActionGroup` 和 `DetailHeader` 模式；来源按钮使用 Tooltip/`title`“查看来源”，不新增文字按钮。
- 保留现有 Tauri command `open_radar_link` 以维持 command 稳定性；前端 API 重命名为领域中性的 `openExternalLink`，Radar、项目和 Skills 共用同一实现。
- ADR gate：不需要。本次是现有来源元数据和打开链接能力的增量扩展，没有引入新的长期架构方向。

## Fact Sources

- `CONTEXT.md`：Skills 远程来源和本地优先边界。
- `docs/capabilities/project-management.md`：远程项目 URL 当前仅用于导入，不长期保存。
- `docs/capabilities/skills-management.md`：`skill_sources`、`skills_sh`、GitHub 导入和更新语义。
- `DESIGN.md`：行级操作、详情来源跳转、IconButton 和操作列可见性规则。
- `src-tauri/src/projects/db.rs`：`projects` schema、加载和 upsert 的事实源。
- `src-tauri/src/projects/remote_import.rs`：GitHub/Gitee URL 解析和远程项目记录创建路径。
- `src-tauri/src/skills/db.rs`、`src-tauri/src/skills/market.rs`：`skill_sources` schema 与持久化路径。
- `src-tauri/src/skills/github_import.rs`、`src-tauri/src/skills.rs`：GitHub 和 skills.sh 来源记录创建、检查及更新路径。
- `src/views/projects/ProjectsView.tsx`、`src/views/skills/SkillsView.tsx`：项目和本地 Skills 列表与详情入口。
- `src/views/skills/SkillsMarketView.tsx`：已存在的来源跳转 UI 模式。
- `src/lib/api/workbenchApi.ts`、`src-tauri/src/radar.rs`：现有外部 URL 打开边界。
- skills.sh 官方 API 文档：Skill 详情 URL 的 `https://skills.sh/<owner>/<repo>/<skill>` 路由。

## Split Guidance

- Required: no
- Classification: no split
- Reason: 项目和 Skills 后端已有职责明确的 owner 目录；UI 变化是现有视图中的小型展示扩展。
- Code-placement constraints:
  - 项目来源规范化留在 `src-tauri/src/projects/remote_import.rs`。
  - Skill 来源 URL 构造靠近各自导入记录创建逻辑，不创建泛化 `utils`。
  - 前端只复用现有 `workbenchApi` 和 UI 组件，不新增来源管理层。
- Deferred split trigger: 若实现需要新增跨平台外链协议、来源可编辑状态或三个以上托管平台，再单独评估共享来源模块。

## Steps And Verification

| ID | Status | Step | Verification |
|---|---|---|---|
| PLAN-1 | done | 先补充后端回归测试，固定历史行默认空来源、新 GitHub 项目规范化来源、Gitee/本地项目无来源，以及新 skills.sh/GitHub Skill 来源 URL 语义。 | 新测试在实现前按预期失败；最终 Rust 测试全部通过。 |
| PLAN-2 | done | 扩展项目数据模型与 SQLite schema，在新 GitHub 远程项目创建时写入规范化 `sourceUrl`，并让列表、保存编辑和历史恢复完整保留该字段。 | 旧 schema 行加载为空，新 GitHub 导入记录有 URL，Gitee 和历史恢复记录为空。 |
| PLAN-3 | done | 扩展 `skill_sources` 与 `SkillRecord` 的来源字段；仅在新 skills.sh 安装和新 GitHub 导入插入来源 URL，扫描结果按目录名关联来源，更新流程只保留已有值。 | 历史来源行和冲突更新保持空值，新记录返回对应来源 URL。 |
| PLAN-4 | done | 将前端 `openRadarLink` 收敛为 `openExternalLink` 并更新现有调用；在项目和本地 Skills 的列表操作区及详情区增加条件式 `ExternalLink` 图标入口，阻止列表行点击冒泡并保持无来源时不渲染。 | Vitest 覆盖项目、Skill 有/无来源显示与点击；全部 105 项前端测试通过。 |
| PLAN-5 | done | 检查项目操作列在默认窗口和窄窗口下的宽度、Tooltip、键盘焦点、浅色/深色主题及文本溢出，按现有 token 做最小样式调整。 | Playwright 在 1440x900 与 1024x768 验证操作完整、无横向溢出、无详情重叠，控制台无错误。 |
| PLAN-6 | done | 更新项目管理、Skills 管理、`DESIGN.md` 和 `CHANGELOG.md`，记录仅新记录启用及历史数据不回填的边界，并执行完整验证。 | 能力文档、设计规则和 Changelog 已更新；统一验证和 Release 构建通过。 |

## Acceptance Criteria

- 功能上线后新安装的 skills.sh Skill 在本地 Skills 列表和详情中可打开对应 skills.sh 详情页。
- 功能上线后新导入的 public GitHub Skill 可打开对应安装 revision 下的 Skill 目录。
- 功能上线后新导入的 GitHub 项目可打开规范化仓库主页。
- 历史项目、历史 Skill、本地来源、ZIP/文件夹来源、外部同步来源和 Gitee 项目均不显示来源入口。
- Skill 检查更新、执行更新或项目编辑不会意外为历史记录补写来源。
- 所有来源入口使用现有系统浏览器打开链路，非法或空 URL 不可触发打开。
- 项目和 Skills 操作列在支持的桌面宽度下保持完整可见。
- 自动化测试、构建验证和文档检查全部通过且无跳过。

## Risks

- 项目 `ProjectRecord` 是多个测试和 mock 的公共类型，新增必填字段会产生较广但机械的编译修正；只补充 `sourceUrl`，不趁机重构模型。
- GitHub ref 或路径包含特殊字符时必须按 URL path segment 编码，不能直接字符串拼接后假设有效。
- `skill_sources` upsert 同时服务安装和更新；若错误地在冲突更新中写 `source_url`，会违反不修改历史 Skill 的确认决策。
- 项目操作列当前已有多个高频动作，增加图标后可能需要最小调整现有列宽，不能隐藏操作或引入横向滚动。

## Artifact Routing

- Plan: `docs/plans/2026-06-30-third-party-source-links.md`
- Source audit: none
- Covered findings: none
- Deferred findings: none
- Capability docs: update `docs/capabilities/project-management.md` and `docs/capabilities/skills-management.md`
- Design system impact: update `DESIGN.md`，将可信第三方来源的条件式跳转固化为项目和本地 Skills 的复用规则
- Context map: no update expected；未新增长期入口或模块
- Tests: update Rust 单元/集成测试与 `src/App.test.tsx`
- Changelog: needed；新增用户可见来源跳转并扩展本地数据 schema
- Distill: needed；实现完成后同步能力文档、设计规则并关闭本计划
- ADR gate: not needed；现有来源模型的增量扩展

## Completion

当 PLAN-1 至 PLAN-6 全部完成、没有 blocked 步骤、验收标准逐项满足、验证结果被记录，并由 `/dev-distill` 将本计划状态关闭后，本任务完成。

## Verification Results

- `pnpm verify`：通过；前端 105 项测试、Rust 122 项测试、Rustfmt 和 Clippy 均无失败或跳过。
- `pnpm tauri:verify-build`：通过；生成 `src-tauri/target/release/workbench.exe`。
- Playwright：1440x900 与 1024x768 下项目和 Skills 来源入口均可见；页面无横向溢出，窄屏列表与详情重叠为 0px，控制台无错误。
