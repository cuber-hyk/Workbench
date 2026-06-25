import type { Project } from "../../../lib/types/domain";
import { ConfirmDeleteModal } from "../../ui";

export function DeleteProjectDialog({
  project,
  reason,
  onClose,
  onConfirm
}: {
  project: Project;
  reason: "manual" | "missing-path";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除项目记录"
      description={`确认删除 ${project.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除记录"
    >
      {reason === "missing-path" && <p>Workbench 访问项目目录时发现路径不存在，可能已被移动或删除。</p>}
      <p>此操作只会从 Workbench 项目列表中删除记录，不会删除本地项目文件。</p>
      <div className="warning">项目路径：{project.path}</div>
    </ConfirmDeleteModal>
  );
}
