import { FolderOpen } from "lucide-react";
import { Button, Modal } from "../../ui";
import { workbenchApi } from "../../../lib/api/workbenchApi";
import type { ImportResult } from "../../../lib/types/domain";
import { importStatusLabel } from "./skillsImportFormatters";

export function SkillsImportDialog({
  results,
  skillsRoot,
  onClose
}: {
  results: ImportResult[];
  skillsRoot: string;
  onClose: () => void;
}) {
  const importedCount = results.filter((result) => result.status === "imported").length;
  const conflictCount = results.filter((result) => result.status === "conflict").length;
  const invalidCount = results.filter((result) => result.status === "invalid").length;
  return (
    <Modal
      title="导入 Skills"
      description="从 ZIP 文件或已解压文件夹导入到统一根目录"
      onClose={onClose}
      large
      footer={
        <>
          <Button onClick={() => void workbenchApi.openLocalPath(skillsRoot)}><FolderOpen size={15} />打开统一根目录</Button>
          <Button variant="primary" onClick={onClose}>完成</Button>
        </>
      }
    >
      {results.length > 0 && (
        <>
          <div className="import-summary">
            <strong>导入完成</strong>
            <span>成功 {importedCount} 个 · 跳过 {conflictCount} 个 · 无效 {invalidCount} 个</span>
          </div>
          <div className="import-list">
            {results.map((result) => (
              <div className={`import-result ${result.status}`} key={result.directoryName}>
                <span><strong>{result.directoryName}</strong><small>{result.message}</small></span>
                <i>{importStatusLabel(result.status)}</i>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="warning">同名 Skill 会跳过；导入来源保持不变。已导入的 Skills 默认不会自动启用。</div>
    </Modal>
  );
}
