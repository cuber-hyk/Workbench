import { X } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary";
  full?: boolean;
};

export function Button({ variant = "default", full, className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`button ${variant === "primary" ? "primary" : ""} ${full ? "full" : ""} ${className}`}
      {...props}
    />
  );
}

export function IconButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`icon-button ${className}`} {...props} />;
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

export function TagList({ tags }: { tags: string[] }) {
  return (
    <span className="tags">
      {tags.map((tag) => (
        <i key={tag}>{tag}</i>
      ))}
    </span>
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
