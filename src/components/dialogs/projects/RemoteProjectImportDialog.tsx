import { useState } from "react";
import type { FormEvent } from "react";
import { FolderOpen } from "lucide-react";
import { Button, IconButton, Modal, StatusBadge } from "../../ui";
import type {
  ProjectImportProgress,
  RemoteProjectImportInspection,
  RemoteProjectImportRequest
} from "../../../lib/types/domain";

export function RemoteProjectImportDialog({
  onSelectDirectory,
  onInspect,
  onSelectExisting,
  onSubmit,
  onError,
  onClose
}: {
  onSelectDirectory: () => Promise<string | null>;
  onInspect: (request: RemoteProjectImportRequest) => Promise<RemoteProjectImportInspection>;
  onSelectExisting: (projectId: string) => void;
  onSubmit: (request: RemoteProjectImportRequest, onProgress: (progress: ProjectImportProgress) => void) => Promise<void>;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [parentDirectory, setParentDirectory] = useState("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<ProjectImportProgress | null>(null);
  const [progressStatus, setProgressStatus] = useState<"running" | "failed" | "succeeded">("running");
  const [inspection, setInspection] = useState<RemoteProjectImportInspection | null>(null);
  const [autoName, setAutoName] = useState("");

  function clearTransientState() {
    setFormError("");
    setInspection(null);
    setProgress(null);
    setProgressStatus("running");
  }

  function updateRepoUrl(value: string) {
    clearTransientState();
    setRepoUrl(value);
    const nextName = getProjectNameFromRemote(value);
    if (!name.trim() || name === autoName) {
      setName(nextName);
    }
    setAutoName(nextName);
  }

  async function chooseParentDirectory() {
    try {
      const selectedPath = await onSelectDirectory();
      if (selectedPath) {
        clearTransientState();
        setParentDirectory(selectedPath);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法打开目录选择器");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = createRequest();
    if (!request) return;
    setFormError("");
    setInspection(null);
    setSubmitting(true);
    setProgressStatus("running");
    setProgress({ importId: request.importId, progress: 8, message: "正在检查目标状态" });
    try {
      const result = await onInspect(request);
      if (result.status !== "ready") {
        setInspection(result);
        setProgress(null);
        return;
      }
      await performImport(request);
    } catch (error) {
      showImportFailure(request.importId, error);
    } finally {
      setSubmitting(false);
    }
  }

  function createRequest(overrides?: Partial<Pick<RemoteProjectImportRequest, "projectId" | "replaceProjectId">>) {
    const trimmedRepoUrl = repoUrl.trim();
    const trimmedParentDirectory = parentDirectory.trim();
    if (!trimmedRepoUrl) {
      setFormError("仓库地址不能为空");
      return null;
    }
    if (!trimmedParentDirectory) {
      setFormError("本地父目录不能为空");
      return null;
    }
    const projectName = name.trim() || getProjectNameFromRemote(trimmedRepoUrl);
    if (!projectName) {
      setFormError("项目名称不能为空");
      return null;
    }
    return {
      importId: `project-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: overrides?.projectId ?? createProjectId(projectName, trimmedRepoUrl),
      replaceProjectId: overrides?.replaceProjectId ?? null,
      repoUrl: trimmedRepoUrl,
      parentDirectory: trimmedParentDirectory,
      name: projectName,
      note: note.trim(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    } satisfies RemoteProjectImportRequest;
  }

  async function performImport(request: RemoteProjectImportRequest) {
    setProgress({ importId: request.importId, progress: 4, message: "准备导入" });
    setProgressStatus("running");
    await onSubmit(request, (nextProgress) => {
      setProgress(nextProgress);
      if (nextProgress.progress >= 100) setProgressStatus("succeeded");
    });
  }

  function showImportFailure(importId: string, error: unknown) {
    setProgressStatus("failed");
    setProgress((current) => ({
      importId,
      progress: current?.progress ?? 0,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  async function reimportMissingProject() {
    const existingProject = inspection?.existingProject;
    if (!existingProject) return;
    const request = createRequest({
      projectId: existingProject.id,
      replaceProjectId: existingProject.id
    });
    if (!request) return;
    setInspection(null);
    setSubmitting(true);
    try {
      await performImport(request);
    } catch (error) {
      showImportFailure(request.importId, error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="GitHub/Gitee 导入"
      description="从远程仓库克隆到本地父目录，并加入项目列表"
      onClose={submitting ? () => undefined : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>取消</Button>
          {inspection?.status === "managed_existing" && inspection.existingProject ? (
            <Button variant="primary" onClick={() => onSelectExisting(inspection.existingProject!.id)}>查看已有项目</Button>
          ) : inspection?.status === "managed_missing" ? (
            <Button variant="primary" onClick={() => void reimportMissingProject()} disabled={submitting}>重新导入</Button>
          ) : inspection?.status === "unmanaged_existing" ? (
            <Button variant="primary" onClick={() => void chooseParentDirectory()} disabled={submitting}>选择其他父目录</Button>
          ) : (
            <Button form="remote-project-import-form" type="submit" variant="primary" disabled={submitting}>
              {submitting ? "导入中" : progressStatus === "failed" ? "重新尝试" : "开始导入"}
            </Button>
          )}
        </>
      }
    >
      <form id="remote-project-import-form" className="dialog-form" onSubmit={handleSubmit}>
        {formError && <p className="field-error">{formError}</p>}
        <label>仓库地址
          <input
            value={repoUrl}
            onChange={(event) => updateRepoUrl(event.target.value)}
            placeholder="https://github.com/owner/repo.git"
            disabled={submitting}
            autoFocus
          />
        </label>
        <label>本地父目录
          <span className="field-with-action">
            <input
              value={parentDirectory}
              onChange={(event) => {
                clearTransientState();
                setParentDirectory(event.target.value);
              }}
              placeholder="E:\\Development"
              disabled={submitting}
            />
            <IconButton type="button" title="选择本地父目录" onClick={() => void chooseParentDirectory()} disabled={submitting}>
              <FolderOpen size={15} />
            </IconButton>
          </span>
        </label>
        <label>项目名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="默认使用仓库名" disabled={submitting} /></label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如 Tauri, 本地工具" disabled={submitting} /></label>
        <label className="full">备注<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} disabled={submitting} /></label>
        <div className="boundary-note">
          <span className="status-dot" />
          <p>Workbench 使用本机 git clone；不会安装 Git、配置凭据、覆盖已有目录或自动推断启动命令。</p>
        </div>
        {inspection && <RemoteImportConflict inspection={inspection} />}
        {progress && (
          <div className="remote-import-progress" aria-label="项目导入进度">
            <div className="remote-import-progress-meta">
              <StatusBadge tone={progressStatus === "failed" ? "danger" : progressStatus === "succeeded" ? "success" : "accent"}>
                {progressStatus === "failed" ? "失败" : `${progress.progress}%`}
              </StatusBadge>
              <small>{progress.message}</small>
            </div>
            <div
              className="remote-import-progress-track"
              role="progressbar"
              aria-label="项目导入进度条"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.progress}
            >
              <i
                className="remote-import-progress-fill"
                style={{ width: `${Math.max(4, Math.min(100, progress.progress))}%` }}
              />
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function RemoteImportConflict({ inspection }: { inspection: RemoteProjectImportInspection }) {
  const content = inspection.status === "managed_existing"
    ? {
        title: "项目已经存在",
        message: "Workbench 项目记录和本地目录都存在，无需重复克隆。"
      }
      : inspection.status === "managed_missing"
      ? {
          title: "项目目录已丢失",
          message: "Workbench 中保留了项目记录，但本地目录不存在。确认后可重新克隆并保留原项目配置。"
        }
      : {
          title: "目标目录已存在",
          message: "该目录未被 Workbench 管理。为避免覆盖本地文件，请选择其他父目录。"
        };
  return (
    <div className="remote-import-conflict" role="alert">
      <strong>{content.title}</strong>
      <small>{content.message}</small>
      <code>{inspection.targetPath}</code>
    </div>
  );
}

function getProjectNameFromRemote(repoUrl: string) {
  const trimmed = repoUrl.trim().replace(/[\\/#]+$/, "");
  if (!trimmed) return "";
  const lastSegment = trimmed.startsWith("git@")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1)
    : trimmed.split("/").pop() ?? "";
  return lastSegment.replace(/\.git$/i, "");
}

function createProjectId(name: string, repoUrl: string) {
  const base = (name || getProjectNameFromRemote(repoUrl) || "project").toLowerCase();
  return `${base.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "")}-${Date.now().toString(36)}`;
}
