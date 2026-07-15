import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import Auth from "../components/Auth";
import Home from "../components/Home";
import Spinner from "../components/Spinner";

export default function LandingPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-tolly-ink">
        <Spinner label="Loading…" />
      </main>
    );
  }

  // Navigate to the dedicated room route so the URL is the source of truth
  // and a browser refresh during a match no longer kicks you to the lobby list.
  function goToRoom(lobby: { id: string }) {
    void router.push(`/room/${lobby.id}`);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-tolly-ink to-black">
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        {!session ? (
          <>
            <Brand />
            <Auth />
          </>
        ) : (
          <>
            <Brand />
            <Home userId={session.user.id} onEnterLobby={goToRoom} />
          </>
        )}
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight text-tolly-gold sm:text-4xl">
        Tollywood <span className="text-tolly-red">Guess Who?</span>
      </h1>
      <p className="mt-1 text-sm text-tolly-muted">
        Real-time 1v1 · video, chat &amp; a battle of deduction
      </p>
    </div>
  );
}
