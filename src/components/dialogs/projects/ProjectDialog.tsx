import { useState } from "react";
import type { FormEvent } from "react";
import { FolderOpen } from "lucide-react";
import { Button, IconButton, Modal } from "../../ui";
import type { Project, ProjectLaunchConfig } from "../../../lib/types/domain";

export function ProjectDialog({
  project,
  onSelectDirectory,
  onError,
  onSubmit,
  onClose
}: {
  project?: Project;
  onSelectDirectory: () => Promise<string | null>;
  onError: (message: string) => void;
  onSubmit: (project: Project) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(project?.path ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [tags, setTags] = useState(project?.tags.join(", ") ?? "");
  const [launchConfigs, setLaunchConfigs] = useState<ProjectLaunchConfig[]>(
    project?.launchConfigs.length
      ? project.launchConfigs
      : [createLaunchConfig("默认", project?.path ?? "")]
  );
  const [note, setNote] = useState(project?.note ?? "");
  const [formError, setFormError] = useState("");
  const isEditing = Boolean(project);

  function handlePathChange(value: string) {
    setPath(value);
    if (!name.trim() || name === getProjectNameFromPath(path)) {
      setName(getProjectNameFromPath(value));
    }
    setLaunchConfigs((configs) =>
      configs.map((config) => ({
        ...config,
        workdir: !config.workdir.trim() || config.workdir === path ? value : config.workdir
      }))
    );
  }

  function updateLaunchConfig(id: string, patch: Partial<ProjectLaunchConfig>) {
    setLaunchConfigs((configs) =>
      configs.map((config) => config.id === id ? { ...config, ...patch } : config)
    );
  }

  function addLaunchConfig() {
    setLaunchConfigs((configs) => [...configs, createLaunchConfig(`启动项 ${configs.length + 1}`, path)]);
  }

  function removeLaunchConfig(id: string) {
    setLaunchConfigs((configs) => configs.length > 1 ? configs.filter((config) => config.id !== id) : configs);
  }

  async function chooseProjectPath() {
    try {
      const selectedPath = await onSelectDirectory();
      if (selectedPath) {
        handlePathChange(selectedPath);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法打开目录选择器");
    }
  }

  async function chooseLaunchWorkdir(id: string) {
    try {
      const selectedPath = await onSelectDirectory();
      if (selectedPath) {
        updateLaunchConfig(id, { workdir: selectedPath });
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法打开目录选择器");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setFormError("项目路径不能为空");
      return;
    }
    const trimmedName = name.trim() || getProjectNameFromPath(trimmedPath);
    if (!trimmedName) {
      setFormError("项目名称不能为空");
      return;
    }
    onSubmit({
      id: project?.id ?? createProjectId(trimmedName, trimmedPath),
      name: trimmedName,
      path: trimmedPath,
      note: note.trim(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      archived: project?.archived ?? false,
      launchConfigs: launchConfigs
        .map((config) => ({
          ...config,
          name: config.name.trim() || "启动项",
          command: config.command.trim(),
          workdir: config.workdir.trim() || trimmedPath
        }))
        .filter((config) => config.name || config.command || config.workdir)
    });
  }

  return (
    <Modal
      title={isEditing ? "编辑项目" : "添加项目"}
      description="记录本地项目路径和启动方式"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button form="project-form" type="submit" variant="primary">{isEditing ? "保存" : "添加项目"}</Button></>}
    >
      <form id="project-form" className="dialog-form" onSubmit={handleSubmit}>
        {formError && <p className="field-error">{formError}</p>}
        <label>项目路径
          <span className="field-with-action">
            <input value={path} onChange={(event) => handlePathChange(event.target.value)} placeholder="E:\\Development\\NewProject" autoFocus />
            <IconButton type="button" title="选择项目目录" onClick={() => void chooseProjectPath()}><FolderOpen size={15} /></IconButton>
          </span>
        </label>
        <label>项目名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="默认使用路径最后一级目录名" /></label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如 Tauri, 本地工具" /></label>
        <label>备注<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <section className="dialog-launch-configs">
          <div className="dialog-section-title">
            <h3>启动配置</h3>
            <Button type="button" onClick={addLaunchConfig}>添加启动项</Button>
          </div>
          {launchConfigs.map((config, index) => (
            <div className="launch-config-editor" key={config.id}>
              <label>名称<input value={config.name} onChange={(event) => updateLaunchConfig(config.id, { name: event.target.value })} placeholder={index === 0 ? "Frontend" : "Backend"} /></label>
              <label>工作目录
                <span className="field-with-action">
                  <input value={config.workdir} onChange={(event) => updateLaunchConfig(config.id, { workdir: event.target.value })} placeholder="默认使用项目路径" />
                  <IconButton type="button" title="选择工作目录" onClick={() => void chooseLaunchWorkdir(config.id)}><FolderOpen size={15} /></IconButton>
                </span>
              </label>
              <label className="full">启动命令<input value={config.command} onChange={(event) => updateLaunchConfig(config.id, { command: event.target.value })} placeholder="例如 pnpm dev" /></label>
              <div className="launch-config-actions">
                <label><input type="checkbox" checked={config.enabled} onChange={(event) => updateLaunchConfig(config.id, { enabled: event.target.checked })} />启用</label>
                <Button type="button" onClick={() => removeLaunchConfig(config.id)} disabled={launchConfigs.length === 1}>删除</Button>
              </div>
            </div>
          ))}
        </section>
      </form>
    </Modal>
  );
}

function getProjectNameFromPath(path: string) {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || "";
}

function createProjectId(name: string, path: string) {
  const base = (name || getProjectNameFromPath(path) || "project").toLowerCase();
  return `${base.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "")}-${Date.now().toString(36)}`;
}

function createLaunchConfig(name: string, workdir: string): ProjectLaunchConfig {
  const id = `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "") || "launch"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name,
    command: "",
    workdir,
    enabled: true
  };
}
