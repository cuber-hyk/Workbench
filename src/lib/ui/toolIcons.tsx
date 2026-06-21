import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import codexIcon from "../../assets/tool-icons/codex.png";
import claudeCodeIcon from "../../assets/tool-icons/claude-code.ico";
import opencodeIcon from "../../assets/tool-icons/opencode.ico";
import devecoIcon from "../../assets/tool-icons/deveco-code.ico";
import hermesIcon from "../../assets/tool-icons/hermes-agent.png";
import kimiIcon from "../../assets/tool-icons/kimi-code.ico";
import piIcon from "../../assets/tool-icons/pi.svg";
import geminiIcon from "../../assets/tool-icons/gemini-cli.png";
import qwenIcon from "../../assets/tool-icons/qwen-code.png";
import gooseIcon from "../../assets/tool-icons/goose.png";
import kiloIcon from "../../assets/tool-icons/kilo-code.ico";
import clineIcon from "../../assets/tool-icons/cline.png";
import rooIcon from "../../assets/tool-icons/roo-code.png";
import factoryIcon from "../../assets/tool-icons/factory-droid.ico";
import ampIcon from "../../assets/tool-icons/amp.ico";
import kiroIcon from "../../assets/tool-icons/kiro-cli.ico";
import junieIcon from "../../assets/tool-icons/junie-cli.ico";
import type { ToolTarget } from "../types/domain";

const toolIconSources: Record<string, string> = {
  codex: codexIcon,
  claude: claudeCodeIcon,
  opencode: opencodeIcon,
  deveco: devecoIcon,
  hermes: hermesIcon,
  kimi: kimiIcon,
  pi: piIcon,
  gemini: geminiIcon,
  qwen: qwenIcon,
  goose: gooseIcon,
  kilo: kiloIcon,
  cline: clineIcon,
  roo: rooIcon,
  factory: factoryIcon,
  amp: ampIcon,
  kiro: kiroIcon,
  junie: junieIcon
};

function customToolIconSource(path: string) {
  if (!path) return "";
  if (("__TAURI_INTERNALS__" in window) && (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/"))) {
    return convertFileSrc(path);
  }
  return path;
}

export function ToolIcon({ tool }: { tool: ToolTarget }) {
  const source = tool.iconPath ? customToolIconSource(tool.iconPath) : toolIconSources[tool.key];
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  if (source && !failed) return <img src={source} alt="" aria-hidden="true" onError={() => setFailed(true)} />;
  return <span aria-hidden="true">{tool.key.slice(0, 2).toUpperCase()}</span>;
}
