import type { Skill, ToolKey } from "../../lib/types/domain";

export function syncMethodLabel(method: "symlink" | "copy") {
  return method === "symlink" ? "Symlink" : "Copy";
}

export function skillMatchesStatusFilter(skill: Skill, filter: string) {
  if (filter === "全部状态") return true;
  const hasGlobalManaged = skill.globalToolStates.some((state) => state.status === "managed");
  const hasConflict = skill.globalToolStates.some((state) => state.status === "conflict");
  const hasProjectEnablement = skill.enabledProjects.length > 0;
  const enabled = hasGlobalManaged || hasProjectEnablement;
  if (filter === "已启用") return enabled;
  if (filter === "内容冲突") return hasConflict;
  if (filter === "未启用") return !enabled && !hasConflict;
  return true;
}

export function skillMatchesToolProjectFilter(
  skill: Skill,
  toolFilter: ToolKey | "全部工具",
  projectFilter: string
) {
  const hasToolFilter = toolFilter !== "全部工具";
  const hasProjectFilter = projectFilter !== "全部项目";
  if (!hasToolFilter && !hasProjectFilter) return true;
  const toolKey = hasToolFilter ? toolFilter : undefined;

  if (hasProjectFilter) {
    const projectEnablements = skill.enabledProjects.filter((entry) => entry.projectPath === projectFilter);
    if (!toolKey) return projectEnablements.length > 0;
    return projectEnablements.some((entry) => entry.tool === toolKey);
  }

  if (!toolKey) return true;
  return (
    skill.enabledTools.includes(toolKey) ||
    skill.globalToolStates.some((state) => state.tool === toolKey && state.status === "managed") ||
    skill.enabledProjects.some((entry) => entry.tool === toolKey)
  );
}

export function globalStatusLabel(
  state: Skill["globalToolStates"][number] | undefined
) {
  if (!state || state.status === "disabled") return "未启用";
  if (state.status === "conflict") return "内容冲突";
  return `Workbench 管理 · ${syncMethodLabel(state.syncMethod ?? "copy")}`;
}
