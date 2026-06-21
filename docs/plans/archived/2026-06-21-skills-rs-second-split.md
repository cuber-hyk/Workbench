---
artifact_type: plan
status: archived
created: 2026-06-21
updated: 2026-06-21
owner: codex
---

# Skills Rust 第二轮拆分计划

## Goal

继续降低 `src-tauri/src/skills.rs` 的维护压力，把已经有清晰 owner 的内部能力移入命名模块，同时保持所有 Tauri command、数据库语义、文件系统副作用和前端 API 行为不变。

## Scope

- 只处理 `src-tauri/src/skills.rs` 和 `src-tauri/src/skills/` 下直接相关模块。
- 先做上一轮按新版拆分规则暴露出的局部整理：把单 owner 私有常量和结构从 `types.rs` 移回实际 owner 模块。
- 本轮建议拆分 4 个能力边界：分类、自定义工具目标配置、导入/外部发现、根目录迁移和受管目标重建。
- 保留 `src-tauri/src/skills.rs` 作为 command facade 和跨流程编排入口。

## Non-goals

- 不改变 Tauri command 名称、参数、返回结构或前端调用方式。
- 不修改数据库 schema、迁移规则或现有业务语义。
- 不拆 `src/App.tsx`、`projects.rs`、`radar.rs` 或测试文件。
- 不为了行数目标拆分市场 command wrapper、启用流程或通用 helper。
- 不新增 `utils`、`helpers`、`common`、`part-*` 或语义空泛模块。

## Assumptions And Decisions

- Decision: 本轮分类为 `建议拆分`，依据是 `skills.rs` 当前仍混合分类管理、自定义工具、导入发现、迁移重建、市场 wrapper 和启用编排，局部修改需要阅读大量无关上下文。
- Decision: `catalog.rs` 暂不创建；它容易成为状态聚合桶，当前只做 `局部整理` 或延后。
- Decision: `enablement.rs` 暂不创建；启用、冲突、同步和受管目标关系耦合最高，拆分风险高，归类为 `延后处理`。
- Decision: 市场 command wrapper 保留在 `skills.rs`；核心 `market.rs` 和 `cli.rs` 已经拆出，继续拆 wrapper 的收益不足，归类为 `不拆分`。
- Decision: `types.rs` 只保留跨模块 DTO、enum 和确实多 owner 使用的类型；单 owner 私有常量和结构移到 owner 模块。
- Assumption: `docs/plans/2026-06-21-sandbox-profile.md` 是其他任务的未跟踪文件，本计划和后续实现不得修改它。

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/capabilities/skills-management.md`
- `C:\Users\胡运宽\.workbench\skills\split-large-code-files\SKILL.md`
- `src-tauri/src/skills.rs`
- `src-tauri/src/skills/types.rs`
- `src-tauri/src/skills/db.rs`
- `src-tauri/src/skills/filesystem.rs`
- `src-tauri/src/skills/tool_targets.rs`
- `src-tauri/src/skills/market.rs`
- `src-tauri/src/skills/cli.rs`

## Candidate Classification

| Candidate | Classification | Reason |
|---|---|---|
| `src-tauri/src/skills.rs` 分类管理函数 | `建议拆分` | 分类 CRUD、校验、系统分类保护和 state 刷新形成清晰业务边界。 |
| `src-tauri/src/skills.rs` 自定义工具函数 | `建议拆分` | key/name/path/icon 校验和 `custom_tool_targets` 写入集中，修改设置页工具配置时不应阅读导入或市场逻辑。 |
| `src-tauri/src/skills.rs` 导入和外部发现函数 | `建议拆分` | 本地文件夹、ZIP、外部工具目录发现和导入选择是独立输入流程。 |
| `src-tauri/src/skills.rs` 根目录迁移和受管目标重建函数 | `建议拆分` | 迁移检查、hash、备份、重建候选分类和重建执行围绕根目录切换后的派生目标修复。 |
| `src-tauri/src/skills.rs` 市场 command wrapper | `不拆分` | 核心市场解析、来源记录和 CLI 适配已拆出；剩余 wrapper 保持 command 入口清晰。 |
| `src-tauri/src/skills.rs` 启用/冲突/删除编排 | `延后处理` | 同时接触数据库、文件系统、工具目标和冲突备份，拆分需要更小的专项计划。 |
| `src-tauri/src/skills/types.rs` 单 owner 私有项 | `局部整理` | 新版拆分规则要求只有多个模块都会使用时才抽共享类型、常量或工具。 |

## Execution Steps

| ID | Status | Step | Verification |
|---|---|---|---|
| S2-1 | todo | 执行基线验证，确认当前 `master` 的 Rust 行为可作为拆分前基线。 | `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast` |
| S2-2 | todo | 局部整理 `types.rs`：把 `SKILLS_CLI_TIMEOUT_SECONDS` 移到 `cli.rs`，把 tool target 定义和排序 setting 移到 `tool_targets.rs`，把关闭行为 setting 移到 `db.rs`，把安装进度和 frontmatter 等单 owner 类型移到实际 owner。 | `cargo fmt --manifest-path src-tauri/Cargo.toml --check`; `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast` |
| S2-3 | todo | 新增 `src-tauri/src/skills/categories.rs`，移动分类列表、创建、重命名、删除、合并、分类名校验和相关私有 helper；`skills.rs` 只保留 command facade。 | 分类相关 Rust tests；`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` |
| S2-4 | todo | 新增 `src-tauri/src/skills/custom_tools.rs`，移动自定义工具 key/name/path/icon 校验、保存、删除和排序归一化；保持 `tool_targets.rs` 继续负责目标定义和路径解析。 | 自定义工具相关 Rust tests；检查没有 `pub(crate)` 扩散 |
| S2-5 | todo | 新增 `src-tauri/src/skills/importer.rs`，移动 `parse_skill_markdown`、扫描、文件夹/ZIP 导入、外部发现和外部导入选择流程。 | 导入、扫描和外部发现相关 Rust tests；确认 `skills.rs` command 签名不变 |
| S2-6 | todo | 新增 `src-tauri/src/skills/migration.rs`，移动旧根目录迁移检查、迁移执行、受管目标重建候选、重建分类和重建执行。 | 旧根目录迁移、受管 Copy 重建和冲突相关 Rust tests |
| S2-7 | todo | 收尾审查模块边界、可见性和文档影响，只在 durable architecture facts 变化时更新 `docs/ARCHITECTURE.md`、`docs/ai/context-map.md` 或 `docs/capabilities/skills-management.md`。 | `rg "pub\\(crate\\)|part-|misc|common|utils" src-tauri/src/skills.rs src-tauri/src/skills`; `cargo fmt --manifest-path src-tauri/Cargo.toml --check`; `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast`; `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`; Dev Flow docs validation if docs change |

## Expected Module Shape

```text
src-tauri/src/skills.rs
src-tauri/src/skills/
  categories.rs
  cli.rs
  custom_tools.rs
  db.rs
  filesystem.rs
  importer.rs
  market.rs
  migration.rs
  tool_targets.rs
  types.rs
```

## Split Explanation

- 目标文件：`src-tauri/src/skills.rs`。
- 候选原因：第一轮后仍承载多条独立业务流程，局部修改分类、导入或迁移时需要阅读市场、启用和自定义工具等无关上下文。
- 对外入口：`src-tauri/src/lib.rs` 注册的 Tauri command 和 `skills::...` public function 保持稳定。
- 共享状态：SQLite 连接、统一 Skills 根目录、工具目标注册表、`skill_enablements`、`skill_categories`、`custom_tool_targets`、`skill_sources`。
- 副作用来源：SQLite、Skills 根目录文件读写、ZIP 解压、符号链接/复制、备份目录、系统打开路径、Tauri dialog、skills.sh CLI 和网络市场请求。
- 保持不拆的备选判断：市场 wrapper、启用流程和 catalog 聚合暂不拆，因为继续拆会制造胶水层或扩大验证成本。
- 拆分边界：分类、自定义工具、导入发现、迁移重建按业务能力命名，不按行数分块。
- 预计新增文件：`categories.rs`、`custom_tools.rs`、`importer.rs`、`migration.rs`。
- 预计修改文件：`skills.rs`、`types.rs`、`cli.rs`、`db.rs`、`tool_targets.rs`，以及必要的 module declaration。
- 对外 API：不变化。

## Risks

- 把 helper 移出 `skills.rs` 时可能临时放宽可见性，导致内部 API 面扩大。
- 导入和迁移流程都依赖文件系统 helper、hash、备份和数据库记录，边界处理不当会出现循环依赖。
- `types.rs` 局部整理如果移动过度，可能导致 DTO 和 owner 私有类型边界不清。
- 纯移动代码的 diff 可能掩盖行为变化。

## Risk Controls

- 每次只移动一个能力组，移动后立即格式化和测试。
- 默认使用 `pub(super)`，避免新增 `pub(crate)`；只有 command 入口和跨模块 DTO 保持 `pub`。
- `skills.rs` 只做 command facade 和必要编排，不新增转发式聚合模块。
- 对照现有 Rust tests 验证行为；失败时先判断是否为移动引入，而不是扩大重构。
- 提交前用 `git diff --stat` 和 focused diff 检查是否误改无关文件。

## Acceptance Criteria

- `skills.rs` 仍是稳定 command facade，但分类、自定义工具、导入发现、迁移重建逻辑已移入命名模块。
- `types.rs` 不再承载明显单 owner 的私有常量或结构。
- 没有新增机械命名、空泛 helper 模块、循环依赖或重复实现。
- Tauri command、前端 API、数据库表和用户可见行为保持不变。
- Rust 格式、测试和 Clippy 验证通过，或任何失败都有明确的既有失败证据。
- 能清楚说明本轮降低的成本：分类、自定义工具、导入和迁移相关修改可以在对应模块内阅读和验证，不必扫完整 `skills.rs`。

## Artifact Routing

- Plan: `docs/plans/2026-06-21-skills-rs-second-split.md`
- Source audit: none
- Covered findings: none
- Deferred findings: enablement/conflict/delete split; frontend `App.tsx` split
- Capability docs: maybe; 只有源文件边界成为长期事实时更新
- Context map: maybe; 只有新增模块需要作为长期入口被索引时更新
- Changelog: not needed for behavior-preserving internal refactor
- Distill: needed after implementation if module boundaries become durable architecture facts
- ADR gate: not needed; 本轮延续已确认的同名目录模块化方向，不引入新的长期架构政策

## Completion

本计划已完成并归档。第二轮实现通过 Rust 格式、测试和 Clippy 验证；分类、自定义工具、导入发现、根目录迁移和受管目标重建已移入命名模块，`skills.rs` 保持 command facade 和剩余启用/冲突/删除编排入口。
