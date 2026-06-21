import { RefreshCcw } from "lucide-react";
import { Button, Modal } from "../../ui";
import type { ExternalSkillCandidateGroup, ExternalSkillImportSelection } from "../../../lib/types/domain";
import { candidateStatusImportClass, externalCandidateStatusLabel } from "./skillsImportFormatters";

export function ExternalSkillsDialog({
  candidates,
  skillsRoot,
  onRefresh,
  onImport,
  onClose
}: {
  candidates: ExternalSkillCandidateGroup[];
  skillsRoot: string;
  onRefresh: () => void;
  onImport: (selections: ExternalSkillImportSelection[]) => void;
  onClose: () => void;
}) {
  const importable = candidates.filter((candidate) => candidate.status === "new");
  const selections = importable.map((candidate) => ({
    directoryName: candidate.directoryName,
    sourcePath: candidate.sources[0]?.path ?? ""
  })).filter((selection) => selection.sourcePath);
  return (
    <Modal
      title="发现已有工具 Skills"
      description="从已注册工具的全局目录中只读发现可导入的 Skills"
      onClose={onClose}
      large
      footer={
        <>
          <Button onClick={onRefresh}><RefreshCcw size={15} />重新发现</Button>
          <Button onClick={onClose}>关闭</Button>
          <Button variant="primary" disabled={selections.length === 0} onClick={() => onImport(selections)}>
            导入可导入项
          </Button>
        </>
      }
    >
      <div className="warning">发现过程不会创建目录、复制文件或启用 Skill；导入后默认只进入统一根目录。</div>
      <div className="file-block"><span>当前统一根目录</span><code>{skillsRoot}</code></div>
      {candidates.length === 0 ? (
        <div className="notice compact-empty">未发现可导入的工具目录 Skills。</div>
      ) : (
        <div className="import-list">
          {candidates.map((candidate) => (
            <div className={`import-result ${candidateStatusImportClass(candidate.status)}`} key={candidate.directoryName}>
              <span>
                <strong>{candidate.displayName}</strong>
                <small>{candidate.directoryName} · {externalCandidateStatusLabel(candidate.status)}</small>
                {candidate.sources.map((source) => (
                  <small key={`${candidate.directoryName}-${source.tool}-${source.path}`}>{source.toolName}: {source.path}</small>
                ))}
              </span>
              <i>{externalCandidateStatusLabel(candidate.status)}</i>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
