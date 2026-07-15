import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface a clear error early instead of failing cryptically later.
  console.error(
    "Missing Supabase env vars. Copy .env.example to .env.local and fill in " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

// Single shared browser-side Supabase client.
export const supabase = createClient(
  supabaseUrl as string,
  supabaseAnonKey as string,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // IMPORTANT: We use Email **OTP** (a 6-digit code the user types in).
      // If we let Supabase detect a session in the URL, any magic-link style
      // email would auto-log the user straight into the lobby and skip the
      // code step. Disabling this forces the code-verification flow.
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
);
