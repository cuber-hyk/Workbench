import { ConfirmDeleteModal } from "../../ui";
import type { SkillMarketItem } from "../../../lib/types/domain";

export function DeleteMarketSkillDialog({
  item,
  onClose,
  onConfirm
}: {
  item: SkillMarketItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const directoryName = item.installedDirectoryName || item.skillId;
  return (
    <ConfirmDeleteModal
      title="卸载市场 Skill"
      description={`确认卸载 ${item.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="卸载 Skill"
    >
      <p>将删除 Workbench 统一根目录中的源 Skill，并清理 Workbench 管理的全局和项目启用副本或符号链接。</p>
      <div className="file-block">
        <span>Skill</span>
        <code>{directoryName}</code>
      </div>
      <div className="file-block">
        <span>skills.sh 包</span>
        <code>{item.source}/{item.skillId}</code>
      </div>
      <div className="warning">不会删除未被 Workbench 管理的外部工具目录内容。</div>
    </ConfirmDeleteModal>
  );
}
