import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen, GitBranch, Plus } from "lucide-react";
import { Button } from "../../components/ui";

export function ProjectAddMenu({
  onAddLocal,
  onAddRemote
}: {
  onAddLocal: () => void;
  onAddRemote: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="import-control" ref={menuRef}>
      <Button
        variant="primary"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Plus size={15} />添加项目<ChevronDown size={14} />
      </Button>
      {open && (
        <div className="import-menu" role="menu" aria-label="添加项目方式">
          <button type="button" role="menuitem" onClick={() => run(onAddLocal)}>
            <FolderOpen size={14} />本地导入
          </button>
          <button type="button" role="menuitem" onClick={() => run(onAddRemote)}>
            <GitBranch size={14} />GitHub/Gitee 导入
          </button>
        </div>
      )}
    </div>
  );
}
