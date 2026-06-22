import { useEffect, useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button, Modal } from "../../ui";
import { workbenchApi } from "../../../lib/api/workbenchApi";
import type { ImportResult } from "../../../lib/types/domain";
import { importStatusLabel } from "./skillsImportFormatters";

export function SkillsImportDialog({
  results,
  skillsRoot,
  canResolveConflicts = false,
  onOverwriteConflicts,
  onClose
}: {
  results: ImportResult[];
  skillsRoot: string;
  canResolveConflicts?: boolean;
  onOverwriteConflicts?: (directoryNames: string[]) => Promise<void> | void;
  onClose: () => void;
}) {
  const conflictResults = useMemo(
    () => results.filter((result) => result.status === "conflict"),
    [results]
  );
  const [selectedConflicts, setSelectedConflicts] = useState<string[]>([]);
  const [isOverwriting, setIsOverwriting] = useState(false);
  const importedCount = results.filter((result) => result.status === "imported").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;
  const conflictCount = results.filter((result) => result.status === "conflict").length;
  const invalidCount = results.filter((result) => result.status === "invalid").length;
  const canOverwrite = canResolveConflicts && conflictResults.length > 0;
  const summaryPills = [
    importedCount > 0 ? `成功 ${importedCount}` : "",
    skippedCount > 0 ? `跳过 ${skippedCount}` : "",
    conflictCount > 0 ? `冲突 ${conflictCount}` : "",
    invalidCount > 0 ? `无效 ${invalidCount}` : ""
  ].filter(Boolean);

  useEffect(() => {
    setSelectedConflicts([]);
  }, [results]);

  function toggleConflict(directoryName: string, checked: boolean) {
    setSelectedConflicts((current) =>
      checked
        ? Array.from(new Set([...current, directoryName]))
        : current.filter((item) => item !== directoryName)
    );
  }

  async function overwriteSelectedConflicts() {
    if (selectedConflicts.length === 0) return;
    setIsOverwriting(true);
    try {
      await onOverwriteConflicts?.(selectedConflicts);
    } finally {
      setIsOverwriting(false);
    }
  }

  return (
    <Modal
      title="导入 Skills"
      description="从 ZIP 文件或已解压文件夹导入到统一根目录"
      onClose={onClose}
      large
      footer={
        <>
          <Button onClick={() => void workbenchApi.openLocalPath(skillsRoot)}><FolderOpen size={15} />打开统一根目录</Button>
          <span className="import-footer-actions">
            <Button variant={canOverwrite ? "default" : "primary"} onClick={onClose}>完成</Button>
            {canOverwrite && (
              <Button
                variant="primary"
                disabled={selectedConflicts.length === 0 || isOverwriting}
                onClick={() => void overwriteSelectedConflicts()}
              >
                {isOverwriting ? "覆盖中..." : "覆盖选中冲突"}
              </Button>
            )}
          </span>
        </>
      }
    >
      {results.length > 0 && (
        <div className="skill-import-dialog-body">
          <div className="skill-import-results-panel">
            <div className="import-summary">
              <strong>{conflictCount > 0 && canOverwrite ? `发现 ${conflictCount} 个同名 Skill` : "导入完成"}</strong>
              <span className="import-summary-actions">
                {summaryPills.map((pill) => (
                  <i className={pill.startsWith("冲突") ? "attention" : ""} key={pill}>{pill}</i>
                ))}
                {canOverwrite && (
                  <Button
                    disabled={selectedConflicts.length === conflictResults.length}
                    onClick={() => setSelectedConflicts(conflictResults.map((result) => result.directoryName))}
                  >
                    全选冲突
                  </Button>
                )}
              </span>
            </div>
            <div className="import-list skill-import-list">
              {results.map((result) => {
                const selectable = canOverwrite && result.status === "conflict";
                if (selectable) {
                  return (
                    <label className={`import-result ${result.status} import-conflict-choice`} key={result.directoryName}>
                      <input
                        type="checkbox"
                        checked={selectedConflicts.includes(result.directoryName)}
                        onChange={(event) => toggleConflict(result.directoryName, event.currentTarget.checked)}
                      />
                      <span>
                        <strong>{result.directoryName}</strong>
                        <small>{result.message}</small>
                      </span>
                      <i>待决策</i>
                    </label>
                  );
                }
                return (
                  <div className={`import-result ${result.status}`} key={result.directoryName}>
                    <span><strong>{result.directoryName}</strong><small>{result.message}</small></span>
                    <i>{importStatusLabel(result.status)}</i>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <p className="import-footnote">覆盖前会备份旧版本；来自 skills.sh 的 Skill 覆盖后不再进入更新页。已导入的 Skills 默认不会自动启用。</p>
    </Modal>
  );
}
