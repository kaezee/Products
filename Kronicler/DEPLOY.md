# Deploying Kronicler

The app is a static Vite/React bundle talking to the live Supabase project.
Any static host works; these are the two easiest, done from the browser — no
command line, no tokens.

The one-time settings a host needs:

| Setting | Value |
|---|---|
| Root directory | `Kronicler/app` |
| Framework | Vite (auto-detected) |
| Build command | `npm run build` (default) |
| Output directory | `dist` (default) |
| Env var `VITE_SUPABASE_URL` | `https://lluszbukkqlohzvjdajb.supabase.co` |
| Env var `VITE_SUPABASE_ANON_KEY` | `sb_publishable_Wo0VjGZWGwdF8LYMFEPIVA_xLbM3e9L` |

(The anon/publishable key is safe in the browser — Row-Level Security protects
the data, not the key.)

## Option A — Vercel (recommended)

1. Go to **vercel.com** and sign in with your **GitHub** account.
2. **Add New → Project**, and import the `kaezee/products` repo.
3. Set **Root Directory** to `Kronicler/app`.
4. Under **Environment Variables**, add the two rows from the table above.
5. Set the **Production Branch** to whatever branch this work lives on (see
   the chat — it's the `claude/...` branch unless we've merged to `main`).
6. **Deploy.** You'll get a URL like `kronicler.vercel.app`. It redeploys
   automatically every time new work is pushed.

## Option B — Netlify

1. Go to **netlify.com**, sign in with GitHub.
2. **Add new site → Import an existing project**, pick `kaezee/products`.
3. Set **Base directory** to `Kronicler/app`, build command `npm run build`,
   publish directory `Kronicler/app/dist`.
4. Add the two environment variables.
5. Set the production branch, then **Deploy**.

## Signing in

Sign in at the deployed URL with the account set up for you (credentials shared
in chat), then create your Zoonya world and start drafting. Change the password
from your own device once you're in.
