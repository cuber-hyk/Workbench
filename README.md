# Workbench App

Workbench App 是一个本地优先的 AI 开发工作台，用于统一管理本地开发项目、Skills 和 AI Radar 信息。

项目目标是逐步构建一个独立桌面软件，作为个人 AI 开发操作台。现有项目仅作为功能与业务设计参考，不合并代码，也不组成 monorepo。

## 当前状态

项目当前处于 MVP UI 骨架阶段。

已完成：

- Tauri + React + TypeScript + Vite 正式工程骨架。
- 项目、Skills、AI Radar、设置四个模块页面。
- 固定左侧导航与列表详情工作区。
- 浅色和深色主题。
- 添加项目、导入 Skills、添加 Radar 条目的 UI 弹窗。
- 前端领域类型与 mock API adapter。
- Tauri 桌面应用构建与启动验证。

尚未完成：

- SQLite 数据持久化。
- 项目目录打开与启动命令执行。
- Skills 根目录扫描、ZIP / 文件夹导入和符号链接管理。
- AI Radar 真实增删改查。
- 设置项真实读写。

当前页面使用 mock data 展示和验证 UI，不代表本地后端能力已经实现。

## MVP 模块

### 项目

- 管理本地项目基本信息。
- 记录项目路径、标签、备注和启动命令。
- 后续通过按钮在新的系统终端窗口执行启动命令。

### Skills

- 使用统一 Skills 根目录保存唯一真实副本。
- 支持分类、搜索和详情查看。
- 后续支持 ZIP / 已解压文件夹导入。
- 后续通过符号链接为全局工具或指定项目启用 Skill。

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
- SQLite（后续接入）

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
├─ docs/
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
- `docs/PRD.md`：产品范围与验收标准。
- `docs/ARCHITECTURE.md`：技术架构、模块边界和数据模型。
- `DESIGN.md`：已确认的 UI 设计规则。
- `design-tokens.json`：设计 token 精确值。

## 设计与开发原则

- 本地优先。
- 独立软件。
- 简单优先。
- 单一实现优先。
- 外科手术式修改。
- 不覆盖或删除用户已有的 Skills 内容。
- 符号链接失败时明确提示，不回退复制。

## 文档

- [产品需求文档](docs/PRD.md)
- [架构说明](docs/ARCHITECTURE.md)
- [设计系统](DESIGN.md)
- [当前开发计划](docs/plans/2026-06-13-mvp-ui-first-development.md)
- [变更记录](CHANGELOG.md)
