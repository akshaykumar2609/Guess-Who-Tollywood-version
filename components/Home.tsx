import { useState } from "react";
import { createLobby, joinLobby } from "../lib/lobby";
import { CELEBRITY_COUNT_OPTIONS } from "../lib/constants";
import type { Lobby } from "../lib/types";
import Button from "./Button";

interface HomeProps {
  userId: string;
  onEnterLobby: (lobby: Lobby) => void;
}

export default function Home({ userId, onEnterLobby }: HomeProps) {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [count, setCount] = useState<number>(CELEBRITY_COUNT_OPTIONS[0]);
  const [mode, setMode] = useState<"online" | "local">("online");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const lobby = await createLobby(userId, count, mode);
      onEnterLobby(lobby);
    } catch (e: any) {
      setError(e.message ?? "Could not create lobby.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    setLoading(true);
    setError(null);
    try {
      const lobby = await joinLobby(code, userId);
      onEnterLobby(lobby);
    } catch (e: any) {
      setError(e.message ?? "Could not join lobby.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-tolly-panel/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="mb-6 flex rounded-xl bg-tolly-ink p-1">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition ${
              tab === t ? "bg-tolly-red text-white" : "text-tolly-muted"
            }`}
          >
            {t} lobby
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm text-tolly-muted">
              Celebrities in the match
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CELEBRITY_COUNT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setCount(opt)}
                  className={`rounded-xl border py-3 text-sm font-semibold transition ${
                    count === opt
                      ? "border-tolly-gold bg-tolly-gold/10 text-tolly-gold"
                      : "border-white/10 text-tolly-muted hover:border-white/30"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm text-tolly-muted">
              Game mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["online", "local"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                    mode === m
                      ? "border-tolly-gold bg-tolly-gold/10 text-tolly-gold"
                      : "border-white/10 text-tolly-muted hover:border-white/30"
                  }`}
                >
                  {m === "online" ? "Online" : "Local (same room)"}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-tolly-muted">
              {mode === "online"
                ? "Video, audio & chat over WebRTC."
                : "No camera/mic/chat — both players share one screen."}
            </p>
          </div>
          <Button onClick={handleCreate} disabled={loading} className="w-full">
            {loading ? "Creating…" : "Create lobby"}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm text-tolly-muted">
              Lobby code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="w-full rounded-xl border border-white/10 bg-tolly-ink px-4 py-3 text-center text-xl tracking-[0.4em] text-white outline-none focus:border-tolly-gold"
            />
          </div>
          <Button onClick={handleJoin} disabled={loading} className="w-full">
            {loading ? "Joining…" : "Join lobby"}
          </Button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      <p className="mt-5 text-center text-xs text-tolly-muted">
        You&apos;re signed in and ready to play.
      </p>
    </div>
  );
}
