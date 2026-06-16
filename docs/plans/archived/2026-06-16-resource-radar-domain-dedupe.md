---
artifact_type: plan
status: archived
created: 2026-06-16
updated: 2026-06-16
owner: Workbench
---

# 资源 Radar 领域分类与重复资源合并计划

## 目标

在资源 Radar 中增加单选领域分类，并完善 GitHub Stars 与手动资源之间的去重和合并流程，让同一个真实资源只保留一条主记录，同时保留用户维护内容和来源元数据。

## 范围

- 新增资源领域字段 `domain`，作为单选分类。
- 保留现有资源类型 `category`：`项目 / 资讯 / 论文 / 其他`。
- 增加领域筛选，并整理资源 Radar 的筛选维度。
- GitHub Stars 同步时，URL 唯一匹配已有手动资源则自动合并来源，不新建重复资源。
- 多条手动资源匹配同一个 GitHub repo 时，生成待处理重复资源记录。
- 增加重复资源入口和合并流程。
- 合并时由用户选择主资源，系统按固定规则合并副资源。
- 更新 PRD、架构、设计规则和资源 Radar capability。

## 非目标

- 不实现 LLM 自动分类或自动推荐领域。
- 不实现多选领域；多维补充继续使用标签。
- 不根据名称相似度自动合并资源。
- 不做后台同步、定时同步或 GitHub Token 配置。
- 不实现跨来源的复杂三方合并器；本阶段只处理手动资源与 GitHub Stars 的重复。
- 不保留合并后的副资源为并行可编辑记录。

## 假设与已确认决策

- `domain` 使用单选，默认值为 `未分类`。
- `category` 表示资源类型，`domain` 表示领域分类，二者正交。
- 首批内置领域建议为：`未分类 / Skills / Agent / RAG / AI 基础 / 开发工具 / 文档工具 / 算法与数据结构 / 教程与资源 / 前端开发 / Android 开发 / 桌面应用 / 音视频工具 / 安全与网络 / 其他`。
- GitHub Stars 默认 `category = 项目`，`domain = 未分类`，除非自动匹配到已有手动资源。
- 如果 GitHub repo URL 唯一匹配一条手动资源，则将 GitHub Stars 来源挂到该手动资源，不创建新资源。
- 自动合并来源时保留手动资源的 `category`、`domain`、用户标签、备注和收藏状态。
- 如果多条手动资源匹配同一个 GitHub repo，则不自动选择主资源，创建待处理重复记录。
- 合并重复资源时，主资源由用户选择。
- 固定合并规则：来源全部合并；用户标签去重合并；备注追加到主资源后；收藏取 OR；`category` 和 `domain` 使用主资源；副资源删除。
- 名称相似但 URL 不同不合并。
- GitHub Topics 继续参与搜索和筛选，但不写入用户标签。

## 事实来源

- `docs/capabilities/resource-radar.md`：当前资源 Radar 能力、数据所有权和同步规则。
- `docs/ARCHITECTURE.md`：当前 `radar_items` 表、资源 Radar 同步流程和模块边界。
- `docs/PRD.md`：资源 Radar 产品范围和非目标。
- `DESIGN.md`：资源 Radar Row Card、详情区、筛选和状态展示规则。
- `src-tauri/src/radar.rs`：资源 Radar SQLite、GitHub Stars 同步和用户字段保护逻辑。
- `src/lib/types/domain.ts`：前端 Radar 领域类型。
- `src/lib/api/workbenchApi.ts`：前端到 Tauri commands 的 API 边界。
- `src/App.tsx`：资源 Radar 列表、筛选、详情和弹窗入口。
- `src/App.test.tsx`：资源 Radar UI 行为测试。

## 数据模型建议

在 `radar_items` 上增加：

| 字段 | 说明 |
| --- | --- |
| `domain` | 单选领域分类，默认 `未分类` |

新增重复记录表：

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `radar_duplicate_groups` | `id` | 重复组 ID |
|  | `source` | 当前阶段固定为 `github_star` |
|  | `external_id` | GitHub `owner/repo` |
|  | `source_description` | GitHub 来源描述快照 |
|  | `source_metadata_json` | GitHub 来源元数据快照 |
|  | `candidate_ids_json` | 候选资源 ID 列表 |
|  | `status` | `open / resolved` |
|  | `created_at / updated_at` | 时间戳 |

约束：

- `source + external_id + status=open` 应最多只有一条打开的重复组。
- 同步时重新发现同一重复组应更新候选列表，不重复创建。
- 合并成功后将重复组标记为 `resolved`。

## 筛选设计

资源 Radar 顶部筛选维度：

- 搜索：名称、备注、来源描述、用户标签、GitHub Topics。
- 类型：`category`。
- 领域：`domain`。
- 来源：手动添加、GitHub Stars。
- 语言：GitHub 元数据中的 language。
- 标签：用户标签 + GitHub Topics。
- 收藏：全部 / 仅收藏。
- 来源状态：全部 / 有效 / 来源失效。
- 重复：全部 / 仅看待合并重复。

交互规则：

- 筛选为空时，右侧详情不展示被筛选排除的旧选中资源。
- 已启用筛选可以用 chips 显示，后续实现可按 UI 空间决定是否第一版加入。
- 领域筛选默认显示 `全部领域`。

## 合并流程

1. GitHub Stars 同步完整拉取并解析成功。
2. 对每个 repo 先按 `source = github_star + external_id` 找已有 GitHub 来源资源。
3. 若存在，按现有规则更新来源字段。
4. 若不存在，按规范化 GitHub repo URL 查找手动资源。
5. 若唯一匹配一条手动资源，直接把 GitHub 来源字段写入该资源。
6. 若匹配多条手动资源，创建或更新重复组，不新建 GitHub 资源。
7. 若无匹配，创建新的 GitHub Stars 资源。
8. 用户从重复入口进入合并界面，选择主资源。
9. 后端按固定规则合并候选资源，并标记重复组已解决。

## 执行步骤与验证

| ID | 状态 | 步骤 | 验证 |
| --- | --- | --- | --- |
| RDD-1 | done | 扩展后端数据模型：为 `radar_items` 增加 `domain` 幂等升级；增加重复组表和读取/写入函数。 | Rust 测试覆盖旧数据默认 `domain = 未分类`、重复组创建和重复组 resolved。 |
| RDD-2 | done | 更新 GitHub Stars 同步去重逻辑：支持 URL 唯一匹配手动资源时自动挂来源，多候选时创建重复组。 | Rust 测试覆盖唯一 URL 自动合并、多 URL 候选生成重复组、名称相似不合并。 |
| RDD-3 | done | 实现重复资源合并 command：用户选择主资源，后端按固定规则合并来源、标签、备注和收藏，并删除副资源。 | Rust 测试覆盖标签去重、备注追加、收藏 OR、主资源 category/domain 保留、副资源删除、重复组 resolved。 |
| RDD-4 | done | 扩展前端类型、API 和 mock：增加 `domain`、重复组类型、重复组列表和合并 command。 | 前端测试通过；mock preview 不依赖 Tauri。 |
| RDD-5 | done | 更新资源 Radar UI：编辑表单增加领域单选；列表/详情展示领域；filter 增加领域、语言、来源状态和重复筛选；增加重复入口和合并界面。 | 前端测试覆盖领域、语言、重复状态筛选和合并选择主资源。 |
| RDD-6 | done | 更新文档：PRD、架构、DESIGN、context-map、resource-radar capability 和 CHANGELOG。 | 已更新对应文档，待完整验证阶段运行 Dev Flow 文档检查。 |
| RDD-7 | done | 执行完整验证。 | `pnpm verify`、`pnpm tauri:verify-build`、Dev Flow 文档检查通过；UI 行为由前端测试覆盖。 |

## 风险与控制

- **误合并风险**：只使用 GitHub repo URL 或 `source + external_id` 合并；名称相似不触发自动合并。
- **用户内容丢失风险**：合并时主资源保留类型和领域，标签去重合并，备注追加，收藏取 OR；通过后端测试锁定。
- **同步中断风险**：只有完整拉取和解析成功后才写入数据库；重复组更新与资源变更在事务内完成。
- **UI 复杂度风险**：筛选维度增加较多，第一版保持单行 toolbar；chips 只作为空间允许时的增强，不阻塞核心功能。
- **删除副资源风险**：删除只发生在用户确认合并后；同步阶段不删除手动资源。

## 验收标准

- 资源可维护单选领域，并可按领域筛选。
- GitHub Stars URL 唯一匹配手动资源时自动合并来源，不创建重复资源。
- 多条手动资源匹配同一 repo 时进入重复资源合并流程。
- 用户可以选择主资源并完成合并。
- 合并后主资源保留类型和领域，来源合并，标签去重，备注追加，收藏取 OR，副资源删除。
- 名称相似但 URL 不同的资源不会自动合并。
- Filter 支持类型、领域、来源、语言、收藏、来源状态和重复筛选；标签和 GitHub Topics 只参与搜索。
- `pnpm verify`、`pnpm tauri:verify-build` 和 Dev Flow 文档检查通过。

## 产物路由

- Plan：`docs/plans/2026-06-16-resource-radar-domain-dedupe.md`
- Capability docs：实现完成后更新 `docs/capabilities/resource-radar.md`。
- Changelog：需要；领域分类、去重合并和 filter 是用户可见能力。
- Distill：需要；资源身份、合并规则和数据所有权会成为长期知识。
- ADR gate：可能需要；如果实施中确认“副资源合并后删除”是长期不可逆策略，应由 `/dev-distill` 判断是否记录 ADR。
- `docs/ai/context-map.md`：若新增后端 command 或 capability 事实变化，需要更新。

## 完成条件

所有步骤完成且无阻塞项；验证无跳过；资源 Radar 当前文档、测试和实现一致；重复资源合并不会丢失用户维护内容。
