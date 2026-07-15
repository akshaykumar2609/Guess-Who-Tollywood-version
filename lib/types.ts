// Shared TypeScript types for Tollywood Guess Who.

export type CelebrityRole =
  | "hero"
  | "heroine"
  | "director"
  | "villain"
  | "comedian"
  | "character artist";

export interface Celebrity {
  id: string;
  name: string;
  image_url: string;
  gender: string;
  role: string;
}

export type LobbyStatus = "waiting" | "ready" | "in_progress" | "completed";

/** jsonb blob stored on `lobbies.game_state`. */
export interface GameState {
  /** The celebrity ids chosen for this match. */
  celebrities: string[];
  /** ISO timestamp when the 15s secret-selection timer began. */
  selection_started_at: string | null;
  /** Per-player chosen (secret) celebrity id: { [userId]: celebrityId }. */
  selections: Record<string, string>;
  /** ISO timestamp when the main game timer began. */
  main_started_at: string | null;
  /** Per-player eliminated celebrity ids: { [userId]: string[] }. */
  eliminated: Record<string, string[]>;
  /** A submitted (unconfirmed) guess: { by, celebrityId } or null. */
  pending_guess: { by: string; celebrityId: string } | null;
  /** Winning player user id, or null while playing. */
  winner: string | null;
  /** Whether the winner won by a correct guess (true) or by timeout (false). */
  won_by_guess: boolean | null;
  /** ISO timestamp when the game ended. */
  ended_at: string | null;
}

export interface Lobby {
  id: string;
  code: string;
  creator_id: string;
  guest_id: string | null;
  celebrity_count: number;
  /** "online" includes video/audio/chat; "local" is the same-room, no-media mode. */
  mode: "online" | "local";
  status: LobbyStatus;
  game_state: GameState | null;
  created_at?: string;
}

export function emptyGameState(): GameState {
  return {
    celebrities: [],
    selection_started_at: null,
    selections: {},
    main_started_at: null,
    eliminated: {},
    pending_guess: null,
    winner: null,
    won_by_guess: null,
    ended_at: null,
  };
}

export interface ChatMessage {
  from: string;
  text: string;
  at: number; // epoch ms
}
