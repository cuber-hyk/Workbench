---
artifact_type: reference
status: current
created: 2026-06-18
updated: 2026-06-18
source_project: E:\Development\12-工具-Utility\Agent\skills-manager
source_of_truth: reference project README and source inspection
---

# Skills Manager 功能借鉴

本文记录 `skills-manager` 对 Workbench 进阶开发有参考价值的功能方向。它不是 PRD 变更，也不是承诺范围；进入开发前必须再写计划并确认优先级、数据模型、风险和验证方式。

## 借鉴原则

Workbench 已完成第一阶段基础能力验证，后续不再受“最小版本”范围限制。功能借鉴应面向进阶开发：既可以吸收 `skills-manager` 的成熟能力，也要转换为 Workbench 自己的工作台模型。

判断一个功能是否值得进入 Workbench，应看它是否满足：

- 能减少本地项目、Agent 工具、Skills、资源和自动化之间的切换成本。
- 能强化统一 Skills 根目录作为唯一真实来源。
- 能帮助用户理解当前本机真实状态。
- 能让导入、同步、更新、冲突和删除过程可预览、可确认、可恢复。
- 能自然服务项目工作台，而不是只复制单一 Skills 管理器的页面结构。

## 1. 统一 Skills Library

`skills-manager` 的核心体验是统一 skill library：不同来源进入中央库，再同步到不同 Agent。

Workbench 已经有统一 Skills 根目录。后续可以增强为更完整的 Skills Library：

- 在 Skills 列表中区分“统一根目录版本”“全局工具目录状态”“项目工具目录状态”。
- 为每个 Skill 展示最近同步方式：Symlink、Junction 或 Copy。
- 对 Copy 副本提供显式“重新同步”操作。
- 在 Skill 详情中展示所有全局和项目级启用位置。
- 支持从本地文件夹、ZIP、Git URL、压缩包 URL、skills.sh 或其它市场导入。
- 支持导入时选择是否立即同步到某些全局工具或项目。
- 支持来源元数据：来源类型、来源 URL、分支、提交、子路径、导入时间和最近检查时间。

## 2. Global Workspace 的真实状态视角

`skills-manager` 的 Global Workspace 会按 Agent 展示该 Agent 全局 skills 目录中的真实内容，包括非本应用安装的 Skill。

Workbench 可以借鉴“真实状态视角”：

- 在 Skills 模块增加按工具查看状态的视图。
- 对每个工具展示：已受管、外部一致、外部冲突、未启用、失效副本。
- 提供“打开工具目录”和“查看该工具下的 Skill”入口。
- 对内容一致的外部 Skill 保持自动登记逻辑。
- 对内容冲突提供差异预览、备份说明和唯一版本选择。
- 对工具目录异常、路径不存在、权限不足等状态给出可执行诊断。

价值：用户能知道 Codex、Claude Code、OpenCode 和后续自定义工具实际看到什么，而不是只看到 Workbench 数据库记录。

## 3. Project Workspace 与项目工作台

`skills-manager` 的 Project Workspaces 强调项目本地 skills 集合和中央库的差异。

Workbench 更适合把它融入项目详情：

- 在项目详情页增加“项目 Skills”区域。
- 展示该项目下每个受支持工具的启用状态。
- 展示项目内 Skill 与统一根目录的关系：已同步、项目独有、中心较新、项目较新、冲突。
- 支持从项目详情中快速启用或停用某个 Skill。
- 支持从项目详情打开项目内 `.codex/skills`、`.claude/skills`、`.opencode/skills`。
- 支持项目级 Skills 批量添加、批量停用和重新同步。
- 支持把项目当前 Skills 组合保存为技能组或项目模板。

不建议把 Project Workspace 做成与项目模块并列的新导航。Workbench 的项目是一级对象，项目级 Skills 应服务项目详情。

## 4. Add From Library 选择器

`skills-manager` 的 Add from Library sheet 能在目标工作区中从中央库批量选择 Skills，并同时选择目标 Agent。

Workbench 应优先借鉴这个交互：

- 在项目详情中增加“添加 Skills”弹层。
- 弹层支持搜索、分类筛选、来源筛选和状态筛选。
- 行内选择目标工具。
- 支持批量添加到当前项目。
- 支持选择后预览将创建的目标路径和同步方式。
- 对不可用工具显示不可选原因。

这比在每个 Skill 详情里反复选择项目更适合“给一个项目配置一组技能”的场景。

## 5. 批量操作

`skills-manager` 支持多选后批量 enable、disable、export、delete。

Workbench 可以按风险分层推进：

- 低风险：批量设置分类、批量启用到全局工具、批量从全局工具停用。
- 中风险：项目内批量启用、项目内批量停用、批量重新同步 Copy 副本。
- 高风险：批量删除 Skill、批量冲突解决、批量覆盖目标目录。

凡是会删除、覆盖或替换内容的批量操作，都必须有预览、确认和必要备份。

## 6. 标签、分类与技能组

`skills-manager` 使用 tags 和 presets。Workbench 当前是单分类模型，但进阶阶段可以考虑多维组织。

建议演进路径：

1. 保留单分类作为主归属。
2. 增加 tags 作为横向筛选，不改变分类语义。
3. 增加技能组，用于保存一组常用 Skills。
4. 技能组可以应用到全局工具或项目，但应用是一次性操作，不默认保持实时同步。
5. 项目模板可以引用技能组、启动项和推荐打开方式。

这样可以避免直接照搬 Presets 导致入口混乱，同时吸收它的一键组合价值。

## 7. Skill 预览、源码检查与差异对比

`skills-manager` 支持在应用内阅读 `SKILL.md`、`README.md`，并查看来源元数据和 diff。

Workbench 可以推进为：

- 在 Skill 详情中渲染 `SKILL.md` 内容。
- 支持查看 Skill 目录文件树。
- 支持打开 Skill 目录和 `SKILL.md` 文件。
- 冲突版本提供内容对比。
- Git 或 Marketplace 来源提供 upstream diff。
- 更新前展示变更摘要、文件列表和风险提示。

这类能力能降低用户切到编辑器查看 Skill 内容的频率，也能支撑远端更新和冲突解决。

## 8. 自定义工具与工具生态

`skills-manager` 支持添加 custom tools 或覆盖内置工具路径。

Workbench 可以分阶段引入：

- 覆盖 Codex、Claude Code、OpenCode 的全局目录和项目级目录。
- 添加自定义工具，字段包括名称、全局 Skills 目录、项目级相对目录、是否递归扫描。
- 工具状态诊断：路径存在性、权限、符号链接能力、项目级支持。
- 工具显示排序、图标和分组。
- 从参考项目借鉴更多 Agent 的路径规则，但每个新增工具都应有验证。

## 9. Marketplace、Git 来源与更新追踪

`skills-manager` 支持 Git repos、local folders、`.zip` / `.skill` archives 和 skills.sh marketplace。

Workbench 进阶阶段可以将它拆成几条独立能力：

- Git URL 导入：输入仓库 URL，选择子目录，导入到统一 Skills 根目录。
- GitHub repo 快捷导入：支持 `owner/repo` 和子路径。
- Marketplace 浏览：展示远端列表、搜索、安装量和来源。
- AI search：作为可选增强，不作为基础搜索依赖。
- 更新检查：记录 source revision，手动检查 upstream revision。
- 更新应用：先预览 diff，再由用户确认。
- 重新导入本地来源：用于更新从本地文件夹导入的 Skill。

这些能力会明显扩大安全和网络边界，需要配套来源元数据、网络错误处理、代理设置、取消安装和日志记录。

## 10. 操作日志与日志导出

`skills-manager` 有 activity log 和 Export Logs，用于记录安装、移除、更新、同步等操作。

Workbench 可以为本地副作用建立统一日志：

- Skills 导入、删除、启用、停用、冲突解决、更新。
- 项目启动、停止、启动项失败。
- Radar 同步 GitHub Stars、导入资源、重复组合并。
- 设置变更，例如 Skills 根目录、工具路径、代理或更新源。
- 导出诊断包：近期日志、配置摘要、版本信息和脱敏路径。

优先价值不是审计，而是出问题时用户和开发者能复盘“刚刚发生了什么”。

## 11. Git 备份、版本历史与恢复

`skills-manager` 支持 Git backup 和 version history。

Workbench 可作为进阶方向引入：

- 仅备份统一 Skills 根目录。
- 备份 Workbench 配置摘要，不备份敏感凭据。
- 支持手动创建快照。
- 支持查看快照历史。
- 支持从快照恢复单个 Skill 或整个 Skills 根目录。
- 后续再考虑 Radar 和项目配置备份。

这类能力涉及数据恢复和误操作风险，必须有清晰预览、备份和撤销边界。

## 12. 托盘与快速操作

`skills-manager` 有托盘菜单，可快速打开、检查更新和应用 preset。

Workbench 可以借鉴为：

- 托盘快速打开 Workbench。
- 快速查看正在运行的项目启动会话。
- 快速停止全部启动会话。
- 快速打开当前项目目录或最近项目。
- 快速触发 Skills 更新检查或 Radar 同步。

托盘不应承载复杂决策；会替换、删除或覆盖内容的操作仍应回到主界面确认。

## 建议优先级

近期优先：

1. 项目详情的“添加 Skills”弹层。
2. 工具真实状态视图。
3. Skill 详情内预览 `SKILL.md`。
4. Copy 副本显式重新同步。
5. 操作日志最小版本。
6. 工具路径覆盖。

中期推进：

1. 自定义工具。
2. 技能组和项目模板。
3. Git URL 导入。
4. 冲突差异对比。
5. 资源 Radar 导入来源和 inbox。
6. Agent 配置诊断。

远期候选：

1. Marketplace 和 AI search。
2. Git 来源更新追踪和 diff 更新。
3. Git 备份、版本历史和恢复。
4. 托盘快速操作。
5. 多设备同步。
6. 插件系统。
