# Workbench App Agent Guide

## 项目定位

Workbench App 是一个本地优先的 AI 开发工作台。当前 MVP 聚焦项目管理、Skills 管理、资源 Radar 和设置，不引入独立 HTTP 后端、插件系统、在线市场或云同步。

## 工作原则

- 默认使用中文沟通和编写项目文档。
- 保持简单优先和外科手术式修改。
- 不把参考项目代码合并进本仓库。
- 不为旧方案保留双轨兼容逻辑。
- 本项目默认使用 `cuberhyk-dev-flow` 插件辅助开发。
- 不直接 `git push`。

## 文档路由

- 产品范围和验收标准：`docs/PRD.md`
- 架构、模块边界和数据模型：`docs/ARCHITECTURE.md`
- UI 设计规则：`DESIGN.md`
- 设计 token：`design-tokens.json`
- 项目上下文：`CONTEXT.md`
- 文档索引：`docs/ai/context-map.md`
- 当前计划：`docs/plans/`
- 审核记录：`docs/audits/`
- 架构决策：`docs/adr/`

## 验证命令

常用验证：

```bash
pnpm verify
pnpm test
pnpm tauri:verify-build
```

Dev Flow 文档检查：

```bash
node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.7.2\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench
```
