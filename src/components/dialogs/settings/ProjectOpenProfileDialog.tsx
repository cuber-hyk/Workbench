import { useState } from "react";
import type { FormEvent } from "react";
import { FolderOpen } from "lucide-react";
import { Button, IconButton, Modal } from "../../ui";
import type { ProjectOpenProfile } from "../../../lib/types/domain";

export function ProjectOpenProfileDialog({
  profile,
  nextSortOrder,
  onSelectExecutable,
  onError,
  onSubmit,
  onClose
}: {
  profile?: ProjectOpenProfile;
  nextSortOrder: number;
  onSelectExecutable: () => Promise<string | null>;
  onError: (message: string) => void;
  onSubmit: (profile: ProjectOpenProfile) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [kind, setKind] = useState<ProjectOpenProfile["kind"]>(profile?.kind ?? "app");
  const [command, setCommand] = useState(profile?.command ?? "");
  const [executablePath, setExecutablePath] = useState(profile?.executablePath ?? "");
  const [argsText, setArgsText] = useState((profile?.args ?? ["{projectPath}"]).join("\n"));
  const [workdir, setWorkdir] = useState(profile?.workdir ?? "{projectPath}");
  const [enabled, setEnabled] = useState(profile?.enabled ?? true);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCommand = command.trim();
    const trimmedExecutablePath = executablePath.trim();
    if (!trimmedName) {
      onError("打开方式名称不能为空");
      return;
    }
    if (!trimmedCommand && !trimmedExecutablePath) {
      onError("打开方式未配置命令或可执行文件路径。");
      return;
    }
    onSubmit({
      id: profile?.id ?? createProjectOpenProfileId(trimmedName),
      name: trimmedName,
      kind,
      command: trimmedCommand,
      executablePath: trimmedExecutablePath,
      args: argsText.split(/\r?\n/).map((arg) => arg.trim()).filter(Boolean),
      workdir: workdir.trim() || "{projectPath}",
      enabled,
      sortOrder: profile?.sortOrder ?? nextSortOrder
    });
  }

  return (
    <Modal
      title={profile ? "编辑打开方式" : "添加打开方式"}
      description="命令会优先从 PATH 启动；如果工具没有加入 PATH，可以选择 exe 文件作为兜底。"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" type="submit" form="project-open-profile-form">保存</Button></>}
    >
      <form id="project-open-profile-form" className="dialog-form" onSubmit={submit}>
        <label>名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Trae" /></label>
        <label>类型<select value={kind} onChange={(event) => setKind(event.target.value as ProjectOpenProfile["kind"])}><option value="app">应用</option><option value="terminal">终端命令</option></select></label>
        <label>命令<input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={kind === "terminal" ? "claude" : "trae"} /></label>
        <label className="full">可执行文件路径<span className="field-with-action"><input value={executablePath} onChange={(event) => setExecutablePath(event.target.value)} placeholder="可选：选择 trae.exe / Code.exe" /><IconButton title="选择程序" type="button" onClick={async () => {
          try {
            const path = await onSelectExecutable();
            if (path) setExecutablePath(path);
          } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
          }
        }}><FolderOpen size={15} /></IconButton></span></label>
        <label className="full">参数<textarea rows={3} value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder={"每行一个参数，例如：\n-c\n--skip-agreement"} /></label>
        <label>工作目录<input value={workdir} onChange={(event) => setWorkdir(event.target.value)} placeholder="留空默认使用项目目录；可填写 {projectPath}\\subdir" /></label>
        <label className="checkbox-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />启用此打开方式</label>
        <div className="notice full">命令会在“工作目录”中启动。<code>{"{projectPath}"}</code> 表示当前项目路径；只有工具要求项目路径作为参数时，才在参数中填写它。</div>
      </form>
    </Modal>
  );
}

function createProjectOpenProfileId(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `open-${slug || Date.now()}`;
}
