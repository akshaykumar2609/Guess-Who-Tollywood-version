import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Button from "./Button";

/**
 * Passwordless login via Supabase Email OTP. The user gets a 6-digit code by
 * email; the same component handles both "send code" and "verify code" states.
 */
export default function Auth() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function signInGuest() {
    setGuestLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInAnonymously();
    setGuestLoading(false);
    if (error) setError(error.message);
    // On success the parent's onAuthStateChange re-renders into the lobby list.
  }
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // We deliberately do NOT pass emailRedirectTo / we rely on a 6-digit
        // code. Combined with detectSessionInUrl:false in the client, the
        // emailed link is inert and the user MUST enter the code below.
        data: { otp_type: "code" },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
    setInfo("We emailed you an 8-digit code. Enter it below to sign in.");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) setError(error.message);
    // On success, the onAuthStateChange listener in the parent re-renders.
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-tolly-panel/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">
      <h2 className="mb-1 text-xl font-bold text-tolly-gold">
        {sent ? "Enter your code" : "Sign in to play"}
      </h2>
      <p className="mb-5 text-sm text-tolly-muted">
        Passwordless. We&apos;ll email you a one-time code.
      </p>

      {!sent ? (
        <form onSubmit={sendCode} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-white/10 bg-tolly-ink px-4 py-2.5 text-sm text-white outline-none focus:border-tolly-gold"
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="12345678"
            className="w-full rounded-xl border border-white/10 bg-tolly-ink px-4 py-2.5 text-center text-lg tracking-[0.3em] text-white outline-none focus:border-tolly-gold"
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Verifying…" : "Verify"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setInfo(null);
            }}
            className="w-full text-xs text-tolly-muted hover:text-white"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {info && <p className="mt-4 text-sm text-tolly-gold/80">{info}</p>}

      <div className="my-4 flex items-center gap-3 text-xs text-tolly-muted">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <Button
        variant="secondary"
        onClick={() => void signInGuest()}
        disabled={guestLoading}
        className="w-full"
      >
        {guestLoading ? "Entering…" : "Continue as guest"}
      </Button>
      <p className="mt-2 text-center text-xs text-tolly-muted">
        No email needed — you can still create or join lobbies.
      </p>
    </div>
  );
}
