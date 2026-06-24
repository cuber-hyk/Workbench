---
artifact_type: plan
status: archived
created: 2026-06-24
updated: 2026-06-24
owner: codex
---

# Skills Market Incremental Source Plan

## Goal

优化 Skills 市场来源加载，让 Workbench 不再把 skills.sh 首页内嵌的约 600 条榜单数据视为市场上限，并在不一次性拉取全量的前提下支持用户驱动的按需加载。

## Scope

- 调整 skills.sh 市场列表的数据加载策略：
  - 无搜索时继续展示榜单数据，并保留当前榜单可解析到的全部结果。
  - 有搜索时使用匿名搜索接口按 `limit` 递增加载更多结果。
- 保留现有分页尺寸 `25 / 50 / 100`，不改全局分页控件规则。
- 市场统计改为表达“当前已加载结果”统计，而不是全市场统计。
- 市场列表展示来源仓库/组织图标，增强对 `source` 的快速识别。
- 增加请求上限、缓存和限流保护，避免触发 skills.sh 匿名接口频率限制。
- 保持市场安装、卸载、更新检查和更新执行的现有数据所有权不变。

## Non-Goals

- 不接入官方 `/api/v1/skills` 认证分页 API。
- 不配置或管理 Vercel OIDC token。
- 不一次性抓取或本地缓存完整 skills.sh 市场目录。
- 不扩展新的安装来源；`skills.sh` 仍是唯一在线来源。
- 不改变 `skills.sh` 安装和更新通过官方 CLI 提取内容的 ADR 决策。
- 不为仓库图标引入需要认证或付费的外部服务。

## Assumptions And Decisions

- 已确认 `600` 是 skills.sh 页面榜单内嵌数据量，不是市场总量。
- 已确认匿名搜索接口 `https://skills.sh/api/search?q=...&limit=...` 可返回远超 600 的搜索结果，但没有 `page`、`offset` 或 `cursor`。
- 已确认匿名搜索接口 `q` 至少 2 个字符，并存在约 `30 requests / minute` 的频率限制。
- 已确认官方 `/api/v1/skills?page=&per_page=` 支持真分页和 `pagination.total`，但需要认证；本计划暂不接入。
- 搜索“加载更多”的实现采用增大 `limit` 后重新请求前 N 条结果，并在前端保持用户目标页。
- 市场统计保留，但文案语义改为“当前结果 / 已加载”，不展示全市场总数。
- 搜索加载批量按当前页大小计算：`batchSize = min(max(pageSize * 4, 100), 400)`。
- 匿名搜索初始最大已加载量从当前页大小推导，计划默认上限先设为 `2000`，实现时可作为后端常量集中管理。
- 仓库图标优先从 GitHub `owner/repo` 来源派生；非 GitHub 来源使用已有状态/文字回退，不阻断安装或浏览。

## Fact Sources

- `AGENTS.md`：项目工作原则、模块边界、验证命令和 Git 规则。
- `CONTEXT.md`：`skills.sh` 是当前唯一在线 Skills 来源；统一 Skills 根目录是真实来源。
- `docs/capabilities/skills-management.md`：Skills 市场、更新、来源记录、统计和同步边界。
- `docs/adr/2026-06-20-skills-sh-cli-adapter.md`：安装和更新继续通过官方 CLI 混合适配，不保留旧下载路径。
- `DESIGN.md`：Skills 市场列表、详情、统计条、分页和状态徽标规则。
- `src/views/skills/SkillsView.tsx`：市场子视图状态、加载、筛选、统计和更新刷新编排。
- `src/views/skills/SkillsMarketView.tsx`：市场表格、统计条、分页和详情展示。
- `src/views/skills/skillMarketFormatters.ts`：市场统计和状态格式化。
- `src/lib/api/workbenchApi.ts`：前端到 Tauri command 的市场 API 边界。
- `src-tauri/src/skills.rs`、`src-tauri/src/skills/market.rs`、`src-tauri/src/skills/types.rs`：市场列表、详情、来源增强和后端类型。
- `src/App.test.tsx`：现有 Skills 市场集成测试覆盖。

## Split Guidance

Dev Split classification: `defer`.

- `src-tauri/src/skills.rs`、`src/App.tsx`、`src/App.test.tsx` 是大文件候选，但本任务不以拆分为目标。
- 后端新增或调整的 skills.sh 市场解析、搜索和请求保护逻辑应优先放在 `src-tauri/src/skills/market.rs` 或具备明确职责的 `src-tauri/src/skills/market_source.rs`。
- `src-tauri/src/skills.rs` 只保留 Tauri command 和业务流程编排，不继续堆叠搜索解析细节。
- 前端状态编排可继续由 `SkillsView.tsx` 拥有；纯计算如统计文案、批量大小、是否可加载更多应靠近 `src/views/skills/` 的现有 owner 模块，不创建泛化 `utils`。
- `src/App.test.tsx` 可继续承载现有 shell/integration 覆盖；只有未来测试边界明显独立时再拆分。
- 未来触发重新评估拆分的条件：市场来源同时支持匿名搜索、官方分页 API、token 配置和多来源合并时，再单独运行 `/dev-split`。

## Steps

1. `done` 后端市场来源建模与请求边界
   - 在后端类型中区分榜单结果和搜索结果所需的加载元信息，例如是否还有更多、已加载数量、来源模式或错误状态。
   - 为匿名搜索接口设置最小查询长度、最大 `limit`、超时、错误消息和频率限制友好的缓存策略。
   - Verification: Rust 单测覆盖搜索参数边界、`limit` 上限、2 字符以下查询错误、429/网络错误映射。

2. `done` 实现匿名搜索按需加载
   - 前端保留 `25 / 50 / 100` page size。
   - 搜索首次加载使用按 page size 计算出的 batch size。
   - 当用户翻到已加载结果末尾并继续下一页时，增加 `limit` 后重新请求更大结果集，并保持目标页。
   - Verification: 前端测试覆盖首次搜索、触底加载更多、加载后停留在下一页、达到最大上限后不再请求。

3. `done` 保留榜单模式并明确到底行为
   - 无搜索时继续显示当前榜单解析结果。
   - 榜单模式不承诺超过当前返回数据；到末尾时给出轻量提示，引导用户搜索发现更多 Skill。
   - Verification: 前端测试覆盖无搜索榜单分页到底提示、搜索模式不显示榜单到底提示。

4. `done` 调整统计和筛选语义
   - 市场统计文案从“全部”调整为“当前结果”或“已加载”。
   - 已安装、未安装、可更新、不支持均基于当前已加载结果统计。
   - 筛选只过滤当前已加载结果，不暗示全市场统计。
   - Verification: 前端测试覆盖统计条文案、筛选当前已加载结果、安装状态刷新后统计更新。

5. `done` 增加市场来源图标展示
   - 在市场列表来源列展示仓库/组织图标和 source 文本。
   - GitHub `owner/repo` 来源可派生头像地址；加载失败时回退为短字母或现有来源文本。
   - 非 GitHub 或不可安装来源不请求详情接口，只使用安全回退显示。
   - Verification: 前端测试覆盖 GitHub 来源图标渲染、非 GitHub 回退、图标加载失败不影响列表操作。

6. `done` 回归安装、卸载和更新关联刷新
   - 保持安装成功后清理市场缓存并刷新本地状态。
   - 保持卸载后清理 `skill_sources` 并刷新市场/更新页状态。
   - 不改变更新页的 `skills.sh` 来源更新逻辑。
   - Verification: 现有市场安装、卸载、更新页测试继续通过；补充市场增量加载下安装状态匹配测试。

7. `done` 文档与验证收尾
   - 根据实现结果更新 `docs/capabilities/skills-management.md` 中市场来源、搜索加载、统计语义和匿名接口限制。
   - 如新增可选官方 API token 或长期数据源策略，才进入 ADR gate；本计划不需要新 ADR。
   - Verification: 运行 `pnpm verify`；运行 Dev Flow 文档检查。

## Risks

- 匿名 `/api/search` 不是正式分页 API，增量加载会重复下载前面已返回的结果。
- skills.sh 匿名接口有频率限制，快速搜索和触底加载可能触发 429。
- 大 `limit` 响应体可能较大，默认最大值必须保守。
- 统计如果文案不改清楚，会让用户误解为全市场统计。
- 远程图标加载可能失败或被网络阻断，必须有本地回退视觉。
- 如果未来接入官方认证 API，当前匿名搜索加载模型需要与真分页模型并存或迁移，届时应单独计划。

## Acceptance Criteria

- 无搜索时市场仍能浏览榜单结果，并清楚表达榜单到底。
- 搜索时用户能通过翻页触底继续加载更多结果，不需要一次性拉全量。
- 市场统计明确表示当前已加载结果，不出现全市场总数暗示。
- GitHub 来源市场条目能显示仓库/组织图标；图标不可用时有稳定回退。
- 搜索请求有后端上限、最小查询长度和错误映射。
- 安装、卸载、市场状态、更新页刷新行为不回退。
- `pnpm verify` 通过。

## Artifact Routing

- Plan: `docs/plans/2026-06-24-skills-market-incremental-source.md`
- Capability doc: implementation closeout should update `docs/capabilities/skills-management.md`
- Context map: no expected update unless new source file becomes durable entry point
- ADR: not needed for anonymous incremental loading; maybe needed only if official authenticated API becomes required
- Tests: `src/App.test.tsx` and Rust tests under `src-tauri/src/skills.rs` or owner module tests
- Design system impact: none; reuse existing Skills market table, stats bar, pagination and status badge rules

## Closeout

- Implementation archived this plan after updating `docs/capabilities/skills-management.md` and `CHANGELOG.md`.
- No ADR was added because the implementation keeps `skills.sh` as the only online source and does not adopt the authenticated official API.
- If docs or lifecycle artifacts change again, run Dev Flow validation:

```powershell
node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.9.0\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench
```
