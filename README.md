# Workbench App

Workbench App 是一个本地优先的 AI 开发工作台，用于统一管理本地开发项目、Skills 和 AI Radar 信息。

项目目标是逐步构建一个独立桌面软件，作为个人 AI 开发操作台。现有项目仅作为功能与业务设计参考，不合并代码，也不组成 monorepo。

## 当前状态

项目当前处于 MVP 收口阶段，项目管理、Skills 管理和 AI Radar 已接入真实本地后端。

已完成：

- Tauri + React + TypeScript + Vite 正式工程骨架。
- 项目、Skills、AI Radar、设置四个模块页面。
- 固定左侧导航与列表详情工作区。
- 浅色和深色主题。
- 添加项目、导入 Skills、添加 Radar 条目的 UI 弹窗。
- 前端领域类型与 mock API adapter。
- Tauri 桌面应用构建与启动验证。
- Skills 统一根目录扫描、分类、ZIP / 文件夹导入。
- Skills 全局与项目级 Auto 启用，优先 Symlink，失败时使用 Copy。
- Skills 全局工具目录状态扫描、自动同步和 Skill 级冲突解决。
- Skills 删除及 Workbench 受管启用清理。
- Skills 设置与启用关系的 SQLite 持久化。
- 项目启动项可通过 Tauri 后端在新的系统终端窗口中执行。
- 项目列表、标签、备注和启动配置的 SQLite 持久化。
- AI Radar 增删改查、搜索筛选、收藏和打开链接。
- AI Radar 的 SQLite 数据持久化。

项目、Skills 和 AI Radar 页面在 Tauri 桌面应用中使用真实本地数据。Web UI 预览继续使用 mock data。

## MVP 模块

### 项目

- 管理本地项目基本信息。
- 记录项目路径、标签、备注和启动配置。
- 通过按钮在新的系统终端窗口执行所有启用启动项。

### Skills

- 使用统一 Skills 根目录保存唯一真实副本。
- 支持分类、搜索和详情查看。
- 支持通过系统选择器从 ZIP / 已解压文件夹导入多个 Skills。
- 通过 Auto 同步为全局工具或指定项目启用 Skill。
- 支持扫描全局工具目录中已有的同名 Skill；内容一致时自动登记为 Workbench 管理，内容冲突时通过选择唯一版本源解决。
- 支持删除 Skill，并清理 Workbench 管理的启用记录和受管目标。
- 默认统一根目录为 `~/.workbench/skills`。

### AI Radar

- 本地维护项目、资讯、论文和其他 AI 信息条目。
- 支持搜索、筛选、收藏和详情查看。
- MVP 不自动抓取或接入外部数据源。

### 设置

- 展示本地数据目录。
- 管理 Skills 根目录和工具目录。
- 展示 Skills 路径映射。
- 切换浅色和深色主题。

## 技术栈

- Tauri 2
- Rust
- React 18
- TypeScript
- Vite
- SQLite

## 本地开发

环境要求：

- Node.js
- pnpm
- Rust 与 Cargo
- Windows WebView2

安装依赖：

```bash
pnpm install
```

启动 Web UI：

```bash
pnpm dev
```

启动 Tauri 桌面应用：

```bash
pnpm tauri:dev
```

构建前端：

```bash
pnpm build
```

检查 Rust：

```bash
cd src-tauri
cargo check
```

构建调试版桌面应用：

```bash
pnpm tauri build --debug --no-bundle
```

## 项目结构

```text
Workbench/
├─ AGENTS.md
├─ CONTEXT.md
├─ docs/
│  ├─ ai/
│  ├─ adr/
│  ├─ audits/
│  ├─ capabilities/
│  ├─ plans/
│  ├─ ARCHITECTURE.md
│  └─ PRD.md
├─ src/
│  ├─ components/
│  ├─ lib/
│  │  ├─ api/
│  │  └─ types/
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ styles.css
├─ src-tauri/
│  ├─ src/
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ UI/
├─ DESIGN.md
├─ design-tokens.json
└─ package.json
```

- `src/`：正式 React 前端。
- `src-tauri/`：Tauri 和 Rust 本地能力。
- `UI/`：讨论用静态原型，不是正式构建入口。
- `AGENTS.md`：项目级 Agent 工作规则。
- `CONTEXT.md`：当前阶段、模块状态和关键边界。
- `docs/PRD.md`：产品范围与验收标准。
- `docs/ARCHITECTURE.md`：技术架构、模块边界和数据模型。
- `docs/ai/context-map.md`：长期上下文索引。
- `DESIGN.md`：已确认的 UI 设计规则。
- `design-tokens.json`：设计 token 精确值。

## 设计与开发原则

- 本地优先。
- 独立软件。
- 简单优先。
- 单一实现优先。
- 外科手术式修改。
- 不覆盖或删除用户已有的 Skills 内容。
- Skills 默认使用 Auto 同步，优先 Symlink，权限不足时自动使用 Copy。
- 目标位置已有内容时不覆盖；停用时只移除 Workbench 记录的链接或副本。
- 工具目录同名 Skill 内容冲突只在用户明确选择唯一版本源后解决，替换前会备份。
- 删除 Skill 不删除未被 Workbench 管理的工具目录内容。

## 文档

- [产品需求文档](docs/PRD.md)
- [架构说明](docs/ARCHITECTURE.md)
- [设计系统](DESIGN.md)
- [当前开发计划](docs/plans/2026-06-13-mvp-ui-first-development.md)
- [变更记录](CHANGELOG.md)
