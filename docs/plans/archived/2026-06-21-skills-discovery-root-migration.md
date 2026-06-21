---
artifact_type: plan
status: archived
created: 2026-06-21
updated: 2026-06-21
owner: codex
source_audit: docs/audits/archived/2026-06-20-existing-global-skills-first-run-audit.md
covered_findings:
  - AUD-2026-06-20-001
---

# Skills 外部发现与根目录迁移计划

## Goal

让刚安装或刚切换统一 Skills 根目录的用户，能够安全发现已注册 Agent 工具目录中的既有 Skills，并在用户显式确认后导入到当前统一根目录；当统一根目录切换后，提供显式迁移旧根目录内容和重建 Workbench 受管启用目标的能力。

## Scope

- 新增只读发现能力：扫描已注册工具的全局 Skills 目录中包含 `SKILL.md` 的一级 Skill 目录。
- 新增外部候选导入能力：把用户选定的外部 Skill 复制到当前统一 Skills 根目录。
- 新增根目录切换后的迁移能力：从旧统一根目录复制 Skills 到当前统一根目录。
- 新增受管启用目标重建能力：把仍指向旧统一根目录的 Workbench 受管符号链接或副本重建到当前统一根目录。
- 更新 Skills 页面、设置页和相关弹窗，清楚区分发现、导入、迁移、重建。
- 增加后端 Rust 测试、前端测试和能力文档更新。

## Non-Goals

- 不自动迁移旧根目录内容。
- 不自动导入外部工具目录内容。
- 不扫描项目级 Skills 目录，例如 `<project>/.codex/skills`。
- 不把外部工具目录变成新的真实来源；统一 Skills 根目录仍是唯一真实来源。
- 不删除旧统一根目录。
- 不覆盖未被 Workbench 管理的外部工具目录内容。
- 不实现 Git URL、压缩包 URL 或其他在线来源导入。
- 不修改 `skills.sh` 市场安装、更新和来源记录的基本语义。

## Assumptions And Decisions

- 已确认：已注册工具包含内置工具和自定义工具。
- 已确认：发现范围只包括已注册工具的全局 Skills 目录，不包括项目级目录。
- 已确认：切换统一根目录只切换当前真实来源，不自动迁移、不自动重建链接。
- 已确认：旧根目录迁移必须由用户显式执行。
- 已确认：符号链接不会因为切换根目录自动更新；需要删除旧受管链接并创建指向新根目录的新链接。
- 已确认：Copy 副本不会自动跟随根目录；重建时只能处理 Workbench 记录中的受管副本，且需要用户显式执行。
- 已确认：同名不同内容不能静默选择版本；必须让用户选择唯一来源或跳过。
- 工程建议：根目录切换时记录上一个统一根目录，供迁移入口使用；该记录只用于提示和迁移，不改变当前真实来源。
- 工程建议：发现、导入、迁移和重建使用独立 command，避免一个高副作用接口承担多个职责。
- ADR gate: maybe。该计划不改变“统一根目录是真实来源”的原则；如果实施中决定把外部工具目录纳入长期可管理来源，则需要 ADR。

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/capabilities/skills-management.md`
- `DESIGN.md`
- `docs/audits/2026-06-20-existing-global-skills-first-run-audit.md`
- `src-tauri/src/skills.rs`
- `src/lib/types/domain.ts`
- `src/lib/api/workbenchApi.ts`
- `src/App.tsx`
- `src/App.test.tsx`

## Current Code Facts

- `get_skills_state` 只扫描当前 `settings.skills_root`，因此当前根目录为空时不会列出 `.codex/.claude` 中已有 Skills。
- `.codex/skills`、`.claude/skills` 和自定义工具目录当前作为工具目标参与启用、冲突检测和打开目录，不作为首次发现来源。
- `import_skill_directory` 已具备基础安全边界：来源必须包含 `SKILL.md`，目录名必须校验，当前统一根目录同名时返回 conflict，不覆盖。
- `set_skill_enabled` 已具备启用安全边界：目标位置存在且不是当前 Workbench 受管目标时拒绝覆盖。
- `delete_skill` 只清理统一根目录 Skill 和 Workbench 记录中的受管目标，不删除未受管外部内容。
- 设置页当前在输入框 `onBlur` 时直接切换 Skills 根目录，没有迁移确认、旧根目录记录或重建入口。

## Data And API Shape

### Backend Commands

- `discover_external_skills() -> Vec<ExternalSkillCandidateGroup>`
  - 只读扫描已注册工具的全局 Skills 目录。
  - 返回按 `directory_name` 合并的候选组。
  - 不创建目录，不写数据库，不复制文件。

- `import_external_skills(selections: Vec<ExternalSkillImportSelection>) -> Vec<ImportResult>`
  - 将用户选择的候选来源复制到当前统一根目录。
  - 同名不存在时导入。
  - 同名同内容时返回 skipped 或 conflict，具体状态需前端可读；若复用 `ImportResult`，需要扩展状态。
  - 同名不同内容必须返回 conflict，不覆盖。

- `set_skills_root(path: String) -> SkillsState`
  - 继续只负责切换根目录。
  - 在切换前保存旧根目录到 `app_settings.previous_skills_root` 或等价设置。
  - 不迁移、不重建、不删除旧目录。

- `inspect_skills_root_migration() -> SkillsRootMigrationState`
  - 比较 `previous_skills_root` 与当前 `skills_root`。
  - 返回旧根目录是否存在、候选 Skills、同名状态、可迁移数量、受管目标是否需要重建。
  - 不执行副作用。

- `migrate_skills_root(selections: Vec<RootSkillMigrationSelection>) -> Vec<ImportResult>`
  - 从旧根目录复制选中 Skills 到当前根目录。
  - 只复制包含 `SKILL.md` 的一级目录。
  - 同名不存在时导入；同名同内容跳过；同名不同内容返回 conflict，除非用户明确选择替换并且实现了备份。
  - 第一版建议不提供覆盖替换，只导入不存在项并清楚列出冲突，降低风险。

- `rebuild_managed_skill_targets(selections: Vec<ManagedTargetRebuildSelection>) -> Vec<ManagedTargetRebuildResult>`
  - 只处理 `skill_enablements` 中记录的受管目标。
  - 对 Symlink：确认目标仍是旧受管链接后删除并创建指向当前根目录的新链接。
  - 对 Copy：确认目标仍是旧受管副本或与旧源内容一致后，备份或删除再复制当前根目录版本；第一版建议必须在 UI 中显式勾选。
  - 目标不存在时可直接按原记录重建。
  - 目标被用户改动或不再匹配受管状态时返回 conflict，不覆盖。

### Frontend Types

- `ExternalSkillCandidateGroup`
  - `directoryName`
  - `displayName`
  - `description`
  - `sources: ExternalSkillCandidateSource[]`
  - `status: "new" | "same_as_current" | "conflict" | "invalid" | "unreadable"`

- `ExternalSkillCandidateSource`
  - `tool`
  - `toolName`
  - `path`
  - `contentHash`
  - `readable`
  - `message?`

- `SkillsRootMigrationState`
  - `previousSkillsRoot`
  - `currentSkillsRoot`
  - `canMigrate`
  - `candidates`
  - `managedTargets`

- `ManagedTargetRebuildResult`
  - `directoryName`
  - `tool`
  - `scope`
  - `projectPath`
  - `status: "rebuilt" | "skipped" | "conflict" | "invalid"`
  - `message`

## Edge Cases

### External Discovery

- 工具目录不存在：不创建目录，候选来源标记为不可用或跳过，并在汇总中显示。
- 工具目录不可读：不中断整体扫描，记录该工具的 warning。
- 工具目录下有文件而非目录：跳过。
- 一级目录缺少 `SKILL.md`：跳过。
- 嵌套目录中有 `SKILL.md`：第一版不递归扫描，避免误收编仓库或依赖目录。
- Skill 目录名包含绝对路径、父目录、路径分隔符或非法名称：标记 invalid，不允许导入。
- 多个工具目录同名同内容：合并为一个候选，用户只需要选一次。
- 多个工具目录同名不同内容：显示多个来源，必须选择一个来源导入或跳过。
- 外部候选与当前统一根目录同名同内容：显示“已存在相同内容”，默认不导入。
- 外部候选与当前统一根目录同名不同内容：显示冲突，不覆盖；后续可引导到现有冲突解决机制。
- 外部候选目录是指向当前统一根目录的符号链接：识别为已受管或相同内容，不重复导入。
- 外部候选目录是指向其他位置的符号链接：读取结果若有效可展示来源，但导入时复制解析后的目录内容；若不可读则标记 unreadable。
- 自定义工具路径和当前统一根目录相同：跳过该工具，避免把真实来源当外部来源。
- 两个自定义工具指向同一目录：候选按目录去重，来源列表保留两个工具名或合并提示。

### Root Switching And Migration

- 新根目录不存在：`set_skills_root` 创建目录；不创建任何 Skill。
- 新根目录为空：列表为空；如果旧根目录或工具目录有候选，显示迁移/发现入口。
- 新根目录已有部分 Skills：只展示新根目录内容；旧根目录中缺失的 Skill 只能通过迁移入口导入。
- 旧根目录不存在：迁移入口显示不可迁移，不报致命错误。
- 旧根目录等于新根目录：不显示迁移入口。
- 旧根目录和新根目录存在同名同内容：迁移时跳过并说明已存在相同内容。
- 旧根目录和新根目录存在同名不同内容：迁移返回 conflict，不覆盖。
- 旧根目录中包含无效 Skill 目录：迁移结果标记 invalid。
- 切换多次根目录：只保留最近一次旧根目录作为迁移来源；历史迁移管理不在本次范围。
- 用户手动把旧根目录删除：迁移检查降级为不可迁移，但仍允许从工具目录发现。

### Managed Target Rebuild

- 旧目标是指向旧根目录的 Workbench 受管 Symlink：删除旧链接，创建指向新根目录的新链接。
- 旧目标是 Copy 副本且仍与旧源内容一致：用户确认后重建为新根目录内容。
- 旧目标是 Copy 副本但用户已修改：返回 conflict，不覆盖。
- 旧目标不存在：按记录重建到目标位置。
- 旧目标被替换成普通目录且内容不同：返回 conflict，不覆盖。
- 新根目录缺少该 Skill：不能重建该 Skill 的目标，提示先迁移或跳过。
- 重建 Symlink 失败：按现有 Auto 同步规则可回退 Copy，但结果必须标明实际 `sync_method`。
- 项目级启用记录：如果记录存在且当前项目路径仍可计算目标，可纳入重建；如果项目路径不存在，返回 skipped 或 invalid，不创建项目目录之外的未知路径。
- 自定义工具启用记录：只处理全局启用；不支持项目级。

## Plan Steps

### 1. Prove Current Gap

Status: done

Work:

- 增加或调整后端测试夹具，证明当前 `get_skills_state` 在当前统一根目录为空时不会发现工具目录已有 Skills。
- 增加前端空状态或 Skills 页面测试，锁定当前缺少发现入口的用户体验。
- 保留现有防覆盖测试，确认本次改动不会放宽覆盖边界。

Verification:

- `cargo test skills::`
- `pnpm test`

### 2. Add Read-Only External Discovery

Status: done

Work:

- 在 `src-tauri/src/skills.rs` 中实现扫描已注册工具全局目录的只读函数。
- 复用或提取 `scan_skill_directories`、目录名校验、内容 hash、元信息解析能力。
- 跳过当前统一根目录和重复路径。
- 逐工具收集不可读、无效、同名同内容、同名不同内容状态。
- 注册 Tauri command，并在 `src/lib/types/domain.ts` 与 `src/lib/api/workbenchApi.ts` 增加类型和 API。

Verification:

- 后端测试覆盖内置工具、自定义工具、路径不存在、不可读目录、重复路径、同名同内容、同名不同内容、非法目录名。
- 前端 API mock/preview 至少支持空候选和多来源候选两种状态。

### 3. Add Explicit External Import UI

Status: done

Work:

- 在 Skills 本地子视图增加“发现已有工具 Skills”入口，优先出现在空状态和导入菜单附近。
- 使用聚焦弹窗展示候选组，按目录名、工具来源、状态和路径展示。
- 对同名不同内容候选提供单选来源；默认不选中冲突项。
- 导入只复制到当前统一根目录，默认不启用到任何工具。
- 导入完成后刷新 Skills 状态，并展示成功、跳过、冲突、无效汇总。

Verification:

- 前端测试覆盖空状态发现入口、候选弹窗、多来源选择、冲突项默认不导入、导入结果汇总。
- 后端测试覆盖导入时不覆盖当前统一根目录同名内容。

### 4. Make Root Switching Explicit And Inspectable

Status: done

Work:

- 调整设置页统一根目录输入交互：路径变化时进入确认弹窗，而不是只靠 `onBlur` 静默切换。
- `set_skills_root` 切换前记录旧根目录。
- 新增迁移状态检查 command，返回旧根目录候选和受管目标重建需求。
- 切换完成后如果存在旧根目录候选或需要重建的受管目标，在设置页 Skills 存储面板展示紧凑 warning 与操作入口。

Verification:

- 后端测试覆盖旧根目录记录、新根目录创建、不迁移内容、不删除旧目录。
- 前端测试覆盖切换确认、取消不改设置、确认后刷新状态、显示迁移入口。

### 5. Add Root Migration

Status: done

Work:

- 实现从旧统一根目录复制选中 Skills 到当前统一根目录。
- 第一版只导入当前根目录不存在的 Skill；同名同内容跳过；同名不同内容返回 conflict，不做覆盖替换。
- 保留旧根目录内容不变。
- 迁移完成后刷新 Skills 状态，并更新迁移状态。

Verification:

- 后端测试覆盖旧根不存在、旧根为空、有效迁移、同名同内容跳过、同名不同内容冲突、无效目录跳过、旧根不被删除。
- 前端测试覆盖迁移弹窗、选择候选、迁移结果汇总、迁移后列表刷新。

### 6. Add Managed Target Rebuild

Status: done

Work:

- 实现受管启用目标检查：基于 `skill_enablements`、旧根目录、当前根目录和目标路径判断是否需要重建。
- 实现显式重建 command。
- Symlink：只删除确认仍指向旧根目录的受管链接，然后创建指向当前根目录的新链接。
- Copy：只处理仍可证明是 Workbench 受管副本的目录；若内容不同则返回 conflict。
- 重建后更新 `skill_enablements.link_path` 和 `sync_method`，并刷新 Skills 状态。
- UI 在迁移完成后提示“重建受管启用目标”，并展示逐项结果。

Verification:

- 后端测试覆盖 Symlink 重建、Copy 重建、目标不存在后重建、目标被用户修改时拒绝、当前根目录缺少源 Skill 时跳过、自定义工具全局启用。
- 前端测试覆盖重建入口、确认弹窗、逐项结果和冲突提示。

### 7. Documentation And Full Verification

Status: done

Work:

- 更新 `docs/capabilities/skills-management.md`，记录外部发现、显式迁移、重建受管目标、根目录切换边界。
- 视实施结果更新 `docs/ARCHITECTURE.md` 的 Skills 流程和设置项说明。
- 若新增 commands 或长期数据字段，需要更新 `docs/ai/context-map.md`。
- 运行格式化、测试和统一验证。

Verification:

- `pnpm test`
- `pnpm verify`
- 如涉及 Tauri release 风险，再运行 `pnpm tauri:verify-build`
- Dev Flow 文档检查命令可运行时执行：
  `node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.7.2\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench`

## Acceptance Criteria

- 当当前统一根目录为空但 `.codex/skills`、`.claude/skills` 或自定义工具目录中已有 Skills 时，用户能看到“发现已有工具 Skills”的入口。
- 发现过程只读，不创建、不删除、不复制、不写数据库。
- 用户能选择外部候选导入当前统一根目录；导入后默认不启用。
- 同名不同内容必须显示冲突，不能静默覆盖。
- 切换统一根目录需要确认；确认后只切换，不迁移、不重建、不删除旧目录。
- 切换后旧根目录中存在可迁移 Skills 时，用户能看到迁移入口。
- 迁移只在用户执行后发生，且不删除旧根目录。
- Workbench 能识别仍指向旧根目录的受管启用目标，并在用户确认后重建。
- 未受管的外部工具目录内容不会被删除或覆盖。
- 后端和前端测试覆盖主要边界情况。
- 能力文档反映最终实现行为。

## Risks

- `skills.rs` 已经较大，继续新增功能可能增加维护压力；实施时应优先提取小型纯函数，但不做大规模模块拆分。
- Windows 符号链接权限和路径解析可能导致 Symlink 重建失败；需要保留现有 Auto 同步回退 Copy 语义并测试。
- Copy 副本是否仍为 Workbench 管理内容只能通过记录和内容比对推断；不确定时必须 fail loud。
- 根目录切换后的旧启用记录可能与当前源路径不一致；重建逻辑必须基于当前根目录存在的 Skill 执行。
- UI 状态较多，弹窗内需要避免一次展示过多解释；优先用状态徽标、路径和结果摘要表达。

## 产物路由

- 计划文档：`docs/plans/2026-06-21-skills-discovery-root-migration.md`
- 来源审计：`docs/audits/archived/2026-06-20-existing-global-skills-first-run-audit.md`
- 能力文档更新：`docs/capabilities/skills-management.md`
- 架构文档更新：大概率需要更新 `docs/ARCHITECTURE.md`
- 上下文索引更新：如果新增命令或源文件职责发生明显变化，需要更新 `docs/ai/context-map.md`
- 架构决策记录：暂不确定；只有实施中改变统一根目录真实来源原则时才需要
- 变更日志：大概率需要更新，因为这是用户可见的 Skills 管理行为变化
- 测试：必须覆盖 Rust 后端和 React 前端
- 设计系统影响：预计无；复用现有弹窗、提示块、状态徽标、表格行和设置面板模式

## 收尾要求

- 实施应使用 `/dev-branch`，因为任务横跨后端、前端、文档、测试和用户可见工作流。
- 实施后运行 `/dev-distill`，或通过 dev-branch 收尾门禁更新长期知识，并判断是否需要架构决策记录。
- 文档更新后运行 `/dev-check`，验证文档路由和生命周期产物保持一致。
