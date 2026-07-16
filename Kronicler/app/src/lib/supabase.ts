import { createClient } from "@supabase/supabase-js";

// Public Supabase project config. The publishable (anon) key is designed to be
// shipped in the browser — Row-Level Security is the security boundary, not key
// secrecy — so these are safe to commit. Baked in as defaults so the deployed
// app works regardless of host env-var configuration; a well-formed env var
// still overrides (for pointing at a different project), but a missing or
// malformed one falls back to the correct values instead of breaking sign-in.
const DEFAULT_URL = "https://lluszbukkqlohzvjdajb.supabase.co";
const DEFAULT_ANON_KEY = "sb_publishable_Wo0VjGZWGwdF8LYMFEPIVA_xLbM3e9L";

const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const url = envUrl && envUrl.startsWith("http") ? envUrl : DEFAULT_URL;
const anonKey = envKey && /^(sb_|eyJ)/.test(envKey) ? envKey : DEFAULT_ANON_KEY;

export const supabase = createClient(url, anonKey);
