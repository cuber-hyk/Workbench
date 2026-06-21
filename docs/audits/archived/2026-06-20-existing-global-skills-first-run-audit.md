---
artifact_type: audit
status: archived
created: 2026-06-20
updated: 2026-06-21
scope: "Skills 首次使用时 .codex/.claude 已有技能但 .workbench/skills 为空的处理"
source_of_truth: "docs/capabilities/skills-management.md; src-tauri/src/skills.rs; src/App.tsx"
---

# 已有全局 Skills 首次接入审查

## Scope

审查用户提出的场景：用户刚安装 Workbench，`~/.workbench/skills` 尚无 Skill，但 `~/.codex/skills` 或 `~/.claude/skills` 已存在用户已有 Skills。

## Questions

- 当前实现是否会针对性发现或接入外部已有 Skills？
- 已有边界保护是否避免覆盖或删除用户外部目录内容？
- 哪些边界情况已覆盖，哪些仍缺少产品化入口？

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/capabilities/skills-management.md`
- `src-tauri/src/skills.rs`
- `src/App.tsx`

## Findings

| ID | Severity | Status | Finding | Evidence | Owner Plan | Branch/Commit |
|---|---|---|---|---|---|---|
| AUD-2026-06-20-001 | P2 | verified | 首次安装且统一根目录为空时，不会主动发现或引导导入 `.codex/.claude` 中已有 Skills。 | `get_skills_state` 只扫描统一根目录；外部工具目录仅作为启用目标和冲突比较对象。 | `docs/plans/archived/2026-06-21-skills-discovery-root-migration.md` | `task/20260621-skills-discovery-root-migration` |

### AUD-2026-06-20-001

- Severity: P2
- Status: verified
- Confidence: Confirmed
- Finding: 当前 Skills 列表只扫描 Workbench 统一根目录；外部工具目录仅作为启用目标和冲突比较对象参与处理。因此当 `~/.workbench/skills` 为空时，即使 `~/.codex/skills` 或 `~/.claude/skills` 已有内容，界面仍会显示暂无 Skills，而不会展示“发现已有全局 Skills，可导入/收编/保持外部”的首次接入流程。
- Evidence: `docs/capabilities/skills-management.md` 声明扫描统一 Skills 根目录；`src-tauri/src/skills.rs` 的 `scan_skill_directories` 只扫描传入根目录；`get_skills_state` 使用配置的 `skills_root` 扫描；`.codex` 和 `.claude` 只在工具目标定义中注册为目标目录；`src/App.tsx` 空状态文案为“暂无 Skills”。
- Owner Plan: docs/plans/archived/2026-06-21-skills-discovery-root-migration.md
- Branch/Commit: task/20260621-skills-discovery-root-migration
- Verification: `pnpm verify` 通过；后端测试覆盖外部工具目录发现、旧根目录迁移同名跳过/冲突、受管 Copy 目标重建；前端测试覆盖 Skills 页面发现入口。
- Closeout: fixed
- Impact: 已经长期使用 Codex 或 Claude Code Skills 的新用户，会误以为 Workbench 没有识别已有资产；后续只能手动通过“导入 Skills”选择文件夹，且没有跨工具去重、同名选择和安全说明的专门引导。

## Confirmed Existing Protections

- 内置全局目标包括 `.codex/skills` 和 `.claude/skills`。
- 启用到工具目录时，如果目标路径已有内容且不是 Workbench 受管目标，会报错并拒绝覆盖。
- Workbench 能检测统一根目录 Skill 与外部同名目标内容是否一致；一致时可登记为受管，冲突时显示内容冲突。
- 解决冲突前会备份被替换版本。
- 删除或停用只清理 Workbench 记录中的受管链接或副本，不删除未受管的外部目录。
- 导入和市场安装遇到统一根目录同名 Skill 会停止或跳过，不直接覆盖。

## Verification

- `pnpm verify` 通过。
- 外部发现、显式迁移、受管目标重建和文档路由已在同一任务分支完成。
- 产品问题已关闭：入口采用用户显式打开的“发现已有工具 Skills”，同名不同内容在第一版中显示冲突且不覆盖。

## Artifact Routing

- Fix plan: docs/plans/archived/2026-06-21-skills-discovery-root-migration.md
- Implementation: task/20260621-skills-discovery-root-migration
- Stable knowledge / ADR gate: 已更新 `docs/capabilities/skills-management.md`、`docs/ARCHITECTURE.md` 和 `docs/ai/context-map.md`；未改变“统一根目录是真实来源”的原则，不需要 ADR。
