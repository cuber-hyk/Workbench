---
artifact_type: adr
status: accepted
created: 2026-06-20
updated: 2026-06-20
source_of_truth: src-tauri/src/skills.rs
---

# ADR: skills.sh CLI 混合安装适配

## 状态

accepted

## 背景

Workbench 需要从 `skills.sh` 市场安装和更新第三方 Skill。此前由 Workbench 自行下载 GitHub 仓库 zip、解压并遍历 `SKILL.md`，但这种方式会进入仓库内非 Skill 内容，Windows 下可能遇到不适合本地文件系统的路径或链接处理问题。

官方 `skills` CLI 已经承担了 Skill 选择、包结构识别和复制策略。Workbench 仍需要控制最终安装目录、来源记录、备份、删除和启用边界。

## 决策

市场安装、更新检查和更新执行统一走混合适配路径：

1. Workbench 只对 GitHub `owner/repo` 来源启用市场安装，非 GitHub 来源保持“不支持”状态。
2. 安装前校验本机 `node`、`npm` 和 `npx` 可用；缺失时返回明确中文错误。
3. Workbench 创建临时 HOME / USERPROFILE / APPDATA，调用 `npx -y skills add <source> --skill <skillId> -g --agent codex -y --copy`。
4. Workbench 只读取临时 `.agents/skills/<skillId>` 目录，并要求存在 `SKILL.md`。
5. Workbench 计算提取目录内容 hash，复制到统一 Skills 根目录，并维护 `skill_sources`。
6. 更新检查重新通过 CLI 提取远端 Skill 并比较内容 hash；更新执行前继续备份统一根目录中的旧版本。
7. 不保留旧 GitHub zip 下载、解压和仓库遍历路径作为 fallback。

## 替代方案

| 方案 | 说明 | 未选原因 |
|------|------|----------|
| 继续自研 GitHub 下载/解压 | Workbench 直接下载仓库 zip 并定位 Skill | 会处理仓库中与 Skill 无关的文件；Windows 路径和链接兼容风险更高；重复实现官方 CLI 的选择逻辑 |
| 完全交给 `skills` CLI 安装到用户目录 | 直接使用 CLI 默认目标目录 | Workbench 无法保证统一 Skills 根目录、来源记录、备份和删除边界 |
| 为所有来源创建通用远程包框架 | 抽象多来源协议 | 当前只确认 `skills.sh` 一个在线来源，过早抽象会增加复杂度 |

## 后果

### 正面

- 减少 Workbench 对仓库内部结构的假设，避免遍历无关目录。
- 安装、检查更新和更新执行使用同一提取路径，没有旧/新双轨。
- Workbench 继续掌控最终安装路径、数据库来源记录、备份和启用策略。
- 错误边界更清楚：Node/npm 缺失、网络/CLI 失败、目标目录冲突分别提示。

### 负面

- 用户环境必须有 Node.js、npm 和 npx。
- 更新检查会逐项调用 CLI，比直接下载 zip 更慢。
- `skills` CLI 行为变化可能影响提取结果；Workbench 不能把 CLI 输出当稳定 API。

### 约束

- 只依赖 CLI 生成的临时目录结构和 `SKILL.md`，不解析 CLI 文本输出作为事实源。
- 临时 HOME / USERPROFILE / APPDATA 必须隔离，避免 CLI 写入用户默认目录。
- `skill_sources` 只记录 Workbench 从市场安装的 Skill，不参与本地 ZIP / 文件夹导入。
- 内容 hash 只用于本地更新检测，不作为安全签名。
- 安装百分比仍是阶段进度，不是字节级下载进度。
