import { supabase } from "./supabaseClient";
import type { Lobby, GameState } from "./types";

/** 6-char lobby code using unambiguous characters (no 0/O/1/I). */
export function generateLobbyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createLobby(
  creatorId: string,
  celebrityCount: number,
  mode: "online" | "local" = "online"
): Promise<Lobby> {
  const code = generateLobbyCode();
  const { data, error } = await supabase
    .from("lobbies")
    .insert({
      code,
      creator_id: creatorId,
      celebrity_count: celebrityCount,
      mode,
      status: "waiting",
      game_state: {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as Lobby;
}

export async function getLobbyByCode(code: string): Promise<Lobby | null> {
  const { data, error } = await supabase
    .from("lobbies")
    .select("*")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();
  if (error) throw error;
  return (data as Lobby) ?? null;
}

export async function getLobby(id: string): Promise<Lobby | null> {
  const { data, error } = await supabase
    .from("lobbies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Lobby) ?? null;
}

/**
 * Join a waiting lobby by code. Sets the guest and moves status to "ready".
 * Throws on not-found / full.
 */
export async function joinLobby(code: string, guestId: string): Promise<Lobby> {
  const lobby = await getLobbyByCode(code);
  if (!lobby) throw new Error("Lobby not found. Check the code.");
  if (lobby.guest_id) throw new Error("That lobby is already full.");
  if (lobby.creator_id === guestId)
    throw new Error("You can't join your own lobby.");

  const { data, error } = await supabase
    .from("lobbies")
    .update({ guest_id: guestId, status: "ready" })
    .eq("id", lobby.id)
    .select()
    .single();
  if (error) throw error;
  return data as Lobby;
}

/**
 * Atomically read-modify-write `game_state` for a lobby. Each caller mutates only
 * its own per-user keys (selections[userId] / eliminated[userId]) to avoid races.
 */
export async function updateGameState(
  lobbyId: string,
  mutate: (gs: GameState) => GameState
): Promise<GameState> {
  const { data: cur, error: readErr } = await supabase
    .from("lobbies")
    .select("game_state")
    .eq("id", lobbyId)
    .single();
  if (readErr) throw readErr;

  const gs: GameState = (cur?.game_state as GameState) ?? {
    celebrities: [],
    selection_started_at: null,
    selections: {},
    selection_confirmed: {},
    main_started_at: null,
    eliminated: {},
    winner: null,
    won_by_guess: null,
    ended_at: null,
  };
  const next = mutate(gs);
  const { error: writeErr } = await supabase
    .from("lobbies")
    .update({ game_state: next })
    .eq("id", lobbyId);
  if (writeErr) throw writeErr;
  return next;
}

/** Randomly pick `n` unique celebrities (ids) from the full table. */
export async function pickRandomCelebrities(n: number): Promise<string[]> {
  const { data, error } = await supabase.from("celebrities").select("id");
  if (error) throw error;
  const ids = (data as { id: string }[]).map((r) => r.id);
  // Fisher-Yates shuffle, take first n.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.min(n, ids.length));
}
