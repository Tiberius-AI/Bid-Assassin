if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error("VITE_SUPABASE_ANON_KEY is required. Add it to your .env file.");
}
if (!import.meta.env.VITE_SUPABASE_URL) {
  throw new Error("VITE_SUPABASE_URL is required. Add it to your .env file.");
}

export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
