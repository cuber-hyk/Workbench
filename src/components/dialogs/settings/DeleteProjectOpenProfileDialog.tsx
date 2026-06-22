import { ConfirmDeleteModal } from "../../ui";
import { projectOpenProfileSummary } from "../../../views/settings/settingsFormatters";
import type { ProjectOpenProfile } from "../../../lib/types/domain";

export function DeleteProjectOpenProfileDialog({
  profile,
  onClose,
  onConfirm
}: {
  profile: ProjectOpenProfile;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除打开方式"
      description={`确认删除 ${profile.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除"
    >
      <p>删除后，该打开方式会从项目列表菜单中移除，不会卸载本机软件。</p>
      <div className="file-block"><span>命令</span><code>{projectOpenProfileSummary(profile)}</code></div>
    </ConfirmDeleteModal>
  );
}
