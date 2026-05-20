interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: string;
}

export function Toggle({ label, checked, onChange, icon }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
        checked
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-zinc-700/80 bg-zinc-900/60 hover:border-zinc-600'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
        {icon && <span className="text-base">{icon}</span>}
        {label}
      </span>
      <span
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? 'bg-indigo-500' : 'bg-zinc-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
