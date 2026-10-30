import type { ReactNode, Ref } from "react";
import { Icon } from "./Icon";
import "./header.css";

export type HeaderBadge = { kind: "sample" } | { kind: "file"; fileName: string };

interface AppHeaderProps {
  badge?: HeaderBadge;
  /** Extra actions shown before the settings button. */
  actions?: ReactNode;
  onOpenSettings?: () => void;
  settingsRef?: Ref<HTMLButtonElement>;
}

export function AppHeader({ badge, actions, onOpenSettings, settingsRef }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <div className="app-header__logo">
          <Icon name="clock" />
        </div>
        <div className="app-header__name">YouTube Watch Stats</div>
        {badge?.kind === "sample" && (
          <span className="app-header__badge">
            <span className="app-header__dot" />
            Sample data
          </span>
        )}
        {badge?.kind === "file" && (
          <>
            <span className="app-header__badge">
              <span className="app-header__dot app-header__dot--live" />
              Your watch history
            </span>
            <span className="app-header__file" title={badge.fileName}>
              {badge.fileName}
            </span>
          </>
        )}
      </div>
      <div className="app-header__actions">
        {actions}
        {onOpenSettings && (
          <button
            ref={settingsRef}
            type="button"
            className="icon-btn nb-btn"
            aria-label="Settings"
            aria-haspopup="dialog"
            onClick={onOpenSettings}
          >
            <Icon name="sliders" size={20} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </header>
  );
}
