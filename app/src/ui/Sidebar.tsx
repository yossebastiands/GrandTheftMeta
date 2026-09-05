import type { ReactNode } from "react";
import {
  CarFront,
  Gauge,
  Layers,
  Lock,
  Rocket,
  Settings2,
} from "lucide-react";

export type EditorId = "handling" | "single";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  hint?: string;
}

interface Category {
  label: string;
  note?: string;
  items: NavItem[];
}

// Categories of meta editors. VEHICLES is live; WEAPONS (firearm .meta files,
// e.g. weaponarchetypes.meta — NOT vehicle-mounted weapons) and others follow.
const CATEGORIES: Category[] = [
  {
    label: "Vehicles",
    items: [
      {
        id: "handling",
        label: "Bulk Handling Editor",
        icon: <Gauge className="h-4 w-4" />,
      },
      {
        id: "single",
        label: "Single Handling Editor",
        icon: <Settings2 className="h-4 w-4" />,
      },
      {
        id: "layouts",
        label: "Vehicle Layouts",
        icon: <CarFront className="h-4 w-4" />,
        disabled: true,
        hint: "Coming soon",
      },
      {
        id: "variations",
        label: "Car Variations",
        icon: <Layers className="h-4 w-4" />,
        disabled: true,
        hint: "Coming soon",
      },
    ],
  },
  {
    label: "Weapons",
    note: "Firearm meta — coming soon",
    items: [
      {
        id: "weapons",
        label: "Weapon Data",
        icon: <Rocket className="h-4 w-4" />,
        disabled: true,
        hint: "Coming soon",
      },
    ],
  },
];

interface SidebarProps {
  active: EditorId;
  onSelect: (id: EditorId) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <nav className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-800 bg-gray-900 px-2 py-3">
      {CATEGORIES.map((cat) => (
        <div key={cat.label}>
          <div className="flex items-baseline justify-between px-2 pb-1">
            <span className="text-2xs font-semibold uppercase tracking-wider text-gray-600">
              {cat.label}
            </span>
            {cat.note && (
              <span className="text-2xs text-gray-700">{cat.note}</span>
            )}
          </div>
          <ul className="flex flex-col gap-0.5">
            {cat.items.map((item) => {
              const isActive = !item.disabled && active === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={item.disabled}
                    title={item.hint}
                    onClick={() => !item.disabled && onSelect(item.id as EditorId)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      isActive
                        ? "bg-accent/15 font-semibold text-accent ring-1 ring-inset ring-accent/40"
                        : item.disabled
                          ? "cursor-not-allowed text-gray-600"
                          : "text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    <span className={item.disabled ? "opacity-60" : ""}>
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                    {item.disabled && (
                      <Lock className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-auto px-2 text-2xs leading-relaxed text-gray-600">
        <span className="text-gray-500">Vehicles</span> is live. Categories for
        other meta — weapons, layouts, colours — are planned.
      </div>
    </nav>
  );
}
