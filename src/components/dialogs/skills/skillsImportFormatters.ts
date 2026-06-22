import type { ExternalSkillCandidateGroup, ImportResult, ManagedTargetRebuildResult } from "../../../lib/types/domain";

export function candidateStatusImportClass(status: ExternalSkillCandidateGroup["status"]) {
  if (status === "new") return "imported";
  if (status === "same_as_current") return "skipped";
  if (status === "conflict") return "conflict";
  return "invalid";
}

export function externalCandidateStatusLabel(status: ExternalSkillCandidateGroup["status"]) {
  if (status === "new") return "可导入";
  if (status === "same_as_current") return "已存在相同内容";
  if (status === "conflict") return "同名冲突";
  if (status === "unreadable") return "不可读";
  return "无效";
}

export function managedTargetStatusImportClass(status: ManagedTargetRebuildResult["status"]) {
  if (status === "ready" || status === "rebuilt") return "imported";
  if (status === "skipped") return "skipped";
  if (status === "conflict") return "conflict";
  return "invalid";
}

export function managedTargetStatusLabel(status: ManagedTargetRebuildResult["status"]) {
  if (status === "ready") return "可重建";
  if (status === "rebuilt") return "已重建";
  if (status === "skipped") return "已跳过";
  if (status === "conflict") return "冲突";
  return "无效";
}

export function importStatusLabel(status: ImportResult["status"]) {
  if (status === "imported") return "已导入";
  if (status === "invalid") return "无效";
  if (status === "conflict") return "冲突";
  return "已跳过";
}
