import { BookOpenText, Home } from "lucide-react";

export type AppView = "home" | "glossary";

interface NavbarProps {
  version?: string;
  active: AppView;
  onNavigate: (view: AppView) => void;
}

const NAV = [
  { id: "home" as const, label: "Home", icon: <Home className="h-4 w-4" /> },
  { id: "glossary" as const, label: "Glossary", icon: <BookOpenText className="h-4 w-4" /> },
];

export default function Navbar({ version, active, onNavigate }: NavbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-800 bg-gray-900 px-3">
      <img
        src="/gtm.png"
        alt="GrandTheftMeta"
        className="h-7 w-7 shrink-0 rounded-md object-contain"
      />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-100">GrandTheftMeta</span>
          {version && (
            <span className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-2xs text-gray-400">
              v{version}
            </span>
          )}
        </div>
        <div className="truncate text-2xs text-gray-500">
          FiveM Vehicle Tools · by Apollo Flight Program
        </div>
      </div>

      {/* Primary navigation */}
      <nav className="ml-4 flex items-center gap-1">
        {NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                isActive
                  ? "bg-accent/15 font-semibold text-accent ring-1 ring-inset ring-accent/40"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-green-800/60 bg-green-950/40 px-2 py-0.5 text-2xs text-green-300">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          Desktop
        </span>
      </div>
    </header>
  );
}
