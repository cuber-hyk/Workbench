import { ArrowUpCircle, Ban, CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import type { SkillUpdateState } from "../../lib/types/domain";

export function SkillStatusIndicator({ status, label }: { status: SkillUpdateState; label?: string }) {
  const presentation = {
    not_installed: { icon: CircleDashed, tone: "neutral", label: "未安装" },
    installed: { icon: CircleCheck, tone: "success", label: "已安装" },
    up_to_date: { icon: CircleCheck, tone: "success", label: "已是最新" },
    update_available: { icon: ArrowUpCircle, tone: "attention", label: "可更新" },
    check_failed: { icon: CircleAlert, tone: "danger", label: "检查失败" },
    unsupported: { icon: Ban, tone: "neutral", label: "不支持" }
  }[status];
  const Icon = presentation.icon;
  const text = label ?? presentation.label;
  return (
    <span className={`skill-status-indicator ${presentation.tone}`} aria-label={text}>
      <Icon size={14} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
