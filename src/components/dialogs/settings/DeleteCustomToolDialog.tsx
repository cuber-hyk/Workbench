import { ConfirmDeleteModal } from "../../ui";
import type { ToolTarget } from "../../../lib/types/domain";

export function DeleteCustomToolDialog({
  tool,
  onClose,
  onConfirm
}: {
  tool: ToolTarget;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除自定义工具"
      description={`确认删除 ${tool.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除"
    >
      <p>Workbench 会移除该工具的配置、排序和启用记录，但不会删除外部 Skills 目录。</p>
      <div className="file-block"><span>全局 Skills 目录</span><code>{tool.globalSkillsDir}</code></div>
    </ConfirmDeleteModal>
  );
}
