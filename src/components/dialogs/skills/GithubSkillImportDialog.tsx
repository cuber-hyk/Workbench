import { useMemo, useState } from "react";
import { AlertTriangle, Github, RefreshCcw } from "lucide-react";
import { Button, Modal } from "../../ui";
import { workbenchApi } from "../../../lib/api/workbenchApi";
import type { GithubSkillImportCandidate, GithubSkillImportInspection, ImportResult } from "../../../lib/types/domain";

export function GithubSkillImportDialog({
  onClose,
  onImported
}: {
  onClose: () => void;
  onImported: (results: ImportResult[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [inspection, setInspection] = useState<GithubSkillImportInspection | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [overwritePaths, setOverwritePaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const candidates = inspection?.candidates ?? [];
  const activeCandidate = candidates.find((candidate) => candidate.skillPath === activePath) ?? candidates[0];
  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selectedPaths.includes(candidate.skillPath)),
    [candidates, selectedPaths]
  );
  const canImport = selectedCandidates.length > 0 && !isImporting;
  const footerNote = inspection
    ? "只导入包含 SKILL.md 的目录；导入后默认不启用。"
    : "先扫描 public GitHub 仓库，再选择要导入的 Skill。";

  async function inspect() {
    const normalized = url.trim();
    if (!normalized) {
      setError("请输入 GitHub 链接");
      return;
    }
    setIsScanning(true);
    setError("");
    setInspection(null);
    setSelectedPaths([]);
    setOverwritePaths([]);
    setActivePath("");
    try {
      const next = await workbenchApi.inspectGithubSkillImport(normalized);
      setInspection(next);
      const importable = next.candidates
        .filter((candidate) => candidate.status === "new")
        .map((candidate) => candidate.skillPath);
      setSelectedPaths(importable);
      setActivePath(next.candidates[0]?.skillPath ?? "");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setIsScanning(false);
    }
  }

  async function importSelected() {
    if (!inspection || selectedCandidates.length === 0) return;
    setIsImporting(true);
    setError("");
    try {
      const results = await workbenchApi.importGithubSkills(url.trim(), selectedCandidates.map((candidate) => ({
        skillPath: candidate.skillPath,
        overwrite: overwritePaths.includes(candidate.skillPath)
      })));
      onImported(results);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setIsImporting(false);
    }
  }

  function toggleSelected(candidate: GithubSkillImportCandidate, checked: boolean) {
    setSelectedPaths((current) =>
      checked
        ? Array.from(new Set([...current, candidate.skillPath]))
        : current.filter((path) => path !== candidate.skillPath)
    );
    if (!checked) {
      setOverwritePaths((current) => current.filter((path) => path !== candidate.skillPath));
    }
  }

  function toggleOverwrite(candidate: GithubSkillImportCandidate, checked: boolean) {
    setOverwritePaths((current) =>
      checked
        ? Array.from(new Set([...current, candidate.skillPath]))
        : current.filter((path) => path !== candidate.skillPath)
    );
    if (checked) {
      setSelectedPaths((current) => Array.from(new Set([...current, candidate.skillPath])));
    }
  }

  return (
    <Modal
      title="从 GitHub 导入 Skills"
      description="扫描 public GitHub 仓库中的标准 SKILL.md 目录"
      onClose={onClose}
      large
      className="github-skill-import-dialog"
      footer={
        <>
          <span className="dialog-footer-note">{footerNote}</span>
          <span className="import-footer-actions">
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={!canImport} onClick={() => void importSelected()}>
              {isImporting ? "导入中..." : `导入选中项${selectedCandidates.length ? ` ${selectedCandidates.length}` : ""}`}
            </Button>
          </span>
        </>
      }
    >
      <div className="github-import-body">
        <div className="dialog-form github-import-form">
          <label>
            GitHub 链接
            <span className="github-import-input-row">
              <input
                value={url}
                placeholder="https://github.com/owner/repo 或 tree/blob 链接"
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void inspect();
                }}
              />
              <Button disabled={isScanning || isImporting} onClick={() => void inspect()}>
                <RefreshCcw className={isScanning ? "spin" : ""} size={15} />{isScanning ? "扫描中" : "扫描"}
              </Button>
            </span>
          </label>
        </div>
        {error && <div className="github-import-alert" role="alert"><AlertTriangle size={15} />{error}</div>}
        {inspection && (
          <div className="github-import-meta">
            <span><strong>{inspection.owner}/{inspection.repo}</strong><small>{inspection.refName}{inspection.fixedRef ? " · 固定版本" : " · 可检查更新"}</small></span>
            <span><strong>{inspection.candidates.length}</strong><small>{inspection.message}</small></span>
          </div>
        )}
        {inspection && candidates.length === 0 && (
          <div className="empty-state">
            <strong>没有发现标准 Skill</strong>
            <small>当前扫描范围内没有包含 SKILL.md 的目录。</small>
          </div>
        )}
        {candidates.length > 0 && (
          <div className={`github-import-layout ${candidates.length === 1 ? "single" : ""}`}>
            <div className="github-candidate-list">
              {candidates.map((candidate) => {
                const selected = selectedPaths.includes(candidate.skillPath);
                const conflict = candidate.status === "conflict";
                const invalid = candidate.status === "invalid" || candidate.status === "unreadable";
                const pathLabel = candidate.skillPath || "仓库根目录";
                return (
                  <label
                    className={`github-candidate-row ${activeCandidate?.skillPath === candidate.skillPath ? "selected" : ""} ${invalid ? "disabled" : ""}`}
                    key={candidate.skillPath}
                    onClick={() => setActivePath(candidate.skillPath)}
                  >
                    <input
                      type="checkbox"
                      disabled={invalid || isImporting}
                      checked={selected}
                      onChange={(event) => toggleSelected(candidate, event.currentTarget.checked)}
                    />
                    <span>
                      <strong>{candidate.displayName}</strong>
                      <small>{pathLabel}</small>
                      <small>{candidate.message}{candidate.hasScripts ? " · 包含脚本文件" : ""}</small>
                    </span>
                    {conflict && (
                      <span className="github-overwrite-control">
                        <input
                          type="checkbox"
                          checked={overwritePaths.includes(candidate.skillPath)}
                          disabled={isImporting}
                          onChange={(event) => toggleOverwrite(candidate, event.currentTarget.checked)}
                        />
                        <small>覆盖</small>
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="github-preview-panel">
              {activeCandidate && (
                <>
                  <div className="github-preview-head">
                    <span>
                      <strong>{activeCandidate.displayName}</strong>
                      <small>{activeCandidate.skillPath || "仓库根目录"}</small>
                    </span>
                    <Github size={18} />
                  </div>
                  <div className="github-preview-stats">
                    <span>Skill 内容</span>
                    <strong>{activeCandidate.fileCount} 个文件 · {formatBytes(activeCandidate.totalSize)}</strong>
                    <small>递归统计，不含 .git 元数据。</small>
                  </div>
                  <p>{activeCandidate.description || "暂无描述。"}</p>
                  <strong className="github-preview-label">SKILL.md 预览</strong>
                  <pre>{activeCandidate.markdownPreview}</pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
