import { X } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger";
  full?: boolean;
};

export function Button({ variant = "default", full, className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`button ${variant === "primary" ? "primary" : ""} ${variant === "danger" ? "danger" : ""} ${full ? "full" : ""} ${className}`}
      {...props}
    />
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "danger" | "active";
};

export function IconButton({ variant = "default", className = "", ...props }: IconButtonProps) {
  return <button className={`icon-button ${variant === "danger" ? "danger-icon" : ""} ${variant === "active" ? "active-icon" : ""} ${className}`} {...props} />;
}

export function Panel({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="search">
      <span>⌕</span>
      <input aria-label={props.placeholder} {...props} />
    </label>
  );
}

export function Toolbar({ children }: PropsWithChildren) {
  return <div className="toolbar">{children}</div>;
}

export function FilterMore({
  expanded,
  label = "更多筛选",
  onToggle,
  children
}: PropsWithChildren<{
  expanded: boolean;
  label?: string;
  onToggle: () => void;
}>) {
  return (
    <div className="filter-more">
      <Button aria-expanded={expanded} onClick={onToggle}>{label}</Button>
      {expanded && <div className="filter-popover">{children}</div>}
    </div>
  );
}

export function ActionGroup({
  children,
  align = "end",
  className = ""
}: PropsWithChildren<{
  align?: "start" | "end";
  className?: string;
}>) {
  return <span className={`action-group ${align === "start" ? "start" : "end"} ${className}`}>{children}</span>;
}

export function StatusBadge({
  children,
  tone = "accent",
  className = ""
}: PropsWithChildren<{
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "attention";
  className?: string;
}>) {
  return <i className={`status-badge ${tone} ${className}`}>{children}</i>;
}

export function DetailHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="detail-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <ActionGroup className="detail-title-actions">{actions}</ActionGroup>}
    </div>
  );
}

export function DetailActions({
  primary,
  secondary,
  danger
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  danger?: ReactNode;
}) {
  return (
    <div className="detail-actions">
      {(primary || secondary) && (
        <div className="detail-primary-actions">
          {primary}
          {secondary}
        </div>
      )}
      {danger && <div className="detail-danger-actions">{danger}</div>}
    </div>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  return (
    <span className="tags">
      {tags.map((tag) => (
        <i key={tag}>{tag}</i>
      ))}
    </span>
  );
}

export function ConfirmDeleteModal({
  title,
  description,
  children,
  confirmLabel,
  onClose,
  onConfirm
}: PropsWithChildren<{
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}>) {
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button></>}
    >
      <div className="delete-summary">{children}</div>
    </Modal>
  );
}

export function Modal({
  title,
  description,
  children,
  footer,
  onClose,
  large = false
}: PropsWithChildren<{
  title: string;
  description?: string;
  footer: ReactNode;
  onClose: () => void;
  large?: boolean;
}>) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`dialog-card ${large ? "large" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton title="关闭" onClick={onClose}><X size={16} /></IconButton>
        </header>
        <div className="dialog-body">{children}</div>
        <footer>{footer}</footer>
      </section>
    </div>
  );
}
