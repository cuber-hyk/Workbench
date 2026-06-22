import { useState } from "react";
import type { FormEvent } from "react";
import { FolderOpen } from "lucide-react";
import { Button, IconButton, Modal } from "../../ui";
import { ToolIcon } from "../../../lib/ui/toolIcons";
import type { CustomToolTargetInput, ToolTarget } from "../../../lib/types/domain";

export function CustomToolDialog({
  tool,
  existingTools,
  onSelectDirectory,
  onSelectIcon,
  onError,
  onSubmit,
  onClose
}: {
  tool?: ToolTarget;
  existingTools: ToolTarget[];
  onSelectDirectory: () => Promise<string | null>;
  onSelectIcon: () => Promise<string | null>;
  onError: (message: string) => void;
  onSubmit: (input: CustomToolTargetInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(tool?.name ?? "");
  const [globalSkillsDir, setGlobalSkillsDir] = useState(tool?.globalSkillsDir ?? "");
  const [iconSourcePath, setIconSourcePath] = useState("");
  const [formError, setFormError] = useState("");
  const iconPreview = iconSourcePath || tool?.iconPath || "";

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDir = globalSkillsDir.trim();
    if (!trimmedName) {
      setFormError("工具名称不能为空");
      return;
    }
    const duplicateName = existingTools.some((item) => item.key !== tool?.key && item.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (duplicateName) {
      setFormError("工具名称已存在");
      return;
    }
    if (!trimmedDir) {
      setFormError("全局 Skills 目录不能为空");
      return;
    }
    if (!isLikelyAbsolutePath(trimmedDir)) {
      setFormError("全局 Skills 目录必须是绝对路径");
      return;
    }
    setFormError("");
    onSubmit({
      key: tool?.key ?? null,
      name: trimmedName,
      globalSkillsDir: trimmedDir,
      iconSourcePath: iconSourcePath || null,
      iconPath: tool?.iconPath ?? null
    });
  }

  return (
    <Modal
      title={tool ? "编辑自定义工具" : "添加自定义工具"}
      description="为暂未内置支持的终端型 Coding Agent 配置全局 Skills 目录。"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" type="submit" form="custom-tool-form">保存</Button></>}
    >
      <form id="custom-tool-form" className="dialog-form" onSubmit={submit}>
        {formError && <p className="field-error full">{formError}</p>}
        <label>工具名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="My Agent" /></label>
        <label className="full">全局 Skills 目录<span className="field-with-action"><input value={globalSkillsDir} onChange={(event) => setGlobalSkillsDir(event.target.value)} placeholder={"C:\\Users\\name\\.my-agent\\skills"} /><IconButton title="选择目录" type="button" onClick={async () => {
          try {
            const path = await onSelectDirectory();
            if (path) setGlobalSkillsDir(path);
          } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
          }
        }}><FolderOpen size={15} /></IconButton></span></label>
        <label className="full">工具图标<span className="field-with-action"><input value={iconPreview} readOnly placeholder="可选：png / jpg / webp / ico / svg" /><IconButton title="选择图标" type="button" onClick={async () => {
          try {
            const path = await onSelectIcon();
            if (path) setIconSourcePath(path);
          } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
          }
        }}><FolderOpen size={15} /></IconButton></span></label>
        {iconPreview && <div className="tool-icon-preview full"><span><ToolIcon tool={{ key: tool?.key ?? (name || "CT"), name, globalSkillsDir, supportsProjectScope: false, available: false, source: "custom", iconPath: iconPreview }} /></span><code>{iconPreview}</code></div>}
        <div className="notice full">自定义工具仅支持全局启用。删除自定义工具只移除 Workbench 配置和启用记录，不会删除外部工具目录。</div>
      </form>
    </Modal>
  );
}

function isLikelyAbsolutePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\");
}
