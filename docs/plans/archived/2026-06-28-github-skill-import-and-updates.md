---
artifact_type: plan
status: archived
created: 2026-06-28
updated: 2026-06-28
owner: dev-branch
---

# GitHub Skill 导入与来源更新计划

## 目标

为 Skills 管理增加 public GitHub 链接导入能力：Workbench 获取仓库内容、扫描标准 `SKILL.md` 目录、展示候选预览并由用户勾选导入；同时把现有 `skills.sh` 更新页泛化为来源更新能力，让 `skills_sh` 和可重新定位的 `github` 来源支持检查更新与更新执行。

## 范围

- 支持 public GitHub URL 导入：
  - `https://github.com/<owner>/<repo>`
  - `https://github.com/<owner>/<repo>/tree/<ref>/<path>`
  - `https://github.com/<owner>/<repo>/blob/<ref>/<path>/SKILL.md`
- 后端通过本机 `git clone --depth 1` 获取 public GitHub 仓库到隔离临时目录；commit 固定版本链接使用 GitHub codeload ZIP 直下。
- 前端展示扫描候选、`SKILL.md` 预览、目录路径、文件数量、大小、脚本提示和冲突状态。
- 用户勾选一个或多个候选后导入；导入单位固定为 `SKILL.md` 所在目录整体。
- 仓库根目录存在 `SKILL.md` 时，允许把整个仓库根目录作为一个 Skill 候选导入。
- GitHub 导入写入来源记录，记录 repo、ref、commit、skill path 和内容 hash。
- 更新检查从“仅 skills.sh”泛化为“来源更新”：
  - `skills_sh` 沿用现有 CLI 提取和 hash 比较逻辑。
  - `github` 分支来源重新下载同一 repo/ref/path 并计算 hash。
- 更新执行前备份统一 Skills 根目录中的旧版本，只替换统一根目录内容，不自动重同步已启用的 Copy 副本。
- 更新 UI 和文案，避免继续写死“仅管理从 skills.sh 安装的 Skill”。
- 更新能力文档、上下文索引、测试和变更日志。

## 非目标

- 不支持私有 GitHub 仓库。
- 不集成 Claude SDK、Codex SDK 或其他 Agent 辅助安装。
- 不支持没有 `SKILL.md` 的目录导入。
- 不支持用户自由勾选任意文件或文件夹拼装 Skill。
- 不执行仓库内脚本、安装命令、构建命令或测试命令。
- 不自动启用导入后的 Skill。
- 不把 GitHub 直连导入作为 `skills.sh` 的 fallback；两者是不同来源类型。
- 不支持 GitHub tag 或 commit 固定版本的更新检查。
- 不支持本地 ZIP、文件夹导入、外部工具目录同步来源的更新检查。

## 假设与决策

- 决策：第一版只支持 public GitHub 仓库，失败时返回明确的网络、权限或仓库不存在错误。
- 决策：标准 Skill 的唯一判定条件是目录内存在 `SKILL.md`；导入范围是该目录整体。
- 决策：用户必须先预览候选并勾选，Workbench 不自动安装扫描到的全部候选。
- 决策：仓库根目录只有在存在 `SKILL.md` 时才可作为“整个仓库安装”候选。
- 决策：不允许用户从候选目录中再手动挑文件；这样可以保持相对路径、资源和后续更新路径稳定。
- 决策：GitHub URL 指向 branch 或默认分支时支持更新检查；指向 tag 或 commit 时视为固定版本，不参与更新。
- 决策：更新能力按来源能力判断，不按页面入口判断；只有可重新定位和可复现提取路径的远程来源才支持更新。
- 决策：`skills_sh` 和 `github` 同处来源更新页，但各自使用独立提取逻辑。
- 决策：GitHub 直连导入不依赖 Node.js、npm、npx；`skills_sh` 继续依赖现有 CLI 适配。
- 决策：GitHub 来源记录复用或扩展 `skill_sources`，但必须能区分来源类型、固定版本和可更新分支来源。
- 决策：不需要新增 ADR；这是新增来源适配和更新页泛化，不改变统一 Skills 根目录作为真实来源的长期架构。若实施中决定引入通用远程包协议，再重新评估 ADR。

## 已知不确定性

- GitHub public 分支来源已改为优先使用本机 Git 浅克隆，避免依赖未认证 GitHub REST API 限额；commit 固定版本仍使用 codeload ZIP 直下。
- GitHub 默认分支解析由 `git clone` 交给 Git 处理；后续若加入 GitHub Token，可在 token 存在时优先走 GitHub API。
- `skill_sources` 当前为 `skills.sh` 设计，可能需要增加字段或重新解释 `package_slug`、`installed_ref`、`remote_ref`；迁移必须保持现有 `skills_sh` 记录可读。
- GitHub 仓库可能很大；需要限制下载大小、解压路径和扫描数量，避免 UI 长时间等待或磁盘占用异常。

## 事实来源

- `CONTEXT.md`：Skills 使用 `~/.workbench/skills` 作为统一真实来源；`skills.sh` 是当前唯一在线来源。
- `docs/capabilities/skills-management.md`：Skills 导入、来源记录、更新检查、备份、启用和删除边界。
- `docs/adr/2026-06-20-skills-sh-cli-adapter.md`：`skills.sh` 市场安装和更新必须通过官方 CLI 混合适配，不走自研 GitHub zip fallback。
- `docs/ai/context-map.md`：Skills 前端、后端、类型和能力文档入口。
- `src-tauri/src/skills.rs`、`src-tauri/src/skills/`：当前 Skills command facade、导入、市场、CLI、来源记录、文件系统和更新逻辑。
- `src-tauri/src/skills/types.rs`：`SkillSourceRecord`、`SkillUpdateStatus`、`SkillUpdateState`、市场和导入 DTO。
- `src/views/skills/SkillsView.tsx`、`src/views/skills/SkillUpdatesView.tsx`、`src/views/skills/SkillsMarketView.tsx`：Skills 本地、市场和更新页编排。
- `src/lib/api/workbenchApi.ts`、`src/lib/types/domain.ts`：前端 API 与领域类型边界。

## Split Guidance

Dev Split 结论：`src-tauri/src/skills/` 与 `src/views/skills/` 按默认阈值扫描没有大文件候选；本任务不需要先做结构性拆分，但必须约束新代码放入明确 owner 模块。

- 后端 command facade 保持在 `src-tauri/src/skills.rs`，只注册命令和做薄编排。
- GitHub URL 解析、archive 下载、解压安全和候选扫描应放入 `src-tauri/src/skills/` 下具名模块，例如 `github_import.rs`；不得新增 `utils`、`helpers`、`common`、`misc`。
- 来源更新泛化应优先放在现有 `market.rs` / `cli.rs` 周边或新增职责明确的 `updates.rs`，不要继续扩大 `skills.rs`。
- 文件复制、替换、备份和 hash 继续复用现有 `filesystem.rs`、`importer.rs` 和 `directory_content_hash`。
- 前端 GitHub 导入弹窗放在 `src/components/dialogs/skills/`；更新页文案和来源展示留在 `src/views/skills/SkillUpdatesView.tsx`。
- 如果实施中发现 `SkillsView.tsx` 需要承载大量 GitHub 导入状态，应把表单、候选选择和预览状态封装在导入弹窗内，避免把页面编排变成状态中心。

## 执行步骤与验证

| ID | 状态 | 步骤 | 验证 |
|---|---|---|---|
| PLAN-1 | done | 固化来源模型：扩展 `skill_sources` 语义或 schema，明确 `skills_sh`、`github`、固定版本和不可更新来源的状态规则。 | Rust schema 测试覆盖旧 `skills_sh` 记录仍可读取；GitHub 来源记录能保存 repo/ref/commit/path/hash。 |
| PLAN-2 | done | 实现 GitHub URL 解析和 public 仓库获取：支持 repo、tree、blob `SKILL.md` 链接，拒绝非 GitHub、非法 owner/repo、私有或不可访问仓库。 | Rust 单元测试覆盖 URL 解析、非法 URL、branch/path、blob `SKILL.md`、下载失败错误文案。 |
| PLAN-3 | done | 实现安全仓库读取和 `SKILL.md` 候选扫描：限制路径逃逸、非法文件名、过大仓库和缺失 `SKILL.md`；生成候选 DTO。 | Rust 测试覆盖根目录 Skill、多 Skill、子路径扫描、无候选、路径逃逸、非法目录名和同名冲突状态。 |
| PLAN-4 | done | 实现 GitHub 候选预览与导入 command：用户提交选中候选后复制候选目录到统一 Skills 根目录，冲突走现有跳过/覆盖和备份边界。 | Rust 测试覆盖多选导入、同名跳过、覆盖备份、导入后 `skill_sources` 写入、导入后默认不启用。 |
| PLAN-5 | done | 增加前端 GitHub 导入入口和弹窗：输入 URL、扫描 loading、候选列表、右侧 `SKILL.md` 预览、勾选导入、冲突提示。 | React 测试覆盖入口可见、扫描失败、候选勾选、无候选空状态、预览展示、导入成功刷新列表。 |
| PLAN-6 | done | 泛化更新检查服务：抽出按来源分派的更新检查逻辑，`skills_sh` 保持现有 CLI 路径，`github` 使用 repo/ref/path/hash 路径。 | Rust 测试覆盖 `skills_sh` 现有状态不回归、GitHub up-to-date、update-available、check-failed、固定版本 unsupported。 |
| PLAN-7 | done | 实现 GitHub 来源更新执行：更新前备份当前统一根目录 Skill，重新下载同一候选路径并替换，更新 hash、commit/ref 和时间字段。 | Rust 测试覆盖更新替换、备份存在、远端路径缺失失败不替换、批量更新单项失败不中断。 |
| PLAN-8 | done | 改造更新页为“来源更新”：展示来源类型、固定版本说明和 GitHub 更新状态；本地导入和外部工具同步不进入更新页。 | React 测试覆盖文案不再写死 `skills.sh`、GitHub 状态展示、固定版本不可选、本地来源不出现。 |
| PLAN-9 | done | 更新文档和变更日志：记录 GitHub public 导入、来源更新规则、固定版本策略、安全边界和非目标。 | 检查 `docs/capabilities/skills-management.md`、`docs/ARCHITECTURE.md`、`docs/ai/context-map.md`、`CHANGELOG.md`。 |
| PLAN-10 | done | 完整验证和必要手动检查。 | `pnpm verify` 通过；如网络环境允许，手动用 public GitHub 测试仓库验证扫描、预览、导入和更新检查。 |

## 边界情况清单

- URL 不是 GitHub：拒绝并提示只支持 public GitHub 链接。
- GitHub 仓库不存在或私有：返回不可访问错误，不创建来源记录。
- URL 指向 tag 或 commit：允许导入，来源标记为固定版本，更新页显示不支持检查更新或不进入可更新集合。
- URL 指向 repo 根目录且根目录没有 `SKILL.md`：不提供“整个仓库安装”，只展示扫描到的子目录候选。
- URL 指向子路径：只扫描该子路径范围内的 `SKILL.md` 候选。
- URL 指向 `SKILL.md` 文件：候选目录为该文件所在目录。
- 仓库没有任何 `SKILL.md`：展示无候选，不导入。
- 多个候选同名：需要通过目录名冲突状态要求用户跳过或覆盖；不能静默覆盖。
- 候选目录名非法：候选标记 invalid，不允许导入。
- GitHub 路径包含 `..` 或绝对路径：拒绝该路径，不写入目标目录。
- 固定 commit 的 codeload ZIP 过大或文件过多：中止扫描并返回可读错误。
- 候选包含脚本：只展示提示，不执行。
- 导入过程中目标已变化：后端重新检查冲突，必要时返回冲突而不是覆盖。
- GitHub 更新时远端同一路径缺失 `SKILL.md`：检查失败或更新失败，不替换本地内容。
- GitHub 更新发现 hash 相同：标记 up-to-date，只更新检查时间。
- GitHub 更新发现 hash 不同：标记 update-available，用户确认更新后才替换。
- 更新执行备份失败：不替换本地内容。
- 已启用 Copy 副本存在：更新只替换统一根目录，不自动刷新 Copy 副本；保持现有 `skills.sh` 更新边界。
- 删除 GitHub 来源 Skill：清理统一根目录、受管启用目标和对应来源记录。

## 验收标准

- 用户可以从 public GitHub repo/tree/blob `SKILL.md` 链接扫描标准 Skill 候选。
- 用户能在导入前预览 `SKILL.md` 并选择一个或多个候选导入。
- Workbench 只导入包含 `SKILL.md` 的目录整体，不支持自由拼装文件。
- 根目录存在 `SKILL.md` 时，整个仓库根目录可作为一个 Skill 候选。
- 导入后的 Skill 存在于统一 Skills 根目录，并默认不启用到任何 Agent 工具目录。
- 同名冲突不会静默覆盖；覆盖前备份旧版本。
- GitHub 来源记录包含足够信息用于后续检查更新。
- 更新页支持 `skills_sh` 和 GitHub 分支来源；本地导入、外部工具目录同步、GitHub tag/commit 固定版本不作为可更新项。
- `skills_sh` 安装和更新仍走现有 CLI 适配，不被 GitHub 直连逻辑替代。
- GitHub 更新检查和执行只比较并替换同一 `skill_path`，路径缺失或校验失败不修改本地内容。
- `pnpm verify` 通过。

## 交付物路由

- Plan：`docs/plans/2026-06-28-github-skill-import-and-updates.md`
- Source audit：无
- Covered findings：无
- Deferred findings：无
- Capability docs：更新 `docs/capabilities/skills-management.md`
- Architecture docs：视实现影响更新 `docs/ARCHITECTURE.md`
- Context map：如新增 GitHub 导入或更新 owner 模块，更新 `docs/ai/context-map.md`
- Changelog：需要；这是用户可见的 Skills 来源导入和更新能力变化。
- Tests：需要；Rust 后端 GitHub 导入/更新测试和 React 前端扫描/预览/更新页测试。
- Distill：需要；实现完成后用 `/dev-distill` 或 `/dev-branch` closeout 更新能力文档和计划状态。
- ADR gate：暂不需要；如实施中把来源模型扩展为长期通用远程包协议，则重新评估 ADR。
- Design system impact：none；复用现有 Skills toolbar、Modal、warning、列表、状态徽标和分页模式。

## 完成条件

所有计划步骤完成后，用户可以从 public GitHub 链接扫描、预览并导入标准 `SKILL.md` Skill；GitHub 分支来源和现有 `skills_sh` 来源可在来源更新页检查和执行更新；本地来源与固定版本不会误入更新流程；相关测试、文档和验证命令完成并记录。
