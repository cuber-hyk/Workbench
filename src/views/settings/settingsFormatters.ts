import type { CloseBehavior, ProjectOpenProfile } from "../../lib/types/domain";

export function projectOpenProfileSummary(profile: ProjectOpenProfile) {
  const command = profile.executablePath || profile.command || "未配置命令";
  const args = profile.args.length ? ` ${profile.args.join(" ")}` : "";
  return `${command}${args}`;
}

export function closeBehaviorLabel(behavior: CloseBehavior) {
  if (behavior === "exit") return "退出应用";
  return "隐藏到托盘";
}
