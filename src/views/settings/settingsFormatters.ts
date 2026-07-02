import type { CloseBehavior, LocalStatusRefreshIntervalSeconds, ProjectOpenProfile } from "../../lib/types/domain";

export function projectOpenProfileSummary(profile: ProjectOpenProfile) {
  const command = profile.executablePath || profile.command || "未配置命令";
  const args = profile.args.length ? ` ${profile.args.join(" ")}` : "";
  return `${command}${args}`;
}

export function closeBehaviorLabel(behavior: CloseBehavior) {
  if (behavior === "exit") return "退出应用";
  return "隐藏到托盘";
}

export function localStatusRefreshIntervalLabel(intervalSeconds: LocalStatusRefreshIntervalSeconds) {
  switch (intervalSeconds) {
    case 0:
      return "关闭";
    case 30:
      return "30 秒";
    case 60:
      return "1 分钟";
    case 300:
      return "5 分钟";
  }
}
