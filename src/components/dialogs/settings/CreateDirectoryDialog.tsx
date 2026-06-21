import { Button, Modal } from "../../ui";

export function CreateDirectoryDialog({
  path,
  onClose,
  onConfirm
}: {
  path: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="创建目录"
      description="目标目录当前不存在。"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={onConfirm}>创建并打开</Button></>}
    >
      <div className="notice">是否创建对应的 Skills 目录？</div>
      <div className="file-block"><span>目录路径</span><code>{path}</code></div>
    </Modal>
  );
}
