import { useState } from "react";
import type { FormEvent } from "react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { ActionGroup, Button, IconButton, Modal } from "../../ui";
import type { SkillCategory } from "../../../lib/types/domain";

export function SkillCategoryDialog({
  categories,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onMerge
}: {
  categories: SkillCategory[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (categoryId: string, name: string) => void;
  onDelete: (categoryId: string, replacementCategoryId: string) => void;
  onMerge: (sourceCategoryId: string, targetCategoryId: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [actionCategoryId, setActionCategoryId] = useState("");
  const [actionKind, setActionKind] = useState<"delete" | "merge" | "">("");
  const [targetCategoryId, setTargetCategoryId] = useState("uncategorized");
  const targetOptions = categories.filter((category) => category.id !== actionCategoryId);

  function submitNew(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  }

  function startRename(category: SkillCategory) {
    setEditingId(category.id);
    setEditingName(category.name);
    setActionKind("");
    setActionCategoryId("");
  }

  function saveRename(category: SkillCategory) {
    const name = editingName.trim();
    setEditingId("");
    if (name && name !== category.name) onRename(category.id, name);
  }

  function startAction(category: SkillCategory, kind: "delete" | "merge") {
    setActionCategoryId(category.id);
    setActionKind(kind);
    setEditingId("");
    setTargetCategoryId(categories.find((item) => item.id !== category.id)?.id ?? "uncategorized");
  }

  function confirmAction() {
    if (!actionCategoryId || !targetCategoryId) return;
    if (actionKind === "delete") onDelete(actionCategoryId, targetCategoryId);
    if (actionKind === "merge") onMerge(actionCategoryId, targetCategoryId);
    setActionKind("");
    setActionCategoryId("");
  }

  const actionCategory = categories.find((category) => category.id === actionCategoryId);

  return (
    <Modal
      title="管理分类"
      description="分类只用于 Workbench 内整理，删除或合并分类不会删除 Skills。"
      large
      onClose={onClose}
      footer={<><Button onClick={onClose}>关闭</Button></>}
    >
      <form className="category-create-row" onSubmit={submitNew}>
        <input aria-label="新分类名称" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="新分类名称" />
        <Button variant="primary" type="submit"><Plus size={14} />新增分类</Button>
      </form>
      {actionCategory && actionKind && (
        <div className="category-action-panel">
          <span>
            <strong>{actionKind === "delete" ? "删除分类" : "合并分类"}：{actionCategory.name}</strong>
            <small>{actionKind === "delete" ? "删除前会把该分类下的 Skills 移动到目标分类。" : "合并后源分类会删除，Skills 移动到目标分类。"}</small>
          </span>
          <select aria-label="目标分类" value={targetCategoryId} onChange={(event) => setTargetCategoryId(event.target.value)}>
            {targetOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <Button variant={actionKind === "delete" ? "danger" : "primary"} onClick={confirmAction}>
            {actionKind === "delete" ? "确认删除" : "确认合并"}
          </Button>
        </div>
      )}
      <div className="category-manager-table">
        <div className="category-manager-head">
          <span>分类</span>
          <span>Skills</span>
          <span>操作</span>
        </div>
        {categories.map((category) => {
          const isSystem = category.id === "uncategorized";
          return (
            <div className="category-manager-row" key={category.id}>
              <span className="category-name-cell">
                {editingId === category.id ? (
                  <input
                    aria-label={`${category.name} 新名称`}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={() => saveRename(category)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveRename(category);
                      if (event.key === "Escape") setEditingId("");
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="category-title-line">
                    <strong>{category.name}</strong>
                    {isSystem && <em>系统</em>}
                  </span>
                )}
              </span>
              <span className="category-count-badge">{category.skillCount} 个</span>
              <ActionGroup className="row-actions">
                <IconButton title={`重命名 ${category.name}`} disabled={isSystem} onClick={() => startRename(category)}>
                  <Edit3 size={14} />
                </IconButton>
                <Button disabled={isSystem} onClick={() => startAction(category, "merge")}>合并</Button>
                <IconButton variant="danger" title={`删除 ${category.name}`} disabled={isSystem} onClick={() => startAction(category, "delete")}>
                  <Trash2 size={14} />
                </IconButton>
              </ActionGroup>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
