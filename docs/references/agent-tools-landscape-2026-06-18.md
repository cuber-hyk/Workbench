# Agent 工具生态调研报告

调研日期：2026-06-18  
目标：为 Workbench 后续扩展 Agent 工具覆盖范围提供候选清单、分层优先级和适配建议。

## 结论

当前 Workbench 若只覆盖 Claude、Codex、opencode，会漏掉三类重要工具：

1. 终端型 coding agent：Gemini CLI、Aider、Goose、Cline CLI、Kilo Code、Roo Code、Pi、Hermes、Crush、Qwen Code、Kimi Code、BLACKBOX CLI。
2. IDE / 桌面型 agent：Cursor、Devin Desktop / Windsurf Cascade、Kiro、Trae、Qoder、Junie、Zed ACP、Sweep、DevEco Code / CodeGenie。
3. 云端异步与协作型 agent：GitHub Copilot coding agent、Jules、Devin、Factory Droid、OpenHands Cloud、CodeRabbit、Qodo / PR-Agent、Replit Agent、Bolt、Lovable、v0。

推荐实现顺序：

- P0：先做“通用 CLI Agent 适配层”，覆盖可通过命令启动、读取仓库、写文件、运行测试的工具。
- P1：补齐主流云端/IDE 工具的“外部打开、任务说明、状态记录、文档链接”级覆盖。
- P2：对 PR review、app builder、平台专有工具做轻量登记，不强行纳入本地执行流。

## 范围与假设

本报告把“Agent 工具”定义为：能围绕代码库或本地/远程工作区执行多步任务的 AI 工具，包括读写文件、运行命令、创建 diff/PR、调试、审查、部署或管理任务。

包含：

- CLI/TUI agent
- IDE 插件或 AI IDE
- 云端异步 coding agent
- PR/code review agent
- 浏览器内 app builder，当它能生成并修改完整代码项目时作为邻近类别列入

不重点包含：

- 纯聊天模型或单纯 autocomplete
- LangChain、AutoGen、CrewAI 等“构建 agent 的框架”，除非它同时提供面向开发者的可用 coding agent
- 只做模型推理或普通代码补全的工具

本次尝试使用本地 `tavily` 技能脚本，但环境未配置 `TAVILY_API_KEY`，因此改用公开 Web 检索完成。该限制不影响报告中的公开来源链接，但部分小众项目热度和状态仍需在接入前二次核验。

## 工具分层

### P0：建议优先覆盖的本地/终端 Agent

这些工具最适合 Workbench：有明确 CLI、能在本地仓库执行任务，通常可以通过统一的命令适配器纳入。

| 工具 | 形态 | 开源 / BYOM | 推荐覆盖方式 | 备注 |
| --- | --- | --- | --- | --- |
| Claude Code | CLI、IDE、GitHub | 非开源，Anthropic 模型为主 | 已覆盖，继续保留专用适配 | 官方描述为“agentic coding tool that lives in your terminal” [S01][S02] |
| OpenAI Codex CLI | CLI、IDE、Codex Web、GitHub review | Apache-2.0 CLI；模型绑定 OpenAI | 已覆盖，继续保留专用适配 | 官方 GitHub 称其为本地运行的 coding agent [S03] |
| Gemini CLI | CLI、GitHub Actions、Zed ACP | 开源，Google Gemini 为主 | 新增专用/通用 CLI 适配 | 官方称其为开源终端 AI agent，支持 ReAct loop、MCP、本地/远程工具 [S04][S05] |
| opencode | CLI、Desktop beta | 开源，支持多模型 | 已覆盖；建议纳入通用 CLI 模板 | 官网强调可连接 Claude、GPT、Gemini 等模型 [S06] |
| Aider | CLI | 开源，多模型 | 新增通用 CLI 适配 | 终端 pair programming，直接编辑本地 git repo [S07][S08] |
| Goose | CLI、Desktop、API | 开源，多模型，MCP | 新增通用 CLI 适配 | Block 开源的通用本地 agent，可做代码、自动化、研究等 [S09][S10] |
| OpenHands | 本地/云端软件开发 agent 平台 | 开源，模型无关 | 新增平台级适配 | 可执行真实工程任务，支持 SDK、Agent Server、临时 workspace [S11][S12] |
| Cline | VS Code、CLI、SDK | 开源，BYOK | 新增 CLI/IDE 双形态登记 | open coding agent，支持 Plan/Act、MCP、终端工作流 [S13] |
| Roo Code | VS Code 系 agent | 开源，BYOK | 新增 IDE 工具登记 | 多模式：Code、Architect、Ask、Debug、自定义模式 [S14] |
| Kilo Code | VS Code、JetBrains、CLI、Cloud | 开源，BYOK、本地模型 | 新增 CLI/IDE 适配 | 官方定位为 all-in-one agentic engineering platform [S15][S16] |
| Pi | CLI agent harness | 开源，多 provider | 新增通用 CLI 适配 | minimal agent harness，含 pi-coding-agent、runtime、multi-provider API [S17][S18] |
| Hermes Agent | CLI、长驻服务、消息平台 | 开源，自托管，多 provider | 新增“长驻 Agent”类别 | Nous Research 项目，强调技能、记忆、自我改进、Telegram 等入口 [S19][S20][S21] |
| Crush | 终端 coding agent | 开源/源码可见，LLM 可插拔 | 新增通用 CLI 适配 | Charmbracelet 出品，强调在终端连接工具、代码和 workflow [S22] |
| Qwen Code | CLI、IDE 友好 | 开源，优化 Qwen，也可作为 agentic CLI | 新增通用 CLI 适配 | 官方称 terminal-first、agentic workflow、Skills/SubAgents [S23][S24] |
| Kimi Code CLI | CLI、SDK | 开源，多 provider 兼容 | 新增通用 CLI 适配 | 可读写代码、执行 shell、搜索/抓取网页、规划行动 [S25][S26] |
| BLACKBOX CLI | CLI、CI | 开源，多 agent 并行 | 新增通用 CLI 适配 | 终端 AI coding agent，支持并行 agent [S27] |
| Amazon Q Developer / Kiro CLI | IDE、CLI、AWS/GitHub/GitLab | 商业，AWS 生态 | 新增外部工具登记；谨慎接本地执行 | AWS 官方说明其 agentic coding 能读写文件、生成 diff、运行 shell [S28][S29] |
| Trae Agent | CLI；另有 Trae IDE | 开源 CLI，ByteDance | 新增通用 CLI 适配 | GitHub 描述为 general purpose software engineering tasks 的 CLI agent [S30] |
| Junie CLI | CLI、JetBrains、CI/CD | LLM-agnostic，JetBrains | 新增 CLI/IDE 登记 | JetBrains 称其为 terminal、IDE、CI/CD 可用的 coding agent [S31][S32] |
| Factory Droid | CLI、Web、Slack/Teams、Linear/Jira、Mobile | 商业，多模型 | 新增外部 CLI/云端登记 | 官方 GitHub 显示 `droid` CLI，可在项目目录启动 [S33][S34] |
| Amp | CLI / agent 产品 | 商业，模型前沿适配 | 新增外部 CLI 登记 | 官方定位为 frontier coding agent [S35] |

### P1：主流 IDE / 桌面 / 云端异步 Agent

这些工具很重要，但很多不是 Workbench 能直接“托管执行”的对象。建议先支持元数据、启动方式、文档链接、任务说明模板和状态记录。

| 工具 | 形态 | 推荐覆盖方式 | 备注 |
| --- | --- | --- | --- |
| GitHub Copilot coding agent | GitHub issue/PR、VS Code、CLI/Cloud agent | GitHub 集成登记；不要本地直接执行 | 可分配 issue，后台工作并打开 PR [S36][S37] |
| Jules | Google 异步 coding agent、GitHub、CLI companion | 云端任务登记 | 导入 repo、分支修改、运行测试、创建 PR [S38][S39][S40] |
| Devin | 云端软件工程 agent；Devin Desktop | 云端任务登记；Desktop 作为 IDE 工具 | 官方称其为 AI coding agent/software engineer，支持复杂多 repo 团队 [S41][S42] |
| Cursor | AI IDE、background agents | IDE 工具登记 | 官方强调 agent 可把想法转成代码；Cursor 3 强化 agent-first 体验 [S43][S44] |
| Devin Desktop / Windsurf Cascade | AI IDE、Cascade agent | IDE 工具登记 | Windsurf 已更名/并入 Devin Desktop；Cascade 是 agentic AI assistant [S45][S46] |
| Kiro | AWS agentic IDE、CLI | IDE/CLI 双登记 | 规格驱动：prompt -> specs -> code/docs/tests [S47][S48] |
| Trae IDE | AI IDE | IDE 工具登记；CLI 用 Trae Agent 适配 | 官方称可规划 workflow、调用工具并部署 production-ready code [S49] |
| Qoder | AI IDE、CLI、JetBrains plugin | IDE/CLI 登记 | 阿里 agentic coding platform，支持桌面 IDE、CLI、JetBrains 插件 [S50][S51] |
| Zed ACP | 编辑器协议 / 外部 agent 宿主 | 作为“协议/宿主”登记 | ACP 标准化 editor/IDE 与 agent 的通信 [S52][S53] |
| DevEco Code / CodeGenie | HarmonyOS 专用 IDE agent/assistant | 平台专有工具登记 | DevEco Code 面向 HarmonyOS，支持代码、编译构建、设备运行、调试等；CodeGenie 是 DevEco AI 编程助手 [S54][S55][S56] |
| Sweep | JetBrains coding assistant/agent | IDE 工具登记 | Sweep 当前聚焦 JetBrains coding agent/autocomplete [S57][S58] |
| Pythagora / GPT Pilot | VS Code / Cursor 内 AI developer | App builder/IDE agent 登记 | GPT Pilot 是 Pythagora VS Code extension 的核心技术，目标是完整 AI developer companion [S59][S60] |

### P2：PR Review、协作与 App Builder 邻近工具

这些工具与 coding agent 生态相关，但不一定适合放进“本地 Agent 执行”主流程。

| 工具 | 形态 | 推荐覆盖方式 | 备注 |
| --- | --- | --- | --- |
| CodeRabbit | PR review、IDE/CLI、Slack agent | PR review 工具登记 | AI code review、planning、development workflows [S61][S62] |
| Qodo / PR-Agent | PR review agent | PR review 工具登记；PR-Agent 可开源自托管 | Qodo v2 是 multi-agent review；PR-Agent 是开源 AI PR reviewer [S63][S64] |
| Replit Agent | 浏览器内 app/site builder | App builder 登记 | 自然语言生成 app/site，Agent 4 支持并行 agents [S65][S66] |
| Bolt.new | 浏览器内 web/mobile app builder | App builder 登记 | AI web development agent，可 prompt、run、edit、deploy [S67][S68] |
| Lovable | full-stack app builder | App builder 登记 | full-stack AI builder 类别，偏 no-code/low-code [S69] |
| v0 | Vercel AI app builder/API | App builder/API 登记 | text-to-app / prompt-build-publish，已 agentic 化 [S70][S71] |

## 与 Workbench 的适配建议

### 1. 建议建一个“通用 CLI Agent”入口

多数 P0 工具都可以抽象成同一类能力：

- executable：命令名或完整路径
- installHint：安装提示
- cwdMode：是否需要在项目根目录运行
- promptMode：交互式、一次性 prompt、stdin、文件 prompt
- permissionModel：是否会写文件、跑命令、联网
- contextFiles：是否识别 `AGENTS.md`、`CLAUDE.md`、`.cursorrules`、自定义 rules
- outputArtifacts：diff、日志、PR、session、checkpoint

这样可以先覆盖 Gemini CLI、Aider、Goose、Pi、Hermes、Crush、Qwen Code、Kimi Code、BLACKBOX、Trae Agent、Junie CLI、Factory Droid、Amp，而不是为每个工具写一套 UI。

### 2. 专用适配只留给高频工具

建议专用适配：

- Claude Code
- Codex
- Gemini CLI
- opencode
- Aider
- Goose
- OpenHands

理由：这些工具在本地执行、开源/文档清晰、用户预期较强，适合展示安装状态、版本、默认命令、权限风险和运行日志。

### 3. IDE / 云端工具先做“登记 + 跳转 + 任务模板”

Cursor、Devin、Jules、Copilot agent、Kiro、Qoder、Trae IDE、DevEco Code、CodeRabbit 等工具通常有自己的认证、远程执行环境或 IDE UI。Workbench 直接控制它们的收益不高，初期更适合：

- 保存工具档案
- 提供官网/文档/安装入口
- 提供任务 prompt 模板
- 记录“这个任务已交给哪个外部 agent”
- 后续通过 GitHub API、CLI 或 webhook 接入状态

### 4. 不建议把 app builder 混进主 Agent 执行流

Replit Agent、Bolt、Lovable、v0 的目标用户和交付物更偏“从自然语言生成应用”。它们值得进入资源 Radar 或工具目录，但不应默认与 Claude Code/Codex/Gemini CLI 同一执行模型处理。

## 覆盖优先级清单

P0 必补：

- Gemini CLI
- Aider
- Goose
- OpenHands
- Cline
- Roo Code
- Kilo Code
- Pi
- Hermes Agent
- Crush
- Qwen Code
- Kimi Code
- BLACKBOX CLI
- Trae Agent

P1 建议补：

- GitHub Copilot coding agent
- Jules
- Devin
- Factory Droid
- Cursor
- Devin Desktop / Windsurf Cascade
- Kiro
- Qoder
- Junie
- Zed ACP
- Amazon Q Developer
- DevEco Code / CodeGenie
- Amp

P2 可登记：

- CodeRabbit
- Qodo / PR-Agent
- Sweep
- Pythagora / GPT Pilot
- Replit Agent
- Bolt
- Lovable
- v0

## 风险与注意事项

- Agent 工具变化非常快，名称、归属、定价、开源状态和 CLI 参数都可能频繁变化。实现时不要把价格、stars、benchmark 写死。
- 有些来源显示工具已更名或并入新产品，例如 Windsurf 与 Devin Desktop；接入时应以当前官方文档为准。
- 小众工具如 Hermes、Pi、Crush、BLACKBOX、Kimi Code、Qwen Code适合先做“可配置命令”支持，不要过早承诺深度集成。
- 对会执行 shell、写文件、联网、访问凭据的 agent，Workbench 应明确展示权限边界和工作目录。
- 对 PR review / cloud agent，不要假设它们能在本地复现执行；先记录外部任务状态，再考虑 GitHub/GitLab 集成。

## Sources

- [S01] Claude Docs: <https://platform.claude.com/docs/en/home>
- [S02] Claude Code GitHub: <https://github.com/anthropics/claude-code>
- [S03] OpenAI Codex GitHub: <https://github.com/openai/codex>
- [S04] Gemini CLI GitHub: <https://github.com/google-gemini/gemini-cli>
- [S05] Gemini CLI Google Cloud Docs: <https://docs.cloud.google.com/gemini/docs/codeassist/gemini-cli>
- [S06] opencode: <https://opencode.ai/>
- [S07] Aider Docs: <https://aider.chat/docs/>
- [S08] Aider GitHub: <https://github.com/aider-ai/aider>
- [S09] Goose Docs: <https://goose-docs.ai/>
- [S10] Goose GitHub: <https://github.com/aaif-goose/goose>
- [S11] OpenHands: <https://openhands.dev/>
- [S12] OpenHands Software Agent SDK: <https://github.com/OpenHands/software-agent-sdk>
- [S13] Cline: <https://cline.bot/>
- [S14] Roo Code GitHub: <https://github.com/RooCodeInc/Roo-Code>
- [S15] Kilo: <https://kilo.ai/>
- [S16] Kilo Code GitHub: <https://github.com/kilo-org/kilocode>
- [S17] Pi: <https://pi.dev/>
- [S18] Pi GitHub: <https://github.com/earendil-works/pi>
- [S19] Hermes Agent GitHub: <https://github.com/nousresearch/hermes-agent>
- [S20] Hermes Agent CLI Docs: <https://hermes-agent.nousresearch.com/docs/user-guide/cli>
- [S21] Hermes Agent Providers: <https://hermes-agent.nousresearch.com/docs/integrations/providers>
- [S22] Crush GitHub: <https://github.com/charmbracelet/crush>
- [S23] Qwen Code: <https://qwen.ai/qwencode>
- [S24] Qwen Code Docs: <https://qwenlm.github.io/qwen-code-docs/en/users/overview/>
- [S25] Kimi CLI GitHub: <https://github.com/MoonshotAI/kimi-cli>
- [S26] Kimi Code: <https://www.kimi.com/code/en>
- [S27] BLACKBOX CLI: <https://www.blackbox.ai/cli>
- [S28] Amazon Q Developer: <https://aws.amazon.com/q/developer/>
- [S29] Amazon Q Developer Docs: <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/what-is.html>
- [S30] Trae Agent GitHub: <https://github.com/bytedance/trae-agent>
- [S31] Junie: <https://www.jetbrains.com/junie/>
- [S32] Junie GitHub: <https://github.com/JetBrains/junie>
- [S33] Factory: <https://factory.ai/>
- [S34] Factory GitHub: <https://github.com/factory-ai/factory>
- [S35] Amp: <https://ampcode.com/>
- [S36] GitHub Copilot Cloud Agent Docs: <https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent>
- [S37] GitHub Blog, Copilot coding agent: <https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/>
- [S38] Jules: <https://jules.google/>
- [S39] Google Blog, Jules: <https://blog.google/innovation-and-ai/models-and-research/google-labs/jules/>
- [S40] Jules Tools: <https://developers.googleblog.com/en/meet-jules-tools-a-command-line-companion-for-googles-async-coding-agent/>
- [S41] Devin: <https://devin.ai/>
- [S42] Cognition: <https://cognition.ai/>
- [S43] Cursor: <https://cursor.com/>
- [S44] Wired, Cursor agent interface: <https://www.wired.com/story/cusor-launches-coding-agent-openai-anthropic>
- [S45] Devin Desktop: <https://devin.ai/desktop/>
- [S46] Devin Desktop Cascade Docs: <https://docs.devin.ai/desktop/cascade/cascade>
- [S47] Kiro: <https://kiro.dev/>
- [S48] AWS Kiro Docs: <https://aws.amazon.com/documentation-overview/kiro/>
- [S49] Trae: <https://www.trae.ai/>
- [S50] Qoder: <https://qoder.com/en>
- [S51] Alibaba Cloud Qoder Docs: <https://www.alibabacloud.com/help/en/model-studio/qoder-agent>
- [S52] Zed ACP: <https://zed.dev/acp>
- [S53] Agent Client Protocol: <https://agentclientprotocol.com/get-started/introduction>
- [S54] DevEco Studio: <https://developer.huawei.com/consumer/en/deveco-studio/>
- [S55] DevEco Code GitCode: <https://gitcode.com/openharmony-sig/deveco-code>
- [S56] CodeGenie overview: <https://dev.to/qingkouwei/introduction-to-codegenie-the-most-powerful-ai-powered-programming-assistant-for-harmonyos-next-9gi>
- [S57] Sweep: <https://sweep.dev/>
- [S58] Sweep GitHub: <https://github.com/sweepai/sweep>
- [S59] Pythagora: <https://www.pythagora.ai/>
- [S60] GPT Pilot GitHub: <https://github.com/Pythagora-io/gpt-pilot>
- [S61] CodeRabbit: <https://coderabbit.ai/>
- [S62] CodeRabbit Docs: <https://docs.coderabbit.ai/>
- [S63] Qodo Code Review Docs: <https://docs.qodo.ai/code-review>
- [S64] PR-Agent GitHub: <https://github.com/The-PR-Agent/pr-agent>
- [S65] Replit AI: <https://replit.com/ai>
- [S66] Replit Agent 4: <https://replit.com/agent4>
- [S67] Bolt: <https://bolt.new/>
- [S68] Bolt GitHub: <https://github.com/stackblitz/bolt.new>
- [S69] Lovable guide: <https://lovable.dev/guides/top-ai-platforms-app-development-2026>
- [S70] v0: <https://v0.app/>
- [S71] Vercel v0 Platform API: <https://vercel.com/blog/build-your-own-ai-app-builder-with-the-v0-platform-api>
