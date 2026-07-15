import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import GameRoom from "../../components/GameRoom";
import Spinner from "../../components/Spinner";

export default function RoomPage() {
  const router = useRouter();
  const { id } = router.query;
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-tolly-ink">
        <Spinner label="Loading…" />
      </main>
    );
  }

  if (!session) {
    router.replace("/");
    return (
      <main className="grid min-h-screen place-items-center bg-tolly-ink text-tolly-muted">
        Redirecting to sign in…
      </main>
    );
  }

  if (typeof id !== "string") {
    return (
      <main className="grid min-h-screen place-items-center bg-tolly-ink">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-tolly-ink to-black">
      <GameRoom
        lobbyId={id}
        userId={session.user.id}
        userName={session.user.email ?? "Player"}
      />
    </main>
  );
}
