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

## 模块书写规范

- 不以行数作为拆分目标；大文件只作为维护成本评估信号。
- 对外入口优先保持稳定 facade，具体实现放入同名目录下的职责模块。
- 为已有大文件增加非平凡行为前，先判断该行为是否有清晰的 owner 模块。
- 不为了降低行数创建 `utils`、`helpers`、`common`、`misc`、`part-*` 等语义空泛模块。
- 只有当新模块具备稳定职责名称、清晰输入输出和可执行验证方式时，才进行抽取。
- 保持 Tauri command 名称、路由、数据库 schema、前端 API 和公共导入稳定，除非任务明确要求改变。
- Tauri 后端 command 文件可以保留为 facade；当实现跨越多项职责时，优先拆到同名目录，例如 `src-tauri/src/radar.rs` 与 `src-tauri/src/radar/`。
- 前端视图代码优先放在 `src/views/<domain>/`，弹窗放在 `src/components/dialogs/<domain>/`，纯领域 helper 靠近 owner 视图；只有跨领域复用时才上移。
- `src/App.tsx` 是应用壳和 app-level 状态编排入口；不要仅因行数继续拆分。
- `src/App.test.tsx` 可保留 shell/integration 覆盖；只有未来测试变更出现清晰行为边界时再拆分。
- 如果文件因状态机、协议映射、schema、数据表或应用壳职责而保持较大，应说明原因，而不是按大小机械拆分。
- 多阶段拆分应按职责边界使用任务分支隔离 diff，并在每个分支完成验证后再继续。

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
