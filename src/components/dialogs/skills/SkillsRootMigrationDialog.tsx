import { RefreshCcw } from "lucide-react";
import { Button, Modal } from "../../ui";
import type { ManagedTargetRebuildResult, ManagedTargetRebuildSelection, SkillsRootMigrationState } from "../../../lib/types/domain";
import { candidateStatusImportClass, externalCandidateStatusLabel, managedTargetStatusImportClass, managedTargetStatusLabel } from "./skillsImportFormatters";

export function SkillsRootMigrationDialog({
  state,
  rebuildResults,
  onMigrate,
  onRebuild,
  onRefresh,
  onClose
}: {
  state: SkillsRootMigrationState;
  rebuildResults: ManagedTargetRebuildResult[];
  onMigrate: (directoryNames: string[]) => void;
  onRebuild: (selections: ManagedTargetRebuildSelection[]) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const migrateTargets = state.candidates
    .filter((candidate) => candidate.status === "new")
    .map((candidate) => candidate.directoryName);
  const rebuildTargets = state.managedTargets
    .filter((target) => target.status === "ready")
    .map((target) => ({
      directoryName: target.directoryName,
      tool: target.tool,
      scope: target.scope,
      projectPath: target.projectPath
    }));
  return (
    <Modal
      title="根目录迁移"
      description="从上一个统一根目录迁移 Skills，并重建 Workbench 受管启用目标"
      onClose={onClose}
      large
      footer={
        <>
          <Button onClick={onRefresh}><RefreshCcw size={15} />重新检查</Button>
          <Button onClick={onClose}>关闭</Button>
          <Button disabled={migrateTargets.length === 0} onClick={() => onMigrate(migrateTargets)}>迁移可迁移项</Button>
          <Button variant="primary" disabled={rebuildTargets.length === 0} onClick={() => onRebuild(rebuildTargets)}>重建受管目标</Button>
        </>
      }
    >
      <div className="warning">迁移和重建都需要用户显式执行；旧根目录不会被删除，未受管的工具目录内容不会被覆盖。</div>
      <div className="file-block"><span>上一个根目录</span><code>{state.previousSkillsRoot || "无"}</code></div>
      <div className="file-block"><span>当前根目录</span><code>{state.currentSkillsRoot}</code></div>
      <div className="import-summary">
        <strong>可迁移 {migrateTargets.length} 个 · 可重建 {rebuildTargets.length} 个</strong>
        <span>同名冲突和已修改目标会保留原状。</span>
      </div>
      <div className="import-list">
        {state.candidates.map((candidate) => (
          <div className={`import-result ${candidateStatusImportClass(candidate.status)}`} key={`migration-${candidate.directoryName}`}>
            <span><strong>{candidate.displayName}</strong><small>{candidate.directoryName} · {candidate.message}</small><small>{candidate.sourcePath}</small></span>
            <i>{externalCandidateStatusLabel(candidate.status)}</i>
          </div>
        ))}
        {state.managedTargets.map((target) => (
          <div className={`import-result ${managedTargetStatusImportClass(target.status)}`} key={`target-${target.directoryName}-${target.tool}-${target.scope}-${target.projectPath}`}>
            <span><strong>{target.directoryName}</strong><small>{target.tool} · {target.scope} · {target.message}</small><small>{target.linkPath}</small></span>
            <i>{managedTargetStatusLabel(target.status)}</i>
          </div>
        ))}
        {rebuildResults.map((result) => (
          <div className={`import-result ${managedTargetStatusImportClass(result.status)}`} key={`result-${result.directoryName}-${result.tool}-${result.scope}-${result.projectPath}`}>
            <span><strong>{result.directoryName}</strong><small>{result.tool} · {result.message}</small></span>
            <i>{managedTargetStatusLabel(result.status)}</i>
          </div>
        ))}
      </div>
    </Modal>
  );
}
