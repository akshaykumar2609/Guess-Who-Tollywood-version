// Tunable game constants.

/** Number of celebrities a match can use (creator picks one). */
export const CELEBRITY_COUNT_OPTIONS = [20, 30, 40] as const;

/** Seconds each player gets to secretly pick their character. */
export const SELECTION_SECONDS = 15;

/**
 * Main-game timer length, scaled by the number of celebrities.
 * Spec: 2 minutes for 20, 3 minutes for 30 -> 1 minute per 10 celebrities,
 * with a 2-minute floor. (40 celebrities -> 4 minutes.)
 */
export function mainTimerSeconds(count: number): number {
  return Math.max(2, count / 10) * 60;
}

/** STUN servers for WebRTC. TURN would be needed for strict NATs (paid/some free). */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Optional TURN server for peers behind symmetric/strict NATs. Set these
  // via NEXT_PUBLIC_TURN_* env vars (see setup.md). Leave unset for STUN-only.
  ...(process.env.NEXT_PUBLIC_TURN_URL
    ? [
        {
          urls: process.env.NEXT_PUBLIC_TURN_URL.split(","),
          username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? "",
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? "",
        } as RTCIceServer,
      ]
    : []),
];
