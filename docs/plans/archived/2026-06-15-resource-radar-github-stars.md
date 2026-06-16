---
artifact_type: plan
status: archived
created: 2026-06-15
updated: 2026-06-15
owner: Workbench
---

# 资源 Radar 与 GitHub Stars 同步计划

## 目标

将现有 AI Radar 演进为通用“资源 Radar”，并把 GitHub Stars 作为第一个外部来源接入。用户可以在 Workbench 中手动同步当前 `gh` CLI 账号的 Stars，并继续使用现有搜索、类型筛选、标签、备注、收藏和打开链接能力。

## 范围

- 将产品文案中的“AI Radar”统一改为“资源 Radar”。
- 保留一个 Radar 模块和一套资源 CRUD，不新增顶级导航模块。
- 扩展 Radar 数据模型，区分手动资源与 GitHub Star 来源。
- 使用本机 `gh` CLI 当前认证账号手动同步 GitHub Stars。
- 支持按来源筛选，并在列表和详情中展示 GitHub 仓库元数据。
- 同步新增、更新和来源失效状态，返回明确的同步结果。
- 更新产品、架构、上下文和设计文档，使其与实现一致。

## 非目标

- 不接入 LLM 分类、摘要或评分。
- 不做后台定时同步、自动任务调度或独立 HTTP 服务。
- 不实现 JSON、CSV、Markdown 等通用导入来源。
- 不新增资源处理状态或工作流状态。
- 不把 Obsidian 笔记、Base 文件或原 Python 脚本合并进 Workbench。
- 不因 GitHub 仓库取消 Star 而删除本地资源。
- 不处理私有仓库的额外授权流程；同步能力依赖用户现有 `gh` CLI 认证状态。

## 假设与已确认决策

- 产品名称统一使用“资源 Radar”；内部模块、Tauri command 和 `radar_items` 表暂保留 `radar` 命名，避免仅为改名制造无业务价值的迁移。
- GitHub Stars 是资源 Radar 的首个外部数据源，不新增第五个顶级模块。
- 资源类型继续使用现有固定枚举：`项目 / 资讯 / 论文 / 其他`；GitHub Stars 默认类型为 `项目`。
- GitHub Topics 合并到资源标签；语言和 Stars 数量作为来源元数据展示，不伪装成用户标签。
- 手动资源的 `source` 为 `manual`；GitHub Stars 的 `source` 为 `github_star`。
- 外部资源使用 `source + external_id` 作为稳定唯一标识；GitHub 的 `external_id` 为 `owner/repo`。
- GitHub 同步只更新来源拥有的字段：名称、URL、描述快照、语言、Topics、Stars 数量、仓库更新时间、来源有效状态和最后同步时间。
- 同步不得覆盖用户拥有的字段：资源类型、手写备注、收藏状态和用户标签。
- 首次导入时，GitHub 描述作为来源描述保存，不自动写入用户备注。
- 仓库取消 Star 后标记为来源失效，保留本地资源和用户内容；再次 Star 后恢复为有效。
- 同步由用户点击触发，使用 `gh api user/starred --paginate`；不增加 GitHub 用户名或 Token 设置。
- 同步失败必须返回结构化错误；不得静默写入部分批次并宣称完整成功。

## 事实来源

- `AGENTS.md`：简单优先、单一实现、外科手术式修改、验证与 Git 规则。
- `CONTEXT.md`：Workbench 当前模块状态与本地优先边界。
- `docs/PRD.md`：现有 AI Radar 产品语义、功能与后续导入方向。
- `docs/ARCHITECTURE.md`：Radar 模块边界、`radar_items` 模型和导入式数据源预留。
- `DESIGN.md`：Radar 使用 Row Card 列表与详情工作区的既有 UI 规则。
- `src/lib/types/domain.ts`：前端 `RadarItem` 和固定资源类型。
- `src/lib/api/workbenchApi.ts`：前端到 Tauri commands 的唯一 API 边界。
- `src/App.tsx`：Radar 页面、筛选、详情、表单和操作入口。
- `src/App.test.tsx`：Radar 搜索筛选与导航文案测试。
- `src-tauri/src/radar.rs`：Radar SQLite、校验、CRUD 和链接打开逻辑。
- `src-tauri/src/lib.rs`：Tauri command 注册入口。
- `E:/Learning-materials/Obsidian/Default/GitHub Stars/scripts/sync-stars.py`：参考流程与 GitHub 字段来源，仅作为行为参考，不合并代码。

## 数据模型

在现有 `radar_items` 上增加来源字段，保持资源本体只有一个表：

| 字段 | 说明 |
| --- | --- |
| `source` | `manual` 或 `github_star`，默认 `manual` |
| `external_id` | 外部稳定标识；GitHub 为 `owner/repo`，手动资源为空 |
| `source_description` | GitHub 仓库描述快照 |
| `source_metadata_json` | 来源结构化元数据：语言、Topics、Stars 数量、仓库更新时间 |
| `source_active` | 外部来源当前是否仍有效；取消 Star 时为 false |
| `last_synced_at` | 最后成功同步时间 |

约束：

- 为非空外部标识建立 `source + external_id` 唯一索引。
- 现有记录通过幂等升级获得默认值 `source = manual`、`source_active = true`，用户数据不迁移、不丢失。
- `tags_json` 继续保存用户标签；GitHub Topics 保存在 `source_metadata_json`，展示和筛选时可合并，但同步不得删除用户标签。
- `note` 继续只保存用户备注。

同步返回结构：

```text
GitHubStarsSyncResult
- items: RadarItem[]
- added: number
- updated: number
- deactivated: number
- unchanged: number
```

## 执行步骤与验证

| ID | 状态 | 步骤 | 验证 |
| --- | --- | --- | --- |
| RR-1 | done | 先扩展 `src-tauri/src/radar.rs` 的数据模型与幂等 SQLite 升级。增加来源字段、元数据序列化、唯一索引和兼容现有记录的读取逻辑；同步规则先写成可独立测试的纯数据转换/持久化函数。 | Rust 测试证明：旧表记录升级后仍完整；手动资源默认来源正确；同一 `source + external_id` 不重复；现有 CRUD 仍通过。运行 `cargo test --manifest-path src-tauri/Cargo.toml radar -- --nocapture`。 |
| RR-2 | done | 在 Rust Radar 模块实现 GitHub Stars 手动同步 command。通过 `gh api user/starred --paginate` 获取当前账号 Stars，解析需要字段，在单次数据库事务中新增或更新，并将本次结果中缺失的既有 GitHub Star 标记为来源失效。注册 Tauri command。 | Rust 测试使用固定 GitHub 数据夹具验证新增、重复同步、元数据更新、取消 Star 标记失效、重新 Star 恢复；验证同步不覆盖用户类型、备注、收藏和用户标签；验证 `gh` 不可用、未认证、非 JSON 输出时返回明确错误。 |
| RR-3 | done | 扩展前端领域类型、预览 mock 和 `workbenchApi`。增加 `RadarSource`、来源元数据、来源有效状态、同步结果和 `syncGithubStars()` API；保持所有前端调用只经过 `workbenchApi`。 | TypeScript 构建通过；web preview 使用 mock 同步结果，不调用本机 `gh`；Tauri 环境调用新 command。运行 `pnpm build`。 |
| RR-4 | done | 将 UI 文案统一为“资源 Radar”，在现有 Radar 页面加入“同步 GitHub Stars”操作、来源筛选、同步中禁用状态和结果反馈；列表与详情展示来源、语言、Stars 和来源失效提示。继续复用现有 PageHeader、Button、Row Card、详情区和 toast，不引入新页面模式。 | 前端测试覆盖：导航和页面标题改名；来源筛选；同步按钮调用与结果反馈；同步中防重复点击；失效来源提示；现有搜索、类型筛选、收藏、编辑和删除仍可用。运行 `pnpm test`，并在 Tauri 中手动验证真实同步和视觉状态。 |
| RR-5 | done | 收紧资源编辑边界：手动创建资源默认 `manual`；编辑外部资源时只允许修改用户拥有字段；删除仍是用户显式删除本地资源；详情明确区分来源描述与用户备注。 | 前端与 Rust 测试证明编辑 GitHub 资源不会改变外部标识和来源字段；手动资源 CRUD 行为不回归；删除确认文案明确删除的是本地记录。 |
| RR-6 | done | 更新 `AGENTS.md`、`CONTEXT.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`DESIGN.md`、`docs/ai/context-map.md` 和 `docs/capabilities/README.md`。文档直接描述资源 Radar 当前推荐实现，不保留 AI Radar 与资源 Radar 双轨说法。 | 使用 `rg -n "AI Radar" AGENTS.md CONTEXT.md DESIGN.md docs src src-tauri` 检查遗留产品文案；允许仅在迁移说明或历史不可变内容中出现。运行 Dev Flow 文档检查。 |
| RR-7 | done | 执行完整验证并人工验收。确认真实 GitHub 数据源可读；在隔离数据库中验证首次新增、二次幂等、用户内容保护、取消 Star 与恢复，避免测试污染用户正式数据库。 | `pnpm verify`、`pnpm tauri:verify-build`、Dev Flow 文档检查通过；`gh auth status` 与真实 Stars 拉取通过；Playwright 检查浅色与深色主题、来源筛选、同步入口、空状态和控制台错误。 |

## UI 与交互约束

- `design_system_impact: update`：模块名称和来源元数据展示属于资源 Radar 的持久 UI 规则，需要更新 `DESIGN.md`，但不创建新的通用组件体系。
- 复用现有 `PageHeader`、`Button`、`SearchInput`、`Panel`、Row Card、详情表单和 toast。
- 顶部主操作保持“添加条目”；“同步 GitHub Stars”作为同级但视觉次要的操作。
- 来源筛选选项：`全部来源 / 手动添加 / GitHub Stars`。
- GitHub 来源失效必须显式展示，不能仅依赖颜色；至少包含文字状态。
- 同步错误必须展示用户可操作的信息，例如未安装 `gh` 或需要执行 `gh auth login`。

## 风险与控制

- **数据库升级风险**：当前没有集中迁移框架。控制方式是使用幂等 schema 检查/升级，并用旧表夹具测试升级前后数据完整性。
- **用户内容被同步覆盖**：严格区分来源字段和用户字段，并用后端测试锁定所有权规则。
- **GitHub API/CLI 输出变化**：仅解析明确请求的 JSON 字段；解析失败时整次同步失败，不进入失效标记阶段。
- **部分同步导致错误失效**：只有完整拉取和解析成功后，才在事务中更新并计算失效项。
- **Stars 数量较大导致 UI 阻塞**：Tauri command 在后端执行；前端展示同步中状态并禁止重复触发。
- **命名范围扩散**：产品文案改为资源 Radar；内部 `radar` 命名保留为稳定模块名，不进行无收益的全仓重命名。

## 验收标准

- 左侧导航、页面标题、空状态、表单和设置说明统一使用“资源 Radar”。
- 现有手动 Radar 条目在升级后内容完整，仍可新增、编辑、删除、搜索、筛选、收藏和打开链接。
- 用户可点击“同步 GitHub Stars”，无需在 Workbench 中配置用户名或 Token。
- 首次同步为每个 Star 创建一个来源为 GitHub Stars 的资源，重复同步不会产生重复资源。
- 同步更新来源元数据，但不覆盖用户资源类型、备注、收藏和用户标签。
- 取消 Star 不删除资源，而是标记来源失效；重新 Star 后恢复有效。
- 来源筛选、GitHub 元数据展示和同步结果反馈可用。
- `pnpm verify`、`pnpm tauri:verify-build` 和 Dev Flow 文档检查全部通过，无跳过项。

## 产物路由

- Plan：`docs/plans/archived/2026-06-15-resource-radar-github-stars.md`
- Source audit：无
- Capability docs：实现完成后更新 `docs/capabilities/README.md`；若能力边界明显增长，再由 `/dev-distill` 判断是否拆出独立资源 Radar capability 文档。
- Changelog：需要；这是用户可见的模块改名和新同步能力。
- Distill：需要；产品边界、数据所有权和外部来源同步规则将成为长期知识。
- ADR gate：不需要；本次是在现有 Radar 单表和本地命令边界内增加首个来源，没有形成需要独立维护的难逆转架构决策。
- `docs/ai/context-map.md`：需要更新 Radar 的新事实来源和同步入口。

## 完成条件

所有非延期步骤完成且无阻塞项；完整验证无跳过；真实 GitHub 数据源读取通过，隔离数据库完成首次、重复、取消 Star 与恢复场景验证；文档、设计规则和能力说明与实现一致。
