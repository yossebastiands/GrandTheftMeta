import type { ReactNode } from "react";
import type { AppSection } from "./Navbar";

/** One view inside a section, e.g. Meta Workshop -> Workspace. */
export interface SubNavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Shown but not selectable (e.g. Dashboard with nothing scanned yet). */
  disabled?: boolean;
  title?: string;
}

interface SubNavbarProps {
  section: AppSection;
  /** Title of the owning section, shown at the left of the bar. */
  title: string;
  items: SubNavItem[];
  active: string;
  onNavigate: (id: string) => void;
  /** Optional contextual extras (e.g. the folder that is currently loaded). */
  right?: ReactNode;
}

/**
 * Contextual navigation for the active global section.
 *
 * The global navbar picks a workshop; this one picks a place inside it, so each
 * workshop grows its own set of views without crowding the top bar.
 */
export default function SubNavbar({
  title,
  items,
  active,
  onNavigate,
  right,
}: SubNavbarProps) {
  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-gray-800 bg-gray-900/50 pl-3">
      <div className="flex items-center gap-2 pr-3">
        <span className="text-2xs font-semibold uppercase tracking-wider text-gray-500">
          {title}
        </span>
      </div>

      <nav className="flex items-stretch">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              title={item.title ?? item.label}
              onClick={() => onNavigate(item.id)}
              className={`relative flex items-center gap-1.5 px-3 text-xs transition ${
                isActive
                  ? "font-semibold text-accent"
                  : item.disabled
                    ? "cursor-not-allowed text-gray-700"
                    : "text-gray-400 hover:text-gray-100"
              }`}
            >
              {item.icon}
              {item.label}
              {isActive && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-accent" />
              )}
            </button>
          );
        })}
      </nav>

      {right && (
        <div className="ml-auto flex min-w-0 items-center gap-2 pr-3 text-2xs text-gray-500">
          {right}
        </div>
      )}
    </div>
  );
}
