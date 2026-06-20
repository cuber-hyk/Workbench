---
artifact_type: adr
status: archived
created: 2026-06-19
updated: 2026-06-20
source_of_truth: docs/adr/
---

# ADR: Workbench 自管 skills.sh Skill 安装与更新

## 状态

archived

归档原因：2026-06-20 的 `docs/adr/2026-06-20-skills-sh-cli-adapter.md` 已替代本决策。Workbench 不再自行下载和解压 GitHub 仓库作为市场安装核心路径，而是通过隔离临时目录调用官方 `skills.sh` CLI 提取 Skill 内容。

## 背景

Workbench 需要接入在线 Skills 来源，让用户浏览、安装和更新 Skills。`skills.sh` 是最成熟的 Skills 社区目录，提供包列表、搜索、详情和 GitHub 仓库关联信息。

核心选择：由 Workbench 自行下载 GitHub 仓库并管理 Skill 内容，还是依赖 `npx skills` CLI 工具。

## 决策

Workbench 自管 `skills.sh` 来源的安装和更新流程：

1. 通过解析 `skills.sh` 页面数据获取远程 Skill 列表和详情
2. 安装时从对应 GitHub 仓库下载内容，定位 `SKILL.md` 所在目录，复制到 Workbench 统一 Skills 根目录
3. 通过 `skill_sources` SQLite 表记录来源元数据（package slug、仓库 URL、安装路径、内容 hash 等）
4. 更新检查通过重新下载远端内容并计算内容 hash 对比本地 hash
5. 更新执行前备份统一根目录中的旧版本到 `~/.workbench/backups/skills/market/<timestamp>/<skill>`
6. 安装和更新后的 Skill 默认不自动启用到任何 Agent 工具目录
7. 更新只替换统一 Skills 根目录内容，不自动重同步已启用的 Copy 副本
8. 安装入口使用异步 Tauri command 和 blocking worker 执行下载、解压和复制，并通过 `skill-install-progress` 事件回传阶段进度
9. 远端下载设置连接/读取超时、压缩包大小限制、解压规模限制和仓库文件数量限制
10. 卸载已安装市场 Skill 时复用统一 Skill 删除流程，并清理对应 `skill_sources` 来源记录

## 替代方案

| 方案 | 说明 | 未选原因 |
|------|------|----------|
| 使用 `npx skills add/update` | 调用 skills CLI 完成安装和更新 | 引入外部依赖，Workbench 无法控制安装路径和元数据记录；CLI 输出不稳定不利于程序化集成；用户需额外安装 Node.js |
| 只做浏览器跳转 | 打开 skills.sh 页面让用户手动操作 | 无法在 Workbench 内跟踪安装状态，无法本地化管理 |
| 通用远程来源框架 | 抽象一套来源协议，skills.sh 作为首个适配 | 当前只确定 skills.sh 一个来源，过早抽象增加复杂度 |

## 后果

### 正面

- 无外部 CLI 依赖，Workbench 完全控制安装路径和元数据
- 安装和更新流程与现有 Skills 导入/删除/启用能力自然衔接
- 卸载不引入第二套删除路径，沿用统一根目录和受管目标清理边界
- 内容 hash 检测简单可靠，无需解析 Git 版本标识
- 备份机制保证更新失败时可回滚

### 负面

- 增加维护量：需要跟随 `skills.sh` 页面数据结构变化
- 内容 hash 不提供签名验证，不能防御恶意篡改（但当前 Skills 来源均为社区内容，安全风险可控）
- 非 GitHub 来源的 `skills.sh` 条目暂不支持自管安装
- 更新后已启用 Copy 副本不会自动同步，需用户手动重新解决冲突

### 约束

- `skill_sources` 只记录 Workbench 从市场安装的 Skill，不参与本地 ZIP / 文件夹导入
- 删除或市场卸载对应 Skill 时必须清理 `skill_sources`，避免市场和更新页保留幽灵状态
- 内容 hash 只用于本地更新检测，不作为安全校验或可信签名
- 当前只对接 `skills.sh`，不是通用远程来源框架
- 安装百分比是阶段进度，不是字节级下载进度
