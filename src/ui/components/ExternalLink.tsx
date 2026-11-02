import type { MouseEvent, ReactNode } from "react";

/**
 * Every link that leaves the app goes through here, so the desktop shell has one place to
 * hand URLs to the system browser (for example with Tauri's opener plugin).
 */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function ExternalLink({ href, children, className }: ExternalLinkProps) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    openExternal(href);
  };
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={className}>
      {children}
    </a>
  );
}
