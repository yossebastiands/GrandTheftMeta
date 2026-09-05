import { Search } from "lucide-react";

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  types: string[];
  typeFilter: string;
  onTypeFilter: (v: string) => void;
  classes: string[];
  classFilter: string;
  onClassFilter: (v: string) => void;
  disabled: boolean;
}

export default function FilterBar({
  search,
  onSearch,
  types,
  typeFilter,
  onTypeFilter,
  classes,
  classFilter,
  onClassFilter,
  disabled,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-3 py-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          disabled={disabled}
          placeholder="Search vehicle / handlingName / type / class…"
          className="w-64 rounded-md border border-gray-700 bg-gray-950 py-1 pl-7 pr-2 text-xs text-gray-200 placeholder:text-gray-500 focus:border-accent focus:outline-none disabled:opacity-40"
        />
      </div>

      <SelectField label="Type:" value={typeFilter} onChange={onTypeFilter} options={types} disabled={disabled} />
      <SelectField label="Class:" value={classFilter} onChange={onClassFilter} options={classes} disabled={disabled} />

      <div className="ml-auto text-2xs text-gray-500">
        {disabled
          ? "No data loaded"
          : `${types.length} types · ${classes.length} classes`}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-400">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-md border border-gray-700 bg-gray-950 px-1.5 py-1 text-xs text-gray-200 focus:border-accent focus:outline-none disabled:opacity-40"
      >
        <option value="ALL">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
