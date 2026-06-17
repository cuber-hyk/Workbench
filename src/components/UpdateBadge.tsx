import { ArrowUpCircle } from "lucide-react";
import { useAppUpdate } from "../contexts/AppUpdateContext";

export function UpdateBadge({ onClick }: { onClick: () => void }) {
  const { hasUpdate, updateInfo } = useAppUpdate();

  if (!hasUpdate || !updateInfo) return null;

  const title = `发现新版本 ${updateInfo.latestVersion}，点击查看更新`;

  return (
    <button type="button" className="update-badge" title={title} aria-label={title} onClick={onClick}>
      <ArrowUpCircle size={15} />
      <span>有新版本</span>
    </button>
  );
}
