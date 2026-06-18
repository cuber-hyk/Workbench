# Workbench App Agent Guide

## 项目定位

Workbench App 是一个本地优先的 AI 开发工作台。项目已完成第一阶段基础能力验证，当前进入进阶开发阶段，围绕项目、Skills、资源 Radar、Agent 工具与本地自动化继续扩展。

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

## 发布签名

发布带 Tauri updater 的 GitHub Release 时，必须使用与 `src-tauri/tauri.conf.json` 中 `plugins.updater.pubkey` 匹配的本机签名密钥。

- 私钥文件：`C:\Users\胡运宽\.workbench\workbench-updater.key`
- 私钥密码文件：`C:\Users\胡运宽\.workbench\workbench-updater-password.txt`

不要输出私钥或密码内容。构建发布包时只在当前构建进程内读取文件并设置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 环境变量。

Dev Flow 文档检查：

```bash
node C:\Users\胡运宽\.codex\plugins\cache\cuberhyk-plugins\cuberhyk-dev-flow\0.7.2\bin\dev-flow.js validate-docs E:\Development\12-工具-Utility\Workbench
```
