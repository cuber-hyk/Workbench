import type { SkillMarketDetail, SkillMarketItem, SkillUpdateState } from "../../lib/types/domain";

export function marketItemStatus(item: SkillMarketItem): SkillUpdateState {
  if (!item.installable) return "unsupported";
  if (item.updateStatus === "update_available") return "update_available";
  if (item.installedDirectoryName) return "installed";
  return "not_installed";
}

export function marketRepositoryUrl(item: SkillMarketItem) {
  return item.installable ? `https://github.com/${item.source}` : "";
}

export function localMarketDetail(item: SkillMarketItem): SkillMarketDetail {
  return {
    item,
    repositoryUrl: "",
    installCommand: `npx -y skills add ${item.source} --skill ${item.skillId} -g --agent codex -y --copy`,
    skillMarkdownPreview: "",
    securityNote: "该来源不是 GitHub owner/repo 格式，Workbench 暂不请求远程详情，也不支持安装。"
  };
}

export function buildMarketStats(items: SkillMarketItem[]) {
  return items.reduce(
    (stats, item) => {
      stats.total += 1;
      if (!item.installable) {
        stats.unsupported += 1;
      } else if (item.updateStatus === "update_available") {
        stats.updateAvailable += 1;
        stats.installed += 1;
      } else if (item.installedDirectoryName) {
        stats.installed += 1;
      } else {
        stats.notInstalled += 1;
      }
      return stats;
    },
    { total: 0, installed: 0, notInstalled: 0, updateAvailable: 0, unsupported: 0 }
  );
}

export type MarketStats = ReturnType<typeof buildMarketStats>;

export function updateStatusLabel(status: SkillUpdateState) {
  if (status === "update_available") return "可更新";
  if (status === "up_to_date") return "已是最新";
  if (status === "check_failed") return "检查失败";
  if (status === "unsupported") return "不支持";
  if (status === "installed") return "未检查";
  return "未安装";
}

export function formatInstallCount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}
