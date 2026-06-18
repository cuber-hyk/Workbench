# Agent 工具生态调研报告

调研日期：2026-06-18  
调研对象：面向软件开发、代码库操作、终端执行、IDE 协作和云端异步任务的 AI Agent 工具。  
输出位置：`docs/references/agent-tools-landscape-2026-06-18.md`

## 摘要

当前 Agent 工具生态已经从单一代码补全扩展为多形态工具组合：终端型 coding agent、IDE / 桌面型 agent、云端异步软件工程 agent、PR review agent，以及浏览器内 app builder。Workbench 当前覆盖 Claude、Codex、opencode 后，仍有大量主流和小众工具未被纳入视野。

调研显示，终端型 coding agent 是最接近 Workbench 本地工作台定位的一类工具，代表包括 Gemini CLI、Aider、Goose、OpenHands、Cline、Roo Code、Kilo Code、Pi、Hermes Agent、Crush、Qwen Code、Kimi Code、BLACKBOX CLI、DevEco Code、Trae Agent、Junie CLI、Factory Droid、Amp 等。IDE / 云端工具则更依赖各自平台、账号体系、远程执行环境或编辑器扩展。

从产品覆盖角度看，Workbench 需要区分“可本地执行的 agent”“外部 IDE/云端 agent”“审查/协作类 agent”“应用生成类 agent”。这些类别的运行方式、权限边界、状态记录和用户预期差异明显，不宜混成单一工具类型。

## 背景与目的

Workbench App 是本地优先的 AI 开发工作台，后续需要覆盖更完整的 Agent 工具生态。本报告用于回答三个问题：

- 市面上有哪些主流和小众 Agent / coding agent 工具值得进入资料库？
- 这些工具分别属于哪类形态？
- 对 Workbench 来说，它们在能力、接入边界和风险上有什么差异？

本报告是参考资料，不是开发计划，不定义阶段排期、优先级承诺或具体实现任务。

## 调研范围

本报告把“Agent 工具”定义为：能围绕代码库、本地工作区或远程开发环境执行多步任务的 AI 工具，包括读写文件、运行命令、生成 diff/PR、调试、审查、部署、规划或管理开发任务。

纳入范围：

- CLI / TUI coding agent
- IDE 插件、AI IDE、桌面开发 agent
- 云端异步软件工程 agent
- PR / code review agent
- 浏览器内 app builder，当它能生成并修改完整代码项目时作为邻近类别列入

不重点纳入：

- 纯聊天模型
- 只做 autocomplete 的代码助手
- LangChain、AutoGen、CrewAI 等 agent 框架，除非其同时提供面向开发者的成品 coding agent
- 只提供模型推理 API、没有明确开发工具形态的产品

## 调研方法

本次调研以公开资料为主，优先查阅官方站点、官方文档、官方 GitHub 仓库和产品公告。调研过程中尝试使用本地 `tavily` 技能脚本，但环境未配置 `TAVILY_API_KEY`，因此改用公开 Web 检索完成。

由于 Agent 工具生态变化较快，报告中的产品归属、开源状态、工具形态和 CLI 能力应视为截至 2026-06-18 的调研快照。接入前仍需针对目标工具做二次核验。

## 分类发现

### 终端型 Coding Agent

这类工具通常以 CLI / TUI 方式运行，直接读取本地仓库、编辑文件、运行命令或生成 diff。它们最接近 Workbench 的本地工作台场景。

| 工具 | 形态 | 开源 / BYOM | 调研观察 | 来源 |
| --- | --- | --- | --- | --- |
| Claude Code | CLI、IDE、GitHub | 非开源，Anthropic 模型为主 | Anthropic 官方将其描述为运行在终端里的 agentic coding tool。 | [S01][S02] |
| OpenAI Codex CLI | CLI、IDE、Codex Web、GitHub review | Apache-2.0 CLI；模型绑定 OpenAI | 官方 GitHub 称其为本地运行的 coding agent。 | [S03] |
| Gemini CLI | CLI、GitHub Actions、Zed ACP | 开源，Google Gemini 为主 | Google 官方开源终端 AI agent，支持 ReAct loop、MCP、本地和远程工具。 | [S04][S05] |
| opencode | CLI、Desktop beta | 开源，支持多模型 | 官方强调可连接 Claude、GPT、Gemini 等模型。 | [S06] |
| Aider | CLI | 开源，多模型 | 终端 pair programming 工具，可直接编辑本地 git repo。 | [S07][S08] |
| Goose | CLI、Desktop、API | 开源，多模型，MCP | Block 开源的通用本地 agent，可用于代码、自动化和研究任务。 | [S09][S10] |
| OpenHands | 本地/云端软件开发 agent 平台 | 开源，模型无关 | 面向真实工程任务，支持 SDK、Agent Server、临时 workspace。 | [S11][S12] |
| Cline | VS Code、CLI、SDK | 开源，BYOK | open coding agent，支持 Plan/Act、MCP 和终端工作流。 | [S13] |
| Roo Code | VS Code 系 agent | 开源，BYOK | 支持 Code、Architect、Ask、Debug 和自定义模式。 | [S14] |
| Kilo Code | VS Code、JetBrains、CLI、Cloud | 开源，BYOK、本地模型 | 官方定位为 all-in-one agentic engineering platform。 | [S15][S16] |
| Pi | CLI agent harness | 开源，多 provider | minimal agent harness，包含 pi-coding-agent、runtime 和 multi-provider API。 | [S17][S18] |
| Hermes Agent | CLI、长驻服务、消息平台 | 开源，自托管，多 provider | Nous Research 项目，强调技能、记忆、自我改进和多入口运行。 | [S19][S20][S21] |
| Crush | 终端 coding agent | 开源/源码可见，LLM 可插拔 | Charmbracelet 出品，强调在终端连接工具、代码和 workflow。 | [S22] |
| Qwen Code | CLI、IDE 友好 | 开源，优化 Qwen，也可作为 agentic CLI | 官方称其为 terminal-first agentic workflow，支持 Skills/SubAgents。 | [S23][S24] |
| Kimi Code CLI | CLI、SDK | 开源，多 provider 兼容 | 可读写代码、执行 shell、搜索/抓取网页、规划行动。 | [S25][S26] |
| BLACKBOX CLI | CLI、CI | 开源，多 agent 并行 | 终端 AI coding agent，支持并行 agent。 | [S27] |
| DevEco Code | CLI、HarmonyOS 开发 Agent | MIT；基于 OpenCode 扩展 | 通过 `npm install -g @deveco/deveco-code` 安装，启动命令为 `deveco`；依赖 DevEco Studio 提供编译构建、设备运行等 HarmonyOS 能力。 | [S55][S72] |
| Amazon Q Developer / Kiro CLI | IDE、CLI、AWS/GitHub/GitLab | 商业，AWS 生态 | AWS 官方说明其 agentic coding 能读写文件、生成 diff、运行 shell。 | [S28][S29] |
| Trae Agent | CLI；另有 Trae IDE | 开源 CLI，ByteDance | GitHub 描述为面向 general purpose software engineering tasks 的 CLI agent。 | [S30] |
| Junie CLI | CLI、JetBrains、CI/CD | LLM-agnostic，JetBrains | JetBrains 称其可用于 terminal、IDE 和 CI/CD。 | [S31][S32] |
| Factory Droid | CLI、Web、Slack/Teams、Linear/Jira、Mobile | 商业，多模型 | 官方 GitHub 显示 `droid` CLI，可在项目目录启动。 | [S33][S34] |
| Amp | CLI / agent 产品 | 商业，模型前沿适配 | 官方定位为 frontier coding agent。 | [S35] |

### IDE、桌面与云端异步 Agent

这类工具通常有自己的 IDE UI、账号体系、远程执行环境或任务队列。它们也是 Agent 生态的重要部分，但与本地 CLI agent 的接入边界不同。

| 工具 | 形态 | 调研观察 | 来源 |
| --- | --- | --- | --- |
| GitHub Copilot coding agent | GitHub issue/PR、VS Code、CLI/Cloud agent | 可将 GitHub issue 分配给 Copilot，后台工作并打开 PR。 | [S36][S37] |
| Jules | Google 异步 coding agent、GitHub、CLI companion | 可导入 repo、分支修改、运行测试、创建 PR。 | [S38][S39][S40] |
| Devin | 云端软件工程 agent；Devin Desktop | 官方称其为 AI coding agent/software engineer，面向复杂多 repo 团队。 | [S41][S42] |
| Cursor | AI IDE、background agents | 官方强调 agent 可把想法转成代码，Cursor 3 强化 agent-first 体验。 | [S43][S44] |
| Devin Desktop / Windsurf Cascade | AI IDE、Cascade agent | Windsurf 已更名/并入 Devin Desktop；Cascade 是 agentic AI assistant。 | [S45][S46] |
| Kiro | AWS agentic IDE、CLI | 规格驱动开发体验：prompt -> specs -> code/docs/tests。 | [S47][S48] |
| Trae IDE | AI IDE | 官方称可规划 workflow、调用工具并部署 production-ready code。 | [S49] |
| Qoder | AI IDE、CLI、JetBrains plugin | 阿里 agentic coding platform，支持桌面 IDE、CLI、JetBrains 插件。 | [S50][S51] |
| Zed ACP | 编辑器协议 / 外部 agent 宿主 | ACP 标准化 editor/IDE 与 agent 的通信。 | [S52][S53] |
| DevEco Studio / CodeGenie | HarmonyOS 专用 IDE 与 IDE 内 AI assistant | DevEco Studio 是 HarmonyOS 官方 IDE；CodeGenie 是 IDE 内 AI 编程助手。DevEco Code 作为 CLI Agent 单独归入终端型工具。 | [S54][S56] |
| Sweep | JetBrains coding assistant/agent | 当前聚焦 JetBrains coding agent/autocomplete。 | [S57][S58] |
| Pythagora / GPT Pilot | VS Code / Cursor 内 AI developer | GPT Pilot 是 Pythagora VS Code extension 的核心技术。 | [S59][S60] |

### PR Review 与协作类 Agent

这类工具的主要入口是 pull request、代码审查、团队协作系统或开发流程自动化。它们通常不承担完整的本地 agent 执行流，但会影响开发者如何使用 AI 处理代码变更。

| 工具 | 形态 | 调研观察 | 来源 |
| --- | --- | --- | --- |
| CodeRabbit | PR review、IDE/CLI、Slack agent | 覆盖 AI code review、planning 和 development workflows。 | [S61][S62] |
| Qodo / PR-Agent | PR review agent | Qodo v2 是 multi-agent review；PR-Agent 是开源 AI PR reviewer。 | [S63][S64] |

### App Builder 邻近工具

这类工具通常从自然语言生成应用、站点或前端项目。它们不一定是传统 coding agent，但在“AI 生成和修改代码项目”这一维度上与 Agent 生态相邻。

| 工具 | 形态 | 调研观察 | 来源 |
| --- | --- | --- | --- |
| Replit Agent | 浏览器内 app/site builder | 自然语言生成 app/site，Agent 4 支持并行 agents。 | [S65][S66] |
| Bolt.new | 浏览器内 web/mobile app builder | AI web development agent，可 prompt、run、edit、deploy。 | [S67][S68] |
| Lovable | full-stack app builder | full-stack AI builder 类别，偏 no-code/low-code。 | [S69] |
| v0 | Vercel AI app builder/API | text-to-app / prompt-build-publish，已 agentic 化。 | [S70][S71] |

## 关键观察

### 1. 终端型 Agent 的共同特征更稳定

终端型 coding agent 通常具备以下共同字段：

- executable：命令名或完整路径
- installHint：安装提示
- cwdMode：是否需要在项目根目录运行
- promptMode：交互式、一次性 prompt、stdin、文件 prompt
- permissionModel：是否会写文件、跑命令、联网
- contextFiles：是否识别 `AGENTS.md`、`CLAUDE.md`、`.cursorrules` 或自定义 rules
- outputArtifacts：diff、日志、PR、session、checkpoint

这些字段适合作为工具资料库的基础信息，但不等同于实现计划。

### 2. IDE / 云端 Agent 的控制边界更强

Cursor、Devin、Jules、Copilot agent、Kiro、Qoder、Trae IDE、DevEco Studio / CodeGenie、CodeRabbit 等工具通常依赖外部账号、远程环境、编辑器插件或平台服务。Workbench 对这类工具更适合记录产品形态、入口链接、任务上下文和外部状态，而不是假设可以像本地 CLI 一样直接执行。

### 3. Review Agent 与 App Builder 不宜混同

CodeRabbit、Qodo / PR-Agent 主要围绕 PR 和代码审查；Replit Agent、Bolt、Lovable、v0 主要围绕应用生成。它们都属于广义 Agent 生态，但用户任务、输入输出、权限模型和交付物与本地 coding agent 不同。

### 4. 品牌、授权与图标资源需要单独核验

Agent 工具的名称、品牌归属、logo、favicon 和开源状态变化较快。图标可作为内部调研占位，但正式产品使用前应逐项确认品牌规范和授权要求。

## 风险与限制

- 工具变化非常快，名称、归属、定价、开源状态和 CLI 参数都可能变化。
- 小众工具的维护状态、安装方式和稳定性需要接入前复核。
- 有些工具可能已更名、合并或改变定位，例如 Windsurf 与 Devin Desktop。
- 对会执行 shell、写文件、联网、访问凭据的 agent，需要明确工作目录和权限边界。
- 对 PR review / cloud agent，不能假设其行为可在本地完全复现。
- 本报告未做 benchmark、性能对比、成本测算或安全审计。

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
- [S55] DevEco Code GitHub: <https://github.com/CarSmallGuo/deveco-code>
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
- [S72] DevEco Code npm: <https://www.npmjs.com/package/@deveco/deveco-code>
