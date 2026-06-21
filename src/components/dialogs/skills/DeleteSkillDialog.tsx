import { ConfirmDeleteModal } from "../../ui";
import type { Skill } from "../../../lib/types/domain";

export function DeleteSkillDialog({
  skill,
  onClose,
  onConfirm
}: {
  skill: Skill;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除 Skill"
      description={`确认删除 ${skill.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除 Skill"
    >
      <p>将删除统一根目录中的 Skill，并清理 Workbench 管理的全局和项目启用记录。</p>
      <div className="file-block">
        <span>目录</span>
        <code>{skill.skillPath.replace(/[\\/][^\\/]+$/, "")}</code>
      </div>
      <div className="warning">不会删除未被 Workbench 管理的外部工具目录内容。</div>
    </ConfirmDeleteModal>
  );
}
