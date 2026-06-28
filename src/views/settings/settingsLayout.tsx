import type { ReactNode } from "react";

export function SettingsContentHeader({
  title,
  description,
  actions
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="settings-content-header">
      <span>
        <h2>{title}</h2>
        <p>{description}</p>
      </span>
      {actions}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className={`settings-section-title ${description ? "has-description" : ""}`}>
        <span>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </span>
      </div>
      {children}
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  status,
  children
}: {
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <span className="settings-row-status">{status}</span>
      <span className="settings-row-actions">{children}</span>
    </div>
  );
}
