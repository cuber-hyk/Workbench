---
artifact_type: audit
status: active
created: 2026-06-19
updated: 2026-06-19
scope: "Skills 全局工具展开、软件更新说明、项目打开方式终端命令"
source_of_truth: "src/App.tsx; src/components/AppUpdatePanel.tsx; src/styles.css; src-tauri/src/projects.rs"
---

# Skills、更新说明与打开方式审查

## Scope

审查用户反馈的三个问题：

- Skills 管理列表中 `+13` 展开后没有可见反应。
- 软件更新弹窗的更新说明需要分点、一点一行并提升可读性。
- `deveco -c --skip-agreement` 在 Workbench 外部终端打开方式中失败，但手动终端输入可以运行。

## Questions

- `+13` 点击是否触发状态，若触发为什么用户看不到结果？
- 更新说明是否有结构化渲染入口？
- 终端打开方式如何拼接 `command`、`args` 和 `{projectPath}`？

## Fact Sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/ai/context-map.md`
- `docs/capabilities/project-management.md`
- `docs/adr/2026-06-16-project-open-profiles.md`
- `docs/capabilities/app-update.md`
- `src/App.tsx`
- `src/components/AppUpdatePanel.tsx`
- `src/components/app-update.test.tsx`
- `src/styles.css`
- `src-tauri/src/projects.rs`

## Findings

| ID | Severity | Status | Summary |
|---|---|---|---|
| AUD-2026-06-19-001 | P1 | verified | 终端打开方式把带参数的 `command` 当成单个程序名执行。 |
| AUD-2026-06-19-002 | P2 | verified | Skills `+N` 工具浮层被父级 overflow 裁切。 |
| AUD-2026-06-19-003 | P2 | verified | 更新说明以整段文本渲染，缺少分点展示。 |

### AUD-2026-06-19-001

- Severity: P1
- Status: verified
- Confidence: Confirmed
- Finding: 终端打开方式把 `command` 字段整体当作可执行程序引用，导致包含参数的命令如 `deveco -c --skip-agreement` 被 PowerShell 当成单个命令名查找。
- Evidence: `src-tauri/src/projects.rs` 的 `terminal_command_line` 使用 `profile_program(profile)` 生成 `program` 后直接 `quote_powershell_arg(&program)`；截图中的错误显示 PowerShell 执行了 `& 'deveco -c --skip-agreement' 'E:\Development\...'`。
- Owner Plan: codex/task/20260619-fix-skills-update-open-profile
- Branch/Commit: codex/task/20260619-fix-skills-update-open-profile / pending review
- Verification: `cargo test --manifest-path src-tauri/Cargo.toml terminal_command_line -- --nocapture` 通过。
- Closeout: fixed
- Impact: 用户无法通过 Workbench 配置带参数的交互式 CLI 打开项目。
- Fix direction: 保持 `args` 作为附加参数入口，同时让 terminal 类型的 PATH 命令支持内联参数，生成 `& deveco -c --skip-agreement '{projectPath}'`；可执行文件路径仍单独引用以兼容带空格路径。

### AUD-2026-06-19-002

- Severity: P2
- Status: verified
- Confidence: Confirmed
- Finding: Skills 列表中的工具溢出弹层会被 `.tool-icons { overflow: hidden }` 裁切，点击 `+13` 后状态可能已展开，但弹层不可见或不完整。
- Evidence: `src/App.tsx` 的 `GlobalToolIcons` 在 `expanded` 为真时把 `.tool-more-popover` 渲染为 `.tool-icons` 子元素；`src/styles.css` 同时设置 `.tool-icons { overflow: hidden }`。
- Owner Plan: codex/task/20260619-fix-skills-update-open-profile
- Branch/Commit: codex/task/20260619-fix-skills-update-open-profile / pending review
- Verification: `pnpm test -- src/components/app-update.test.tsx src/App.test.tsx` 通过；样式改为允许工具浮层溢出显示。
- Closeout: fixed
- Impact: 用户无法发现或切换第 5 个及之后的全局工具启用状态。
- Fix direction: 让 `.tool-icons` 不裁切弹层，或把弹层移到不受 overflow 限制的容器；同时保留图标行本身紧凑不撑破表格。

### AUD-2026-06-19-003

- Severity: P2
- Status: verified
- Confidence: Confirmed
- Finding: 更新说明直接渲染原始 `updateInfo.body` 为一个段落，不能把一段 release note 自动整理成分点列表。
- Evidence: `src/components/AppUpdatePanel.tsx` 使用 `<p>{updateInfo.body}</p>`；`src/styles.css` 仅设置 `.update-release-notes p { white-space: pre-wrap; overflow-wrap: anywhere; }`。
- Owner Plan: codex/task/20260619-fix-skills-update-open-profile
- Branch/Commit: codex/task/20260619-fix-skills-update-open-profile / pending review
- Verification: `pnpm test -- src/components/app-update.test.tsx src/App.test.tsx` 通过。
- Closeout: fixed
- Impact: 更新弹窗信息密度高、扫描成本高，用户难以快速理解变更。
- Fix direction: 先按换行和常见列表符号解析；如果远端是单段中文，用中文分号/句号做保守切分，渲染为列表，一点一行，并用 CSS 做间距和层级。

## Verification

- `pnpm test -- src/components/app-update.test.tsx src/App.test.tsx` 通过。
- `cargo test --manifest-path src-tauri/Cargo.toml terminal_command_line -- --nocapture` 通过。
- `pnpm verify` 通过。
- 浏览器快检点击 Skills 列表 `+13` 后 `.tool-more-popover` 可见，尺寸约 `190x280`，包含完整工具列表。
- 已更新 `CHANGELOG.md`、`docs/capabilities/project-management.md` 和 `docs/capabilities/app-update.md`。

## Open Questions

- none

## Artifact Routing

- Fix plan: completed in `codex/task/20260619-fix-skills-update-open-profile`。
- Implementation: completed and pending review approval。
- Stable knowledge / ADR gate: capability docs updated; ADR not needed for this small behavior clarification。
