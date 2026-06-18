# Terminal Coding Agent Icons

调研日期：2026-06-18

本目录保存终端型 coding agent 的参考图标，用于 Workbench 后续工具目录、资源 Radar 或 Agent 适配 UI 的视觉占位。

## 使用边界

- 这些图标来自官方站点 favicon、官方 GitHub 组织/仓库头像或产品站点静态资源。
- 本目录仅作为调研引用和内部设计占位；正式发布前需要逐项核验品牌使用条款。
- 如果工具提供正式 brand kit，应优先替换为 brand kit 中的 SVG/PNG。
- 如果同一工具同时有官网 logo 和 GitHub 头像，本目录优先使用可稳定下载的来源。

## 图标索引

| 工具 | 文件 | 来源类型 | 来源 URL | 产品 / 项目 |
| --- | --- | --- | --- | --- |
| Claude Code | `claude-code.ico` | 官网 favicon | <https://claude.ai/favicon.ico> | <https://github.com/anthropics/claude-code> |
| OpenAI Codex CLI | `codex.png` | GitHub 组织头像 | <https://github.com/openai.png?size=256> | <https://github.com/openai/codex> |
| Gemini CLI | `gemini-cli.png` | GitHub 组织头像 | <https://github.com/google-gemini.png?size=256> | <https://github.com/google-gemini/gemini-cli> |
| opencode | `opencode.ico` | 官网 favicon | <https://opencode.ai/favicon.ico> | <https://opencode.ai/> |
| Aider | `aider.png` | GitHub 组织头像 | <https://github.com/Aider-AI.png?size=256> | <https://github.com/aider-ai/aider> |
| Goose | `goose.png` | GitHub 组织头像 | <https://github.com/aaif-goose.png?size=256> | <https://github.com/aaif-goose/goose> |
| OpenHands | `openhands.png` | GitHub 组织头像 | <https://github.com/OpenHands.png?size=256> | <https://openhands.dev/> |
| Cline | `cline.png` | GitHub 组织头像 | <https://github.com/cline.png?size=256> | <https://cline.bot/> |
| Roo Code | `roo-code.png` | GitHub 组织头像 | <https://github.com/RooCodeInc.png?size=256> | <https://github.com/RooCodeInc/Roo-Code> |
| Kilo Code | `kilo-code.ico` | 官网 favicon | <https://kilo.ai/favicon.ico> | <https://kilo.ai/> |
| Pi | `pi.png` | GitHub 组织头像 | <https://github.com/earendil-works.png?size=256> | <https://pi.dev/> |
| Hermes Agent | `hermes-agent.png` | GitHub 组织头像 | <https://github.com/NousResearch.png?size=256> | <https://github.com/nousresearch/hermes-agent> |
| OpenClaw | `openclaw.png` | GitHub 组织头像 | <https://github.com/openclaw.png?size=256> | <https://openclaw.ai/> |
| Crush | `crush.png` | GitHub 组织头像 | <https://github.com/charmbracelet.png?size=256> | <https://github.com/charmbracelet/crush> |
| Qwen Code | `qwen-code.png` | GitHub 组织头像 | <https://github.com/QwenLM.png?size=256> | <https://qwen.ai/qwencode> |
| Kimi Code CLI | `kimi-code.ico` | 官网 favicon | <https://www.kimi.com/favicon.ico> | <https://www.kimi.com/code/en> |
| BLACKBOX CLI | `blackbox-cli.ico` | 官网 favicon | <https://www.blackbox.ai/favicon.ico> | <https://www.blackbox.ai/cli> |
| DevEco Code | `deveco-code.png` | GitHub 用户头像 | <https://github.com/CarSmallGuo.png?size=256> | <https://github.com/CarSmallGuo/deveco-code> |
| Trae Agent | `trae-agent.png` | GitHub 组织头像 | <https://github.com/bytedance.png?size=256> | <https://github.com/bytedance/trae-agent> |
| Junie CLI | `junie-cli.ico` | JetBrains favicon | <https://www.jetbrains.com/favicon.ico> | <https://www.jetbrains.com/junie/> |
| Factory Droid | `factory-droid.ico` | 官网 favicon | <https://factory.ai/favicon.ico> | <https://factory.ai/> |
| Amp | `amp.ico` | 官网 favicon | <https://ampcode.com/favicon.ico> | <https://ampcode.com/> |
| Cursor CLI | `cursor-cli.ico` | 官网 favicon | <https://cursor.com/favicon.ico> | <https://cursor.com/cli> |
| GitHub Copilot CLI | `github-copilot-cli.svg` | GitHub favicon | <https://github.githubassets.com/favicons/favicon.svg> | <https://github.com/features/copilot/cli> |
| Mistral Vibe | `mistral-vibe.ico` | 官网 favicon | <https://mistral.ai/favicon.ico> | <https://mistral.ai/products/vibe/code/> |
| Kiro CLI | `kiro-cli.ico` | 官网 favicon | <https://kiro.dev/favicon.ico> | <https://kiro.dev/> |

## 后续建议

- UI 实现时优先读取本目录文件，不要运行时热链外部图标。
- 若后续工具数据模型支持 `iconPath`，可将路径写为相对引用，例如 `docs/references/terminal-coding-agent-icons/gemini-cli.png`。
- 若要进入产品内置资产，建议迁移到应用资源目录并统一转换为 SVG 或 PNG。
