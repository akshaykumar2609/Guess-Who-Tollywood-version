import type { Celebrity } from "../lib/types";

interface GameBoardProps {
  celebrities: Celebrity[];
  eliminated: string[];
  mySelection?: string; // my secret character id (for subtle highlight)
  phase: "select" | "main" | "ended";
  onToggleEliminate: (id: string) => void;
  onSelectCharacter: (id: string) => void;
}

/**
 * Grid of celebrity cards. During the secret-selection phase, clicking a card
 * picks your character. During the main phase, clicking toggles elimination.
 */
export default function GameBoard({
  celebrities,
  eliminated,
  mySelection,
  phase,
  onToggleEliminate,
  onSelectCharacter,
}: GameBoardProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {celebrities.map((c) => {
        const isEliminated = eliminated.includes(c.id);
        const isMine = mySelection === c.id;
        return (
          <button
            key={c.id}
            disabled={phase === "ended"}
            onClick={() =>
              phase === "select"
                ? onSelectCharacter(c.id)
                : onToggleEliminate(c.id)
            }
            className={`group relative aspect-[3/4] overflow-hidden rounded-xl border text-left transition-all ${
              isEliminated
                ? "border-white/5 opacity-30 grayscale"
                : "border-white/10 hover:border-tolly-gold"
            } ${isMine ? "ring-2 ring-tolly-gold" : ""}`}
          >
            {/* Image with graceful fallback to initials if the URL fails. */}
            <img
              src={c.image_url}
              alt={c.name}
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
                const el = (e.currentTarget as HTMLImageElement)
                  .nextElementSibling as HTMLElement | null;
                if (el) el.style.display = "flex";
              }}
              className="h-full w-full object-cover"
            />
            <div
              className="absolute inset-0 hidden items-center justify-center bg-tolly-card text-2xl font-bold text-tolly-gold"
              style={{ display: "none" }}
            >
              {c.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2">
              <p className="truncate text-xs font-semibold text-white">
                {c.name}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-tolly-muted">
                {c.role}
              </p>
            </div>

            {isEliminated && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-0.5 w-3/4 rotate-45 bg-red-500/80" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
