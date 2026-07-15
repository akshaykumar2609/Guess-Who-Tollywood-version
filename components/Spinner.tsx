export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 text-tolly-muted">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-tolly-gold border-t-transparent" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
