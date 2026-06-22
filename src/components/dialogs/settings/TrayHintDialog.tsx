import { MonitorUp } from "lucide-react";
import { Button, Modal } from "../../ui";

export function TrayHintDialog({
  onClose,
  onConfirm
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Workbench 将继续运行"
      description="关闭窗口后会隐藏到系统托盘。"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={onConfirm}>知道了</Button>
        </>
      }
    >
      <div className="tray-hint-card">
        <span className="tray-hint-icon"><MonitorUp size={18} /></span>
        <span>
          <strong>可从系统托盘恢复</strong>
          <small>右键托盘图标可重新显示 Workbench，或选择退出应用。这个提示只显示一次。</small>
        </span>
      </div>
    </Modal>
  );
}
