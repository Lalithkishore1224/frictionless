# Servelless — Free Production Deployment Runbook (Vercel + Neon)

Target: a public `https://<you>.vercel.app` URL that **anyone with a Google or
GitHub account** can open, log in to, and (for Codespaces apps) launch.

> IMPORTANT limitation: the 5 Google **Cloud Shell** apps in the seed data use the
> `ssh2` native module, which **cannot run on free Vercel serverless**. On this
> deployment those 5 apps will fail at runtime. The **JSON Beautifier**
> (Codespaces) app works. This is a free-Vercel constraint, not an app bug.

---

## Part 0 — What you need (free accounts)

- [ ] **Neon** (Postgres) — https://neon.tech  (free tier)
- [ ] **Vercel** — https://vercel.com  (free Hobby tier, no card needed)
- [ ] A **GitHub** account (for login OAuth + the Codespaces engine OAuth)
- [ ] A **Google** account (for login OAuth)

No git repo / GitHub repo is strictly required: we deploy with the **Vercel CLI**
(`vercel deploy --prod`) which uploads the folder directly. You'll still create
OAuth apps in GitHub & Google developer consoles.

---

## Part 1 — Create the OAuth apps

### 1a. GitHub OAuth app (USER LOGIN)
1. github.com → Settings → Developer settings → **OAuth Apps → New OAuth App**
2. Homepage URL: `https://<you>.vercel.app`
3. Authorization callback URL: `https://<you>.vercel.app/api/auth/callback/github`
4. Create → copy **Client ID** → generate a **Client Secret**

### 1b. GitHub OAuth app (CODESPACES ENGINE)
Same console → **another** New OAuth App:
- Homepage URL: `https://<you>.vercel.app`
- Callback: `https://<you>.vercel.app/api/oauth/github/callback`
- Copy ID + Secret

> The **engine** app must have OAuth scopes for codespaces. If you were able to
> request scopes "codespace workflow repo read:user" at creation, good; GitHub
> scopes are per-app and for user apps these are granted. If scopes fail at
> runtime, the engine can't create codespaces (documented next to the dashboard).

### 1c. Google OAuth Client (USER LOGIN)
1. https://console.cloud.google.com → create/reuse a project → **APIs & Services → Credentials → Create Credentials → OAuth Client ID → Web app**
2. Authorized redirect URI: `https://<you>.vercel.app/api/auth/callback/google`
3. OAuth **consent screen**: set to **Production / publish** so ANY Google account can sign in (publishing for non-sensitive scopes is free — this removes the "add each email" testing limit).
4. Copy **Client ID** + **Secret**
5. (Optional) Enable the **Cloud Shell API** — not needed since we skip Cloud Shell apps on Vercel.

> Use the SAME Google client for both user-login and the (skipped) Cloud-Shell
> engine scope; on Vercel we don't run the Cloud Shell engine, so you only need
> the login scope `openid email profile`.

---

## Part 2 — Neon (Postgres) free database

1. https://neon.tech → sign in → **New Project** → pick a region → Create
2. On the dashboard copy the connection string for the `main` (or a dedicated) DB:
   ```
   postgresql://<user>:<pass>@ep-<xyz>.region.neon.tech/neondb?sslmode=require
   ```
   Increase the connect timeout to avoid cold-start timeouts (Neon free scales to zero).

---

## Part 3 — Generate the secrets (local, in the project folder)

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```

---

## Part 4 — Push the DB schema + seed (run locally, pointed at Neon)

```bash
cd /home/lalith/Pictures/Servelless-server

# 1. Export the Neon URL so prisma can reach it (replace with yours)
export DATABASE_URL="postgresql://<user>:<pass>@ep-<xyz>.neon.tech/neondb?sslmode=require"

# 2. Create tables
npx prisma db push

# 3. Seed the 6 apps
npm run db:seed
```

> Schema is expected to be empty on first push. `db push` creates it.

---

## Part 5 — Deploy to Vercel (CLI)

```bash
cd /home/lalith/Pictures/Servelless-server

# install the CLI
npm i -g vercel

# link / login (opens browser; Hobby, no card)
vercel login
vercel link

# set all env vars (repeat for each; use production scope)
vercel env add DATABASE_URL production
vercel env add SESSION_SECRET production
vercel env add ENCRYPTION_KEY production
vercel env add ADMIN_EMAILS production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add NEXT_PUBLIC_GOOGLE_CLIENT_ID production
vercel env add GITHUB_CLIENT_ID production
vercel env add GITHUB_CLIENT_SECRET production
vercel env add NEXT_PUBLIC_GITHUB_CLIENT_ID production
vercel env add GITHUB_ENGINE_CLIENT_ID production
vercel env add GITHUB_ENGINE_CLIENT_SECRET production
vercel env add DEV_LOGIN production    # value: false
vercel env add NEXT_PUBLIC_DEV_LOGIN production  # value: false

# deploy
vercel --prod
```

Copy the `.vercel.app` URL it prints.

---

## Part 6 — Fix the OAuth redirect URLs for the final domain

After the first `vercel --prod`, you may have a `.vercel.app` URL or a custom
domain. Update **every** authorized redirect URI (Parts 1a/1b/1c) to the final
domain. Also set `NEXT_PUBLIC_APP_URL` to that final URL and re-`vercel --prod`.

---

## Part 7 — Share & use

- Give anyone the `.vercel.app` link. They can **log in** with their own Google
  or GitHub account (no manual email whitelist — consent screen is published).
- They reach the **dashboard** and can authorize their own **GitHub Codespaces**
  engine and launch the **JSON Beautifier** app in their own codespace.
- Their Google Cloud Shell and Fly engines won't work on free Vercel (native
  `ssh2` module + serverless limits) — documented limitation.

---

## Verification checklist
- [ ] `/` loads the storefront
- [ ] `/login` lets a Google or GitHub sign-in complete (no 401)
- [ ] Dashboard shows connected engines and lets you authorize GitHub Codespaces
- [ ] JSON Beautifier (Codespaces) deploys and returns a live URL
