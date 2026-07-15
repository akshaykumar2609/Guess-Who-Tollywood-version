interface TimerProps {
  /** Seconds remaining (number >= 0). */
  remaining: number;
  /** Optional total, for a progress bar. */
  total?: number;
  label?: string;
  danger?: boolean;
}

export default function Timer({
  remaining,
  total,
  label,
  danger,
}: TimerProps) {
  const mm = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(remaining % 60)
    .toString()
    .padStart(2, "0");
  const pct =
    total && total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <div className="flex items-center gap-3">
      <div
        className={`rounded-xl px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
          danger ? "bg-red-600/20 text-red-300" : "bg-tolly-ink text-tolly-gold"
        }`}
      >
        {mm}:{ss}
      </div>
      {total && (
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-tolly-ink">
          <div
            className={`h-full rounded-full transition-all ${
              danger ? "bg-red-500" : "bg-tolly-gold"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {label && <span className="text-xs text-tolly-muted">{label}</span>}
    </div>
  );
}
