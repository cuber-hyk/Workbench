---
artifact_type: plan
status: archived
created: 2026-06-19
updated: 2026-06-19
owner: codex
---

# Custom Tool Targets Plan

## Goal

为 Workbench 增加自定义 Agent 工具支持，让用户在内置工具列表更新滞后时，也能自行配置新的全局 Skills 目录，并在设置页和 Skills 列表中统一显示工具图标。

## Scope

- 增加自定义工具数据模型和 SQLite 持久化。
- 将后端工具目标从固定注册表扩展为“内置工具 + 自定义工具”的统一返回。
- 自定义工具第一阶段只支持全局 Skills 目录。
- 设置页支持新增、编辑、删除自定义工具。
- 设置页“支持的工具目录”行显示工具图标和内置/自定义类型标签。
- 自定义工具图标复制到 Workbench 本地目录并由 Workbench 管理。
- Skills 表格、工具筛选和 `+N` 浮层继续复用统一 `ToolTarget[]`。

## Non-Goals

- 不支持自定义工具的项目级 Skills 目录。
- 不实现工具安装检测、命令 PATH 检测或 Agent 登录状态诊断。
- 不做在线工具目录或远程图标下载。
- 删除自定义工具时不删除外部工具目录中的用户文件。
- 不重构 Skills 模块整体文件结构。

## Assumptions And Decisions

- 自定义工具第一阶段只支持 `global` scope；`supports_project_scope` 固定为 `false`。
- 自定义工具图标复制到 `~/.workbench/tool-icons/`，避免用户移动原图后 UI 丢图。
- 删除自定义工具会删除 Workbench 中的工具配置、展示顺序项和该工具相关启用记录，但不删除工具目录本身，也不删除未被 Workbench 管理的外部内容。
- 内置工具不可删除，路径仍由后端固定注册表定义。
- 自定义工具 key 是后端内部标识，新增时根据名称自动生成，必须全局唯一，不能与内置工具 key 冲突。
- ADR gate：暂不需要。该能力扩展现有 Skills 工具目标模型，不改变统一 Skills 根目录的数据所有权；实施结束后通过 dev-distill 判断是否需要补充能力文档或 ADR。

## Fact Sources

- `AGENTS.md`：中文沟通、简单优先、外科手术式修改、不直接 push。
- `CONTEXT.md`：Skills 统一根目录是真实来源，启用使用 Auto 同步。
- `docs/ai/context-map.md`：Skills 入口为 `src-tauri/src/skills.rs`、`src/App.tsx`、`src/lib/types/domain.ts`、`src/lib/api/workbenchApi.ts`。
- `docs/capabilities/skills-management.md`：当前工具目标由后端固定注册表定义，展示顺序保存在 `app_settings.tool_target_order`。
- `DESIGN.md`：设置页使用紧凑路径行；工具目录行支持排序、打开目录和可用状态；Skills 表格使用紧凑彩色工具图标。
- `src-tauri/src/skills.rs`：`TOOL_TARGET_DEFINITIONS`、`ToolTarget`、`tool_target_path`、`ordered_tool_targets`、`set_tool_target_order`、启用/停用/冲突扫描逻辑。
- `src/App.tsx`：SettingsView、ToolIcon、GlobalToolIcons、工具筛选和 Skills 表格展示。
- `src/lib/types/domain.ts`：前端 `ToolTarget` 类型。
- `src/lib/api/workbenchApi.ts`：Tauri commands API 边界。

## Implementation Steps

1. Data Model And Types
   - Status: done
   - Work: 新增 `custom_tool_targets` 表及迁移；扩展 Rust/TypeScript `ToolTarget` 字段，例如 `source`、`iconPath`、`supportsProjectScope`。
   - Verification: Rust 单测覆盖自定义工具持久化、key 自动生成、名称唯一性和内置名称冲突拒绝。

2. Unified Tool Registry
   - Status: done
   - Work: 将后端工具目标读取改为内置定义 + SQLite 自定义工具合并；排序继续使用 `tool_target_order`，缺失项追加到末尾。
   - Verification: Rust 单测覆盖内置和自定义混合排序、自定义工具出现在 `get_skills_state`、不支持 project scope。

3. Custom Tool Commands
   - Status: done
   - Work: 增加保存、删除自定义工具 commands；保存时校验名称和全局目录，并自动生成内部 key；删除时清理 Workbench 记录但不删除外部目录。
   - Verification: Rust 单测覆盖新增、编辑、删除、删除后相关启用记录清理、不删除外部目录。

4. Icon Ownership
   - Status: done
   - Work: 增加图标选择/导入流程；将用户选择的图标复制到 `~/.workbench/tool-icons/`；无图标时使用名称缩写 fallback。
   - Verification: 单测或后端测试覆盖图标复制路径和缺失图标 fallback；手动验证设置页和 Skills 表格显示一致。

5. Settings UI
   - Status: done
   - Work: 设置页工具目录行显示工具图标、类型标签、路径、排序、打开目录和状态；新增自定义工具弹窗；自定义工具行显示编辑/删除操作。
   - Verification: 前端测试覆盖新增/编辑/删除入口、图标展示、排序调用、打开不存在目录仍触发创建确认。

6. Skills UI Reuse
   - Status: done
   - Work: 改造 `ToolIcon` 使用 `ToolTarget` 信息而不是仅依赖内置 key 映射；Skills 表格、筛选器、`+N` 浮层复用同一工具列表。
   - Verification: 前端测试覆盖自定义工具出现在筛选器、全局启用列和 `+N` 浮层，并能触发全局启用切换。

7. Documentation And Release Notes
   - Status: done
   - Work: 更新 `CHANGELOG.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/capabilities/skills-management.md`，必要时更新 `DESIGN.md` 和 `docs/ai/context-map.md`。
   - Verification: Dev Flow 文档校验通过；文档不承诺项目级自定义工具。

8. Final Verification
   - Status: done
   - Work: 运行统一验证和桌面构建验证。
   - Verification: `pnpm verify` 通过；必要时运行 `pnpm tauri:verify-build`；默认窗口下设置页和 Skills 表格无横向溢出。

## Risks

- 自定义工具 key 如果暴露给用户，会增加理解成本；必须由后端自动生成 slug 并拒绝内部冲突。
- 删除自定义工具涉及启用记录清理，必须坚持“不删除未受管外部目录内容”的边界。
- 图标路径跨平台和文件移动风险较高，所以采用复制到 Workbench 本地目录的所有权模型。
- 当前 `src-tauri/src/skills.rs` 已较大，修改需要保持外科手术式范围，避免顺手拆模块。

## Acceptance Criteria

- 用户可在设置页新增自定义工具，配置名称、全局 Skills 目录和可选图标。
- 设置页工具目录列表显示内置和自定义工具图标，并标记工具类型。
- 自定义工具出现在 Skills 表格全局启用列、工具筛选器和 `+N` 浮层。
- 自定义工具可用于全局启用/停用 Skill。
- 删除自定义工具不会删除该工具的外部 Skills 目录。
- 内置工具仍按原有路径和项目级支持规则工作。
- `pnpm verify` 通过。

## Artifact Routing

- Plan: `docs/plans/2026-06-19-custom-tool-targets.md`
- Implementation: `src-tauri/src/skills.rs`、`src-tauri/src/lib.rs`、`src/App.tsx`、`src/lib/types/domain.ts`、`src/lib/api/workbenchApi.ts`、`src/lib/api/mockData.ts`、`src/styles.css`
- Tests: `src/App.test.tsx`、`src-tauri/src/skills.rs` tests
- Docs: `CHANGELOG.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/capabilities/skills-management.md`、`docs/ai/context-map.md`
- Design system impact: update
- ADR gate: maybe after implementation; run dev-distill to decide.

## Execution Readiness

Ready. Product decisions are confirmed, source files are known, and validation path is defined. Next step is the `/dev-branch` skill for reviewed implementation.
