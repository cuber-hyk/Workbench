---
artifact_type: plan
status: archived
created: 2026-06-24
updated: 2026-06-24
owner: codex
---

# App Chrome And Icon Polish Plan

## Goal

优化 Workbench 顶部原生标题栏与应用内容之间的视觉衔接，并将软件图标更新为已确认的工具箱图标方向，让桌面图标、窗口图标和应用内品牌标识形成一致的 Workbench 身份。

## Scope

- 顶部边框采用原生标题栏轻量过渡方向：
  - 保留系统原生 Windows 标题栏和窗口控制按钮。
  - 在应用内容顶端增加轻量过渡层，例如细分隔线、浅色高光和微阴影。
  - 保持左侧 sidebar、右侧工作区和主导航结构不变。
- 软件图标采用工具箱图标方向：
  - 方向为“工具箱 / Skills 包 / 本地开发工作台”的抽象图标。
  - 使用 Workbench teal、graphite 和 off-white 色系。
  - 生成或重建清晰的源图标，并输出 Tauri bundle 所需图标资源。
  - 同步更新应用内侧边栏品牌标识，避免桌面图标和 App 内品牌不一致。

## Non-Goals

- 不实现自定义标题栏。
- 不重做窗口拖拽、最小化、最大化或关闭按钮。
- 不改变 App Shell DOM 结构、导航模块、侧边栏宽度或页面布局。
- 不引入装饰性背景、渐变光斑或营销式视觉。
- 不改发布签名、updater 配置或应用版本号。
- 不修改 Agent 工具图标系统。

## Assumptions And Decisions

- 用户已选择工具箱图标概念。
- 顶部边框采用原生标题栏轻量过渡方向，因为它能解决截图中的断层感，同时不改变窗口系统行为。
- 图标最终资产应优先有可维护的源文件，例如 `src/assets/brand/workbench-icon.svg` 或等价源 PNG；Tauri `.ico` 作为派生产物。
- 当前 Tauri 配置只引用 `src-tauri/icons/icon.ico`，本次继续维护该现有 bundle 入口，不新增多平台 icon set。
- App 内品牌已从 `.brand-mark` 的文字 `W` + `Workbench` 替换为同源图标资产 + `Workbench` 文本。

## Fact Sources

- `AGENTS.md`：中文沟通、简单优先、外科手术式修改、不直接 push、验证命令。
- `CONTEXT.md`：Workbench 是本地优先桌面工作台，UI 使用固定左侧导航 + 右侧工作区。
- `docs/ai/context-map.md`：App Shell 入口为 `src/App.tsx`，设计来源为 `DESIGN.md` 和 `design-tokens.json`。
- `DESIGN.md`：桌面工作台应安静、紧凑、清晰；App Shell 使用固定左侧导航；浅色主题必须完整浅色；禁用装饰性渐变光斑和绕过 App Shell 的一次性页面风格。
- `src/styles.css`：App Shell、sidebar、brand、main 内容区和主题 token 的当前样式。
- `src/App.tsx`：当前 `.brand` / `.brand-mark` 和 App Shell DOM。
- `src-tauri/tauri.conf.json`：bundle icon 当前配置为 `icons/icon.ico`。
- `src-tauri/icons/icon.ico`：当前桌面图标资源。
- `C:\Users\胡运宽\.codex\generated_images\019ef7c9-b86a-71f2-acbe-ffddfd5aa982\ig_0d13d6a2e6fd3c12016a3b9d9d91948196a286d7673d847924.png`：图标概念图，工具箱图标方向为用户确认方向。

## Split Guidance

Classification: `defer`.

- `src/App.tsx` 是大文件，但本任务只替换品牌标识引用，不新增 App-level 状态或业务逻辑。
- 顶部边框样式应放在 `src/styles.css` 的 App Shell / theme 样式附近，不创建新的通用样式模块。
- 图标资产应放在明确的品牌资源路径，例如 `src/assets/brand/` 和 `src-tauri/icons/`，不混入 `src/assets/tool-icons/`。
- 本次不保留图标生成脚本；`src/assets/brand/workbench-icon.svg` 是可维护源资产，`src-tauri/icons/icon.ico` 是 bundle 入口产物。

## Steps

1. `done` 建立当前视觉和资源基线
   - 确认当前窗口截图问题点、App Shell 顶部样式、当前 `icon.ico` 尺寸和 Tauri icon 配置。
   - Verification: 记录 `src/styles.css`、`src/App.tsx`、`src-tauri/tauri.conf.json` 和 `src-tauri/icons/` 的相关入口。

2. `done` 实施顶部边框轻量过渡
   - 为 App 内容顶端增加轻量过渡边界，优先使用主题变量、细分隔线、浅高光和微阴影。
   - 同时检查浅色和深色主题，避免只适配截图中的浅色主题。
   - Verification: 前端构建通过；视觉检查确认原生标题栏与内容区衔接更自然，且没有改变布局高度和交互。

3. `done` 制作工具箱图标源资产
   - 基于工具箱图标方向重建一个清晰、可维护、适合小尺寸识别的 Workbench 图标源资产。
   - 视觉要求：工具箱 / Skills 包意象，teal 主色，graphite 结构，少细节，无完整文字。
   - Verification: 检查 16/32/64/128/256 等小尺寸可读性；确认没有水印、无多余文字。

4. `done` 生成并接入 Tauri 图标资源
   - 用源图标生成 Tauri 所需图标，至少覆盖当前 `src-tauri/icons/icon.ico`。
   - 保持 `tauri.conf.json` 现有 `icons/icon.ico` 引用路径不变。
   - Verification: `pnpm tauri:verify-build` 或等价 Tauri build check 通过。

5. `done` 同步应用内品牌标识
   - 将侧边栏 `.brand-mark` 从文字 `W` 改为与新图标同源的图标展示，保留 `Workbench` 文本。
   - 只调整品牌区域必要 CSS，不改变导航结构。
   - Verification: 浅色/深色主题下品牌图标对比度良好，默认窗口宽度不挤压导航。

6. `done` 测试与文档收尾
   - 增加或更新必要测试，至少覆盖 App Shell 品牌标识仍可渲染、主题 token 不被破坏。
   - 更新 `DESIGN.md` 中 App Shell 顶部边界和品牌图标规则，如实现形成可复用设计规则。
   - 更新 `CHANGELOG.md`，因为图标和窗口顶部视觉是用户可见变化。
   - Verification: `pnpm verify`；必要时 `pnpm tauri:verify-build`；Dev Flow 文档检查。

## Risks

- 直接使用生成概念图裁剪可能导致小尺寸模糊或边缘不干净。
- `.ico` 更新后 Windows 可能因为系统缓存短期显示旧图标，需要验证构建产物而不是只看运行中窗口。
- 过强的顶部阴影会让工作台变得装饰化，违背安静、紧凑的 UI 方向。
- 深色主题下同一边界效果可能过亮，需要单独调色。
- 如果 Tauri CLI 生成多平台图标，可能引入多文件 diff，需要确保都是必要派生产物。

## Acceptance Criteria

- 原生标题栏下方不再出现生硬黑白断层，浅色和深色主题都保持克制、清晰。
- 应用仍使用原生窗口控制按钮，窗口行为不变。
- 新软件图标体现工具箱 / Skills 包方向，并在小尺寸下可识别。
- `src-tauri` bundle 使用新图标资源。
- 侧边栏品牌标识与新软件图标一致或明显同源。
- 没有引入与任务无关的布局、导航、设置或业务逻辑改动。
- `pnpm verify` 通过；Tauri build check 通过或明确说明无法运行原因。

## Artifact Routing

- Plan: `docs/plans/2026-06-24-app-chrome-icon-polish.md`
- Design system: updated `DESIGN.md` with App Shell top-boundary and brand-icon rules.
- Changelog: update `CHANGELOG.md` under `[Unreleased] / Changed`.
- Tests: likely update `src/App.test.tsx` for brand icon rendering and theme safety.
- Assets: expected under `src/assets/brand/` and `src-tauri/icons/`.
- ADR: not expected; this is visual identity and asset routing, not a hard-to-reverse architecture decision.
- Context map: not expected unless a new durable brand asset entry point deserves routing.

## Closeout

- Implement with `/dev-branch` so asset changes, CSS changes, tests, changelog, design-system update, distill, check, review, commit and merge happen in one reviewed branch.
- During implementation, run Dev Flow validation if `DESIGN.md`, plan lifecycle, or other docs change:

```powershell
node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.9.0\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench
```
