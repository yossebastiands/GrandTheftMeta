import type { ReactNode } from "react";
import {
  CarFront,
  Gauge,
  Layers,
  Lock,
  Rocket,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  hint?: string;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Editors",
    items: [
      {
        id: "handling",
        label: "Bulk Handling Editor",
        icon: <Gauge className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "Coming soon",
    items: [
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
  active?: string;
}

export default function Sidebar({ active = "handling" }: SidebarProps) {
  return (
    <nav className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-800 bg-gray-900 px-2 py-3">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-gray-600">
            {group.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const isActive = !item.disabled && active === item.id;
              return (
                <li key={item.id}>
                  <div
                    title={item.hint}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                      isActive
                        ? "bg-accent/15 font-semibold text-accent ring-1 ring-inset ring-accent/40"
                        : item.disabled
                          ? "cursor-not-allowed text-gray-600"
                          : "text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    <span className={item.disabled ? "opacity-60" : ""}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                    {item.disabled && (
                      <Lock className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-auto px-2 text-2xs leading-relaxed text-gray-600">
        More editors are planned for this workspace.
      </div>
    </nav>
  );
}
