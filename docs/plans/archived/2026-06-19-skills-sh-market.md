---
artifact_type: plan
status: archived
created: 2026-06-19
updated: 2026-06-20
owner: codex
---

# skills.sh 技能市场计划

## Goal

在 Workbench 的 Skills 模块内增加 `skills.sh` 专用技能市场，支持浏览、搜索、安装、更新检查和用户确认后的单项/批量更新。安装和更新后的 Skill 仍以 Workbench 统一 Skills 根目录作为唯一真实来源。

## Scope

- 在 Skills 模块内增加 `本地 Skills / 技能市场 / 更新` 子视图。
- `技能市场` 从 `skills.sh` 获取远程 Skill 列表、搜索结果和详情。
- 安装由 Workbench 自行下载、校验、导入到统一 Skills 根目录。
- 记录从 `skills.sh` 安装的来源元数据，用于后续更新检查。
- `更新` 子视图只管理来源为 `skills.sh` 的已安装 Skill。
- 支持检查全部、单项更新、勾选后批量更新，以及更新全部可更新项。
- 更新前备份旧版本；更新失败时保留旧版本，并返回逐项结果。
- 安装或更新完成后刷新本地 Skills 状态，复用现有分类、启用、冲突和删除能力。
- 将已确认的页面方向从草图 `UI/skills-market-sketch.html` 迁移到正式 React 实现。

## Non-Goals

- 不调用 `npx skills add`、`npx skills update` 或其他 CLI 作为核心安装/更新路径。
- 不做自动更新。
- 不做版本 pin。
- 不做复杂 diff 预览。
- 不新增左侧主导航。
- 不把 `skills.sh` 抽象成通用远程来源框架。
- 不实现右侧详情面板折叠；该布局增强后续单独计划。
- 不自动启用新安装或更新后的 Skill 到 Codex、Claude Code、OpenCode 或其他工具目录。

## Assumptions And Decisions

- 已确认第一版只接 `skills.sh`，不是通用 Skills 仓库框架。
- 已确认安装和更新由 Workbench 自行下载并写入统一 Skills 根目录。
- 已确认更新能力包含批量更新，但必须由用户显式触发和确认。
- 已确认入口为 Skills 模块内部子视图：`本地 Skills / 技能市场 / 更新`。
- 已确认右侧详情折叠不进入本次范围。
- 假设 `skills.sh` 能提供足够的远程来源信息，例如 package slug、仓库 URL、路径、更新时间、commit/ref 或可下载资源；若字段不足，后端需要回退到 GitHub 内容 hash 或下载后 hash 做版本标识。
- 假设远程网络失败、API 字段变化和下载失败属于正常错误路径，必须可见地返回给用户。

## Fact Sources

- `AGENTS.md`：项目工作原则、Git 边界、验证命令。
- `CONTEXT.md`：当前阶段、统一 Skills 根目录和本地优先边界。
- `docs/PRD.md`：skills.sh 技能市场和更新能力已纳入 Skills 成功标准。
- `docs/ARCHITECTURE.md`：Tauri、React、SQLite 分层和 Skills 数据模型。
- `docs/ai/context-map.md`：相关源文件和能力文档路由。
- `docs/capabilities/skills-management.md`：现有 Skills 扫描、导入、启用、冲突、删除和分类语义。
- `DESIGN.md`：Skills 页面表格、详情、弹窗、状态徽标和 App Shell 规则。
- `src/App.tsx`：当前 Skills 页面主入口和交互模式。
- `src/lib/api/workbenchApi.ts`：前端到 Tauri commands 的 API 边界。
- `src/lib/types/domain.ts`：前端领域类型。
- `src-tauri/src/skills.rs`：当前 Skills 后端 source of truth。
- `src-tauri/src/lib.rs`：Tauri command 注册入口。
- `UI/skills-market-sketch.html`：本次讨论确认用静态草图。

## Plan

1. **done - 确认远程数据契约**
   - 研究 `skills.sh` 可用接口或页面数据，确定市场列表、搜索、详情、下载来源和远端版本标识字段。
   - 若 API 需要鉴权或字段不足，确定 GitHub 下载/hash 回退路径。
   - Verification: 用小型命令或后端测试夹具证明能从样例数据解析出安装所需字段；记录失败场景。

2. **done - 增加来源数据模型和后端服务**
   - 新增 SQLite 来源记录，例如 `skill_sources`，保存 `directory_name`、`source`、`package_slug`、`repo_url`、`skill_path`、`installed_ref`、`installed_hash`、`remote_ref`、`last_checked_at`、`installed_at`、`updated_at`。
   - 在 `src-tauri/src/skills.rs` 或拆出的 skills 子模块中实现市场列表、详情、安装、检查更新、单项更新和批量更新 commands。
   - 安装同名 Skill 时不覆盖；更新已记录来源的 Skill 时先备份再替换。
   - Verification: Rust 测试覆盖迁移、来源记录写入、同名安装拒绝、更新备份、逐项批量失败保留旧版本。

3. **done - 扩展前端类型和 API 边界**
   - 在 `src/lib/types/domain.ts` 增加市场 Skill、来源记录、更新检查结果、批量更新结果等类型。
   - 在 `src/lib/api/workbenchApi.ts` 封装新增 Tauri commands，并提供 web-preview mock 数据。
   - Verification: TypeScript build 通过；mock 路径能渲染市场和更新页。

4. **done - 实现 Skills 子视图 UI**
   - 在 `src/App.tsx` 中增加 Skills 内部子视图状态和切换控件。
   - 实现 `本地 Skills / 技能市场 / 更新` 三个视图；本地视图保留现有能力。
   - 市场页实现搜索、状态筛选、列表、详情、安装和已安装状态。
   - 更新页实现检查全部、可更新/最新/失败状态、勾选批量更新、更新全部可更新项和确认区。
   - Verification: 前端测试覆盖子视图切换、安装按钮状态、批量选择、确认更新入口和错误状态展示。

5. **done - 串联安装、更新和刷新状态**
   - 安装成功后刷新 `get_skills_state`，新 Skill 出现在本地 Skills。
   - 更新成功后刷新本地 Skills 和来源记录；批量更新返回逐项结果。
   - 更新不改变现有分类、全局启用和项目启用记录；若已启用工具使用 copy 副本，仍按现有同步规则处理，不在本次自动重同步所有派生目标。
   - Verification: Rust 和前端测试覆盖安装后刷新、更新后来源标识变化、批量部分失败结果。

6. **done - 更新文档和验证**
   - 更新 `docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/capabilities/skills-management.md`、`docs/ai/context-map.md` 中相关能力事实。
   - 视实现影响决定是否更新 `DESIGN.md`；如果仅复用现有表格/详情/状态模式，则设计系统影响为 none。
   - 运行 `pnpm verify`。
   - Verification: 文档与实现一致；最终验证结果见本分支 review gate。

## Risks

- `skills.sh` API 或页面数据契约不稳定，可能需要 GitHub 下载/hash 回退。
- 远程来源可能缺少明确版本标识，更新检查只能基于内容 hash 或下载后的比较。
- 批量更新涉及多文件系统操作，必须保证单项失败不会破坏其他 Skill 或旧版本。
- 如果已启用的工具目录使用 copy 副本，更新统一根目录后外部工具目录不会自动同步；本次计划默认不解决 copy 重新同步能力，需在 UI 或结果中保持边界清晰。
- 市场页和更新页会增加 `src/App.tsx` 复杂度；若实现时文件维护压力明显，应只按直接职责拆出局部组件，不做 unrelated refactor。

## Acceptance Criteria

- 用户能在 Skills 模块内切换到 `技能市场`。
- 用户能搜索并查看 `skills.sh` 远程 Skill 详情。
- 用户能安装一个远程 Skill 到 Workbench 统一 Skills 根目录。
- 安装遇到同名本地 Skill 时拒绝覆盖，并显示清楚错误。
- 从 `skills.sh` 安装的 Skill 会记录来源元数据。
- 用户能在 `更新` 子视图检查所有 `skills.sh` 来源 Skill 的更新状态。
- 用户能单项更新、勾选批量更新、更新全部可更新项。
- 所有更新操作都需要用户显式触发，且更新前备份旧版本。
- 批量更新单项失败时保留该项旧版本，并展示逐项结果。
- 安装和更新都不会自动启用 Skill 到任何 Agent 工具目录。
- `pnpm verify` 通过。

## Artifact Routing

- Plan: `docs/plans/2026-06-19-skills-sh-market.md`
- Source code: `src/App.tsx`, `src/lib/api/workbenchApi.ts`, `src/lib/types/domain.ts`, `src-tauri/src/skills.rs`, `src-tauri/src/lib.rs`
- Tests: existing frontend Vitest tests and Rust tests under `src-tauri`
- Capability docs: `docs/capabilities/skills-management.md`
- Product and architecture docs: `docs/PRD.md`, `docs/ARCHITECTURE.md`
- Context map: `docs/ai/context-map.md`
- Design system impact: likely none if existing table/detail/status patterns are reused; update `DESIGN.md` only if a new reusable UI rule is established.
- ADR gate: maybe. If implementation introduces a durable remote-source model beyond `skills.sh`, or a long-lived update/version policy, run ADR gate during closeout.

## Closeout

- 实现已在 `task/20260619-skills-sh-market` 分支完成，并通过 `pnpm verify`。
- 当前能力事实已写入 `CONTEXT.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/capabilities/skills-management.md`、`DESIGN.md` 和 `docs/ai/context-map.md`。
- 自管安装、来源记录、内容 hash 检测和更新备份策略已固化为 `docs/adr/2026-06-19-skills-sh-self-managed-install.md`。
