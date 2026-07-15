import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import {
  getLobby,
  updateGameState,
  pickRandomCelebrities,
} from "../lib/lobby";
import { SELECTION_SECONDS, mainTimerSeconds } from "../lib/constants";
import type { Celebrity, ChatMessage, GameState, Lobby } from "../lib/types";
import { Peer } from "../lib/webrtc";
import GameBoard from "./GameBoard";
import Timer from "./Timer";
import VideoOverlay from "./VideoOverlay";
import Chat from "./Chat";
import Button from "./Button";

interface GameRoomProps {
  lobbyId: string;
  userId: string;
  userName: string;
}

type Phase = "connecting" | "waiting" | "selection" | "main" | "ended";

export default function GameRoom({ lobbyId, userId, userName }: GameRoomProps) {
  const router = useRouter();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [gs, setGs] = useState<GameState | null>(null);
  const [celebrities, setCelebrities] = useState<Celebrity[]>([]);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // video / chat
  const [peer, setPeer] = useState<Peer | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [statusLabel, setStatusLabel] = useState("Connecting…");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // timers
  const [selRemaining, setSelRemaining] = useState(SELECTION_SECONDS);
  const [mainRemaining, setMainRemaining] = useState(0);
  const [myPick, setMyPick] = useState<string | null>(null);
  const mainStartedRef = useRef(false);

  const lobbyRef = useRef<Lobby | null>(null);
  const gsRef = useRef<GameState | null>(null);
  const selTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const notifChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isCreator = lobby?.creator_id === userId;
  const remoteId =
    lobby?.creator_id === userId ? lobby?.guest_id : lobby?.creator_id;
  // Local mode = both players in one room, so no WebRTC video/audio or chat.
  const isLocal = lobby?.mode === "local";

  useEffect(() => {
    lobbyRef.current = lobby;
  }, [lobby]);
  useEffect(() => {
    gsRef.current = gs;
  }, [gs]);

  // ---------- Load lobby + subscribe to realtime changes ----------
  const load = useCallback(async () => {
    try {
      const l = await getLobby(lobbyId);
      if (!l) {
        setError("Lobby not found.");
        return;
      }
      setLobby(l);
      const g = (l.game_state as GameState) ?? emptyState();
      setGs(g);
      setMyPick(g.selections?.[userId] ?? null);
      if (l.status === "completed" || g.winner) setPhase("ended");
    } catch (e: any) {
      setError(e.message);
    }
  }, [lobbyId, userId]);

  useEffect(() => {
    void load();

    const ch = supabase
      .channel(`lobby-${lobbyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lobbies",
          filter: `id=eq.${lobbyId}`,
        },
        (payload) => {
          const nl = payload.new as Lobby;
          setLobby(nl);
          const ng = (nl.game_state as GameState) ?? emptyState();
          setGs(ng);
          setMyPick(ng.selections?.[userId] ?? null);
          if (nl.status === "completed" || ng.winner) setPhase("ended");
        }
      )
      .subscribe();
    channelRef.current = ch;

    // separate channel for chat so messages don't touch DB/RLS
    const chat = supabase
      .channel(`chat-${lobbyId}`)
      .on("broadcast", { event: "msg" }, ({ payload }) => {
        setMessages((prev) => [...prev, payload as ChatMessage]);
      })
      .subscribe();
    chatChannelRef.current = chat;

    // Explicit, low-latency notification channel for the guess flow. This is
    // what makes Player 1 reliably learn that Player 2 confirmed/rejected a
    // guess (postgres_changes alone could lag or arrive in a bad order).
    const notif = supabase
      .channel(`notif-${lobbyId}`)
      .on("broadcast", { event: "guess" }, ({ payload }) => {
        const p = payload as { type: string; winner?: string | null };
        if (p.type === "submitted") {
          setInfo("Opponent is reviewing your guess…");
        } else if (p.type === "resolved") {
          setInfo("Opponent responded to your guess.");
          if (p.winner) {
            setGs((currentGs) => {
              if (!currentGs) return null;
              return {
                ...currentGs,
                winner: p.winner!,
                won_by_guess: true,
                pending_guess: null,
                ended_at: new Date().toISOString(),
              };
            });
            setPhase("ended");
          }
        }
      })
      .subscribe();
    notifChannelRef.current = notif;

    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(chat);
      supabase.removeChannel(notif);
      selTimer.current && clearInterval(selTimer.current);
      mainTimer.current && clearInterval(mainTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, load]);

  // ---------- React to phase derived from gs + statuses ----------
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!lobby) return;
    if (lobby.status === "completed" || gs?.winner) {
      setPhase("ended");
      return;
    }
    if (lobby.status === "in_progress") {
      const sel = gs?.selections ?? {};
      const bothPicked = sel[userId] && sel[remoteId ?? ""];
      const bothConfirmed =
        gs?.selection_confirmed?.[userId] &&
        gs?.selection_confirmed?.[remoteId ?? ""];
      if (bothPicked && bothConfirmed && gs?.main_started_at) {
        setPhase("main");
      } else if (bothPicked && bothConfirmed && !gs?.main_started_at) {
        // Both confirmed but the main timer hasn't been stamped yet. Only the
        // creator stamps it (avoids a double-write race), then it propagates
        // via realtime to the guest.
        if (isCreator) void beginMainGame();
        setPhase("selection");
      } else {
        setPhase("selection");
      }
    } else if (lobby.status === "ready" || lobby.status === "waiting") {
      setPhase("waiting");
    }
  }, [lobby, gs, userId, remoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Load celebrity details when game_state.celebrities is set ----------
  useEffect(() => {
    if (!gs?.celebrities?.length) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("celebrities")
        .select("*")
        .in("id", gs.celebrities);
      if (!error && alive && data) setCelebrities(data as Celebrity[]);
    })();
    return () => {
      alive = false;
    };
  }, [gs?.celebrities]);

  // ---------- Selection timer ----------
  useEffect(() => {
    if (phase === "selection" && gs?.selection_started_at) {
      const start = new Date(gs.selection_started_at).getTime();
      selTimer.current = setInterval(() => {
        const rem = Math.max(
          0,
          SELECTION_SECONDS - Math.floor((Date.now() - start) / 1000)
        );
        setSelRemaining(rem);
        if (rem <= 0) {
          selTimer.current && clearInterval(selTimer.current);
          void handleSelectionTimeout();
        }
      }, 500);
      return () => {
        if (selTimer.current) clearInterval(selTimer.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, gs?.selection_started_at]);

  // ---------- Main timer ----------
  useEffect(() => {
    if (phase === "main" && gs?.main_started_at) {
      const total = mainTimerSeconds(lobby?.celebrity_count ?? 20);
      const start = new Date(gs.main_started_at).getTime();
      mainTimer.current = setInterval(() => {
        const rem = Math.max(
          0,
          total - Math.floor((Date.now() - start) / 1000)
        );
        setMainRemaining(rem);
        if (rem <= 0) {
          mainTimer.current && clearInterval(mainTimer.current);
          void resolveBySurvival();
        }
      }, 500);
      return () => {
        if (mainTimer.current) clearInterval(mainTimer.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, gs?.main_started_at, lobby?.celebrity_count]);

  // ---------- Confirm exit during active game ----------
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (phase === "selection" || phase === "main") {
        e.preventDefault();
        e.returnValue = "Are you sure you want to exit the game? Your progress will be lost.";
        return e.returnValue;
      }
    };

    const handleRouteChange = (url: string) => {
      if (phase === "selection" || phase === "main") {
        const confirmExit = window.confirm(
          "Are you sure you want to exit the game? Your progress will be lost."
        );
        if (!confirmExit) {
          router.events.emit("routeChangeError");
          throw "routeChange aborted";
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    router.events.on("routeChangeStart", handleRouteChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [phase, router]);

  // ---------- Setup WebRTC peer once we know both players ----------
  // Skip entirely in local mode (no camera/mic needed).
  useEffect(() => {
    if (!lobby || !remoteId || isLocal) return;
    if (peer) return;
    const p = new Peer({
      supabase,
      lobbyId,
      userId,
      remoteId,
      initiator: isCreator,
      onRemoteStream: (s) => setRemoteStream(s),
      onStatusChange: (s) => setStatusLabel(s),
    });
    void p.getLocalStream().then((s) => setLocalStream(s)).catch(() => { });
    setPeer(p);
    return () => {
      p.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby, remoteId, userId, isCreator, peer, lobbyId]);

  // ---------- Actions ----------
  async function startGame() {
    if (!isCreator || !lobby) return;
    setInfo("Starting game…");
    try {
      const ids = await pickRandomCelebrities(lobby.celebrity_count);
      const next = await updateGameState(lobby.id, (g) => ({
        ...g,
        celebrities: ids,
        selection_started_at: new Date().toISOString(),
        selections: {},
        selection_confirmed: {},
        eliminated: {},
        pending_guess: null,
        winner: null,
        won_by_guess: null,
        ended_at: null,
        main_started_at: null,
      }));
      await supabase
        .from("lobbies")
        .update({ status: "in_progress" })
        .eq("id", lobby.id);
      setGs(next);
      setPhase("selection");
      setInfo(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  // Secret pick: write the chosen celebrity for this user. The main game only
  // starts once BOTH players have also clicked Confirm (see confirmSelection).
  async function selectCharacter(id: string) {
    if (!lobby) return;
    setMyPick(id);
    await updateGameState(lobby.id, (g) => ({
      ...g,
      selections: { ...g.selections, [userId]: id },
    }));
    setInfo("Character chosen — press Confirm to lock it in.");
  }

  // Explicit confirmation after picking. Once both players confirm, the host
  // (creator) starts the main timer. This satisfies "continue only after both
  // players selected their desired celebrities".
  async function confirmSelection() {
    if (!lobby || !gs) return;
    if (!gs.selections[userId]) {
      setError("Pick a celebrity first.");
      return;
    }
    await updateGameState(lobby.id, (g) => ({
      ...g,
      selection_confirmed: { ...g.selection_confirmed, [userId]: true },
    }));
    setInfo("Waiting for your opponent to confirm…");

    const bothConfirmed =
      gs.selections[remoteId ?? ""] &&
      gs.selection_confirmed?.[remoteId ?? ""];
    if (bothConfirmed) {
      await beginMainGame();
    }
  }

  async function beginMainGame() {
    if (!lobby || mainStartedRef.current) return;
    mainStartedRef.current = true;
    const next = await updateGameState(lobby.id, (g) => ({
      ...g,
      main_started_at: new Date().toISOString(),
    }));
    setGs(next);
    setPhase("main");
    setInfo(null);
  }

  async function handleSelectionTimeout() {
    if (!lobby) return;
    const g = gsRef.current;
    if (!g) return;
    const sel = { ...g.selections };
    if (!sel[userId])
      sel[userId] =
        g.celebrities[Math.floor(Math.random() * g.celebrities.length)];
    if (!sel[remoteId ?? ""])
      sel[remoteId ?? ""] =
        g.celebrities[Math.floor(Math.random() * g.celebrities.length)];
    const next = await updateGameState(lobby.id, (gg) => ({
      ...gg,
      selections: sel,
      // auto-confirm both on timeout so the game proceeds
      selection_confirmed: {
        [userId]: true,
        [remoteId ?? ""]: true,
      },
      main_started_at: new Date().toISOString(),
    }));
    setGs(next);
    setPhase("main");
    setInfo(null);
  }

  async function toggleEliminate(id: string) {
    if (!lobby) return;
    const cur = gsRef.current?.eliminated?.[userId] ?? [];
    const nextList = cur.includes(id)
      ? cur.filter((x) => x !== id)
      : [...cur, id];
    await updateGameState(lobby.id, (g) => ({
      ...g,
      eliminated: { ...g.eliminated, [userId]: nextList },
    }));
  }

  async function submitGuess(id: string) {
    if (!lobby) return;
    // Write a pending guess; the opponent (truth-holder) confirms it.
    await updateGameState(lobby.id, (g) => ({
      ...g,
      pending_guess: { by: userId, celebrityId: id },
    }));
    setInfo("Guess submitted — waiting for opponent to confirm…");
    // Tell the opponent immediately (reliable, low-latency path).
    notifChannelRef.current?.send({
      type: "broadcast",
      event: "guess",
      payload: { type: "submitted", by: userId, celebrityId: id },
    });
  }

  async function confirmGuess(confirm: boolean) {
    if (!lobby || !gs?.pending_guess) return;
    const { by, celebrityId } = gs.pending_guess;
    if (confirm && gs.selections[userId] === celebrityId) {
      const nextGs = {
        ...gs,
        winner: by,
        won_by_guess: true,
        pending_guess: null,
        ended_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("lobbies")
        .update({
          game_state: nextGs,
          status: "completed",
        })
        .eq("id", lobby.id);
      if (error) {
        setError(error.message);
        return;
      }
      setGs(nextGs);
      setPhase("ended");
      // Notify the guesser that the result is in.
      notifChannelRef.current?.send({
        type: "broadcast",
        event: "guess",
        payload: { type: "resolved", winner: by },
      });
    } else {
      // Wrong guess or rejected -> clear pending, guesser loses their turn.
      const nextGs = {
        ...gs,
        pending_guess: null,
      };
      const { error } = await supabase
        .from("lobbies")
        .update({ game_state: nextGs })
        .eq("id", lobby.id);
      if (error) {
        setError(error.message);
        return;
      }
      setGs(nextGs);
      setInfo(
        confirm ? "Incorrect! That guess was wrong." : "Guess rejected."
      );
      notifChannelRef.current?.send({
        type: "broadcast",
        event: "guess",
        payload: { type: "resolved", winner: null },
      });
    }
  }

  async function resolveBySurvival() {
    if (!lobby || !gs) return;
    const myAlive =
      celebrities.length -
      (gs.eliminated[userId]?.length ?? 0) -
      (gs.selections[userId] ? 1 : 0);
    const oppAlive =
      celebrities.length -
      (gs.eliminated[remoteId ?? ""]?.length ?? 0) -
      (gs.selections[remoteId ?? ""] ? 1 : 0);
    const winner =
      myAlive === 1 ? userId : oppAlive === 1 ? remoteId ?? userId : userId;
    
    const nextGs = {
      ...gs,
      winner,
      won_by_guess: false,
      pending_guess: null,
      ended_at: new Date().toISOString(),
    };
    
    const { error } = await supabase
      .from("lobbies")
      .update({
        game_state: nextGs,
        status: "completed",
      })
      .eq("id", lobby.id);
    if (error) {
      setError(error.message);
      return;
    }
    setGs(nextGs);
    setPhase("ended");
  }

  async function playAgain() {
    if (!lobby) return;
    try {
      setInfo("Resetting lobby…");
      const { error } = await supabase
        .from("lobbies")
        .update({
          status: "ready",
          game_state: {},
        })
        .eq("id", lobby.id);
      if (error) throw error;
      setGs(emptyState());
      setPhase("waiting");
      setInfo(null);
      mainStartedRef.current = false;
    } catch (e: any) {
      setError(e.message);
    }
  }

  function sendChat(text: string) {
    chatChannelRef.current?.send({
      type: "broadcast",
      event: "msg",
      payload: { from: userId, text, at: Date.now() } as ChatMessage,
    });
    // Optimistically show locally too (broadcast doesn't echo to self).
    setMessages((prev) => [...prev, { from: userId, text, at: Date.now() }]);
  }

  // ---------- Render ----------
  if (error && phase === "connecting" && !lobby) {
    return (
      <Centered>
        <p className="text-red-400">{error}</p>
      </Centered>
    );
  }

  const pendingIsForMe =
    gs?.pending_guess && gs.pending_guess.by !== userId;

  return (
    <div className="mx-auto max-w-6xl px-3 py-4">
      <Header
        code={lobby?.code}
        status={lobby?.status}
        mode={lobby?.mode}
        isCreator={isCreator}
        onStart={startGame}
      />

      {info && (
        <p className="my-2 rounded-lg bg-tolly-gold/10 px-3 py-2 text-sm text-tolly-gold">
          {info}
        </p>
      )}
      {error && (
        <p className="my-2 rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {phase === "waiting" && (
        <WaitingView
          isCreator={isCreator}
          hasGuest={!!lobby?.guest_id}
          onStart={startGame}
          code={lobby?.code}
        />
      )}

      {phase !== "waiting" && celebrities.length > 0 && (
        <div className="space-y-4">
          {/* TOP: video + chat controls (online mode) */}
          {!isLocal && (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="rounded-xl bg-tolly-panel/70 p-3">
                <VideoOverlay
                  peer={peer}
                  remoteStream={remoteStream}
                  localStream={localStream}
                  statusLabel={statusLabel}
                  selfName={userName}
                  remoteName={isCreator ? "Guest" : "Host"}
                />
              </div>
              <div className="h-80 overflow-hidden rounded-xl bg-tolly-panel/70">
                <Chat
                  messages={messages}
                  myId={userId}
                  onSend={sendChat}
                  disabled={phase === "ended"}
                />
              </div>
            </div>
          )}

          {/* Local mode note with chat support */}
          {isLocal && (
            <div className="grid gap-4 md:grid-cols-[1fr_320px]">
              <div className="rounded-xl bg-tolly-panel/70 p-4 text-center flex flex-col justify-center">
                <p className="text-sm font-semibold text-tolly-gold">
                  Local mode
                </p>
                <p className="mt-1 text-xs text-tolly-muted">
                  You&apos;re sharing one screen — ask your questions out loud.
                  Camera and mic are disabled, but you can use the chat log below for notes or tracking.
                </p>
              </div>
              <div className="h-80 overflow-hidden rounded-xl bg-tolly-panel/70">
                <Chat
                  messages={messages}
                  myId={userId}
                  onSend={sendChat}
                  disabled={phase === "ended"}
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            {phase === "selection" && (
              <div className="rounded-xl bg-tolly-panel/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-tolly-gold">
                    Secret pick — choose your character
                  </span>
                  <Timer remaining={selRemaining} total={SELECTION_SECONDS} danger />
                </div>
                <p className="mb-2 text-xs text-tolly-muted">
                  Click a card to be that celebrity. Your opponent must guess it.
                  Then press <b>Confirm</b> — the game starts only once you{" "}
                  <b>both</b> confirm.
                </p>
                <GameBoard
                  celebrities={celebrities}
                  eliminated={[]}
                  mySelection={myPick ?? undefined}
                  phase="select"
                  onSelectCharacter={selectCharacter}
                  onToggleEliminate={() => { }}
                />
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-tolly-muted">
                    {gs?.selection_confirmed?.[userId]
                      ? "✓ You confirmed"
                      : "Pick a card, then confirm"}
                  </span>
                  <Button
                    variant="primary"
                    disabled={!myPick || !!gs?.selection_confirmed?.[userId]}
                    onClick={() => void confirmSelection()}
                  >
                    {gs?.selection_confirmed?.[userId] ? "Confirmed" : "Confirm"}
                  </Button>
                </div>
              </div>
            )}

            {phase === "main" && (
              <>
                <div className="flex items-center justify-between rounded-xl bg-tolly-panel/70 p-3">
                  <span className="text-sm font-semibold text-tolly-gold">
                    Main game
                  </span>
                  <div className="w-48">
                    <Timer
                      remaining={mainRemaining}
                      total={mainTimerSeconds(lobby?.celebrity_count ?? 20)}
                      danger={mainRemaining <= 30}
                    />
                  </div>
                </div>
                <GameBoard
                  celebrities={celebrities}
                  eliminated={gs?.eliminated?.[userId] ?? []}
                  phase="main"
                  onToggleEliminate={toggleEliminate}
                  onSelectCharacter={() => { }}
                />
                <GuessBar
                  celebrities={celebrities}
                  eliminated={gs?.eliminated?.[userId] ?? []}
                  onGuess={(id) => void submitGuess(id)}
                />
              </>
            )}

            {phase === "ended" && (
              <EndView
                won={gs?.winner === userId}
                wonByGuess={gs?.won_by_guess ?? null}
                opponentChar={
                  celebrities.find((c) => c.id === gs?.selections[remoteId ?? ""])
                    ?.name
                }
                isCreator={isCreator}
                onPlayAgain={playAgain}
              />
            )}
          </div>
        </div>
      )}

      {/* Confirmation modal for the truth-holder */}
      {pendingIsForMe && phase === "main" && (
        <ConfirmModal
          guessedName={
            celebrities.find((c) => c.id === gs?.pending_guess?.celebrityId)
              ?.name ?? "?"
          }
          isCorrect={
            gs?.selections[userId] === gs?.pending_guess?.celebrityId
          }
          onConfirm={() => void confirmGuess(true)}
          onReject={() => void confirmGuess(false)}
        />
      )}
    </div>
  );
}

// ---------- small presentational helpers ----------
function emptyState(): GameState {
  return {
    celebrities: [],
    selection_started_at: null,
    selections: {},
    selection_confirmed: {},
    main_started_at: null,
    eliminated: {},
    pending_guess: null,
    winner: null,
    won_by_guess: null,
    ended_at: null,
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">{children}</div>
  );
}

function Header({
  code,
  status,
  mode,
  isCreator,
  onStart,
}: {
  code?: string;
  status?: string;
  mode?: "online" | "local";
  isCreator: boolean;
  onStart: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-xl bg-tolly-panel/70 px-4 py-3">
      <div>
        <h1 className="text-lg font-bold text-tolly-gold">Tollywood Guess Who?</h1>
        {code && (
          <p className="text-xs text-tolly-muted">
            Lobby <span className="tracking-widest text-white">{code}</span> ·{" "}
            {status}
            {mode && (
              <>
                {" · "}
                <span className="text-tolly-gold/80 capitalize">{mode}</span>
              </>
            )}
          </p>
        )}
      </div>
      {isCreator && status === "ready" && (
        <Button onClick={onStart}>Start Game</Button>
      )}
    </div>
  );
}

function WaitingView({
  isCreator,
  hasGuest,
  onStart,
  code,
}: {
  isCreator: boolean;
  hasGuest: boolean;
  onStart: () => void;
  code?: string;
}) {
  return (
    <div className="rounded-2xl bg-tolly-panel/70 p-8 text-center">
      <h2 className="mb-2 text-xl font-bold text-tolly-gold">
        {hasGuest ? "Opponent joined!" : "Waiting for an opponent…"}
      </h2>
      <p className="mb-4 text-sm text-tolly-muted">
        Share this lobby code:{" "}
        <span className="tracking-widest text-white">{code}</span>
      </p>
      {isCreator ? (
        !hasGuest ? (
          <p className="text-sm text-tolly-muted">
            Once they join, click <b>Start Game</b> (appears top-right).
          </p>
        ) : (
          <Button onClick={onStart}>Start Game</Button>
        )
      ) : (
        <p className="text-sm text-tolly-muted">
          Waiting for the host to start the game…
        </p>
      )}
    </div>
  );
}

function GuessBar({
  celebrities,
  eliminated,
  onGuess,
}: {
  celebrities: Celebrity[];
  eliminated: string[];
  onGuess: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const remaining = celebrities.filter((c) => !eliminated.includes(c.id));
  return (
    <div className="rounded-xl bg-tolly-panel/70 p-3">
      <details open={open} onToggle={(e) => setOpen((e.target as any).open)}>
        <summary className="cursor-pointer text-sm font-semibold text-tolly-gold">
          Make a guess ({remaining.length} left)
        </summary>
        <p className="my-2 text-xs text-tolly-muted">
          Pick who you think the opponent is. They must confirm it&apos;s right.
        </p>
        <div className="grid max-h-48 grid-cols-3 gap-1 overflow-y-auto sm:grid-cols-4">
          {remaining.map((c) => (
            <button
              key={c.id}
              onClick={() => onGuess(c.id)}
              className="rounded-lg border border-white/10 px-2 py-2 text-xs text-white hover:border-tolly-gold"
            >
              {c.name}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function ConfirmModal({
  guessedName,
  isCorrect,
  onConfirm,
  onReject,
}: {
  guessedName: string;
  isCorrect: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-tolly-panel p-6 shadow-2xl">
        <h3 className="mb-1 text-lg font-bold text-white">Confirm guess</h3>
        <p className="mb-4 text-sm text-tolly-muted">
          Opponent guessed{" "}
          <span className="font-semibold text-tolly-gold">{guessedName}</span>.
        </p>
        {isCorrect ? (
          <>
            <p className="mb-4 text-sm text-red-300">
              That&apos;s correct — confirming ends the game and you lose.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={onConfirm}>
                Confirm (I lose)
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-green-300">
              That&apos;s wrong — reject it and keep playing.
            </p>
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={onReject}>
                Reject (wrong)
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EndView({
  won,
  wonByGuess,
  opponentChar,
  isCreator,
  onPlayAgain,
}: {
  won: boolean;
  wonByGuess: boolean | null;
  opponentChar?: string;
  isCreator: boolean;
  onPlayAgain: () => void;
}) {
  return (
    <div className="rounded-2xl bg-tolly-panel/70 p-8 text-center animate-fade-in">
      <h2
        className={`mb-2 text-2xl font-bold ${won ? "text-tolly-gold" : "text-red-400"}`}
      >
        {won ? "🎉 You win!" : "You lost"}
      </h2>
      {opponentChar && (
        <p className="text-sm text-tolly-muted">
          Opponent was <span className="font-semibold text-white">{opponentChar}</span>.
        </p>
      )}
      <p className="mt-2 text-xs text-tolly-muted">
        {wonByGuess ? "Won by correct guess." : "Decided by elimination at time-up."}
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button onClick={onPlayAgain} variant="primary">
          Play Again (Rematch)
        </Button>
        <Link
          href="/"
          className="rounded-xl bg-tolly-red/80 hover:bg-tolly-red px-6 py-2 text-sm font-semibold text-white transition-colors flex items-center justify-center"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
