# Servelless — Application Functionality Overview

A zero-friction **SaaS App Marketplace** where non-technical users launch utility
micro-apps (PDF converters, image tools, CSV parsers, media utilities) on free
third-party cloud engines with a single click — no terminal, no token copying,
no manual configuration. Data persists across restarts automatically.

- Framework: **Next.js 15 (App Router)** + **React 19** + **TypeScript**
- Database: **PostgreSQL** via **Prisma 6**
- Styling: **Tailwind CSS** + shadcn-style UI components + **lucide-react** icons
- Validation: **Zod** on every API endpoint
- Sessions: **jose** HS256 JWT in an httpOnly cookie
- Token security: **AES-256-GCM** encryption at rest

---

## 1. How the app currently works (end to end)

### 1.1 The storefront experience

```
User opens /
   │
   ├─ Browser the app grid (search by name / description)
   │
   └─ Clicks "Launch App"
        │
        ├─ Not signed in?  → redirect to /login
        │                     (dev email sign-in or Google/GitHub OAuth)
        │
        ├─ Engine not yet authorized?  → 428 response
        │     └─ "Authorize App Engine" modal  → 1-click OAuth consent
        │           └─ tokens saved encrypted → auto-resume launch
        │
        └─ Engine authorized?  → cloud orchestration runs
              ├─ Fly.io      → volume + container provisioned, HTTPS URL returned
              └─ Codespaces  → codespaces.new launch link generated
                    └─ "App is launching" success modal + dashboard link
```

**The zero-click promise:** signing in and authorizing an engine happen **once**.
Every subsequent launch of that engine requires zero clicks.

### 1.2 Auth flow

| Step | Route | Behavior |
|---|---|---|
| Google / GitHub sign-in | `GET /api/auth/login/[provider]` | Redirects to the provider consent screen with a signed CSRF `state` |
| Provider callback | `GET /api/auth/callback/[provider]` | Exchanges code, fetches profile, upserts `User`, sets JWT session cookie, redirects to `/` |
| Dev sign-in (local only) | `POST /api/auth/dev-login` | Email-based login, only active when `DEV_LOGIN=true` (or not production) |
| Sign out | `POST /api/auth/logout` | Deletes the session cookie |
| Session info | `GET /api/me` | Returns current user, connected engines, deployment count |

- The session JWT is signed with `SESSION_SECRET` (HS256), expires in 30 days.
- Admin status is derived from `ADMIN_EMAILS` (comma-separated env var).
- The login page is at `/login`; it hides the dev sign-in unless `NEXT_PUBLIC_DEV_LOGIN=true`.

### 1.3 Engine OAuth consent (one-time credential capture)

| Step | Route | Behavior |
|---|---|---|
| Authorize Fly | `GET /api/oauth/fly?appId=…` | Starts Fly OAuth, stores a `pending_launch` cookie |
| Authorize GitHub | `GET /api/oauth/github?appId=…` | Starts GitHub OAuth (codespace scopes), stores `pending_launch` |
| Callback | `GET /api/oauth/[engine]/callback` | Exchanges code → encrypts access/refresh token with AES-256-GCM → saves to `UserCredential` → redirects to `/?engine=connected&launch=<appId>` |
| Disconnect | `DELETE /api/credentials/[engine]` | Deletes the stored credential |

- `state` values are validated against a short-lived httpOnly cookie (CSRF protection).
- After a successful consent the app **auto-resumes the pending launch** (the storefront reads the `?launch=` param).

### 1.4 Deployment orchestration

Entry point: **`POST /api/deploy`** with body `{ "appId": "uuid" }`.

**Step 0 — authorization check**
1. Verifies the session (`401` if not signed in).
2. Looks up the `AppProduct`.
3. Checks the user's `UserCredential` for the app's engine.
4. Missing credential → **`428`** `{ needsEngineAuth, engine, oauthUrl }` so the UI can show the consent modal.

**Step A — Fly.io engine (`OAUTH_CLOUD_FLY`)**
```
1. ensureFlyApp(name)        → GET/POST /v1/apps/{name}   (namespace in user's org)
2. provisionVolume()         → POST /v1/apps/{name}/volumes  (1 GB, mounted at /data)
3. createMachine()           → POST /v1/apps/{name}/machines
       image      = the registered Docker image
       mount      = the volume at /data
       services   = TCP on targetPort, HTTPS (443 + 80) auto TLS
4. instanceUrl  = https://<machine-name>.<app>.fly.dev
5. Deployment row created (status RUNNING or PROVISIONING)
```

**Step B — GitHub Codespaces engine (`GITHUB_CODESPACES`)**
```
1. buildCodespacesLaunch(repoUrl, { ref: "main", port: targetPort })
       → https://codespaces.new/<org>/<repo>?ref=main&port=<port>
2. Deployment row created (status RUNNING) with instanceUrl = the launch link
```

The `.devcontainer.json` in the registered repo is expected to forward/publish
the target port (a fragment generator lives in
`src/lib/engines/codespaces.ts`).

### 1.5 Deployment lifecycle (dashboard)

| Route | Behavior |
|---|---|
| `GET /api/deployments` | Lists the signed-in user's deployments (with app info) |
| `DELETE /api/deployments/[id]` | Stops the user's deployment; best-effort Fly machine cleanup |

---

## 2. Database schema (Prisma)

Models: `User`, `UserCredential`, `AppProduct`, `Deployment`.

```
User ──< UserCredential        (accessToken/refreshToken AES-256-GCM encrypted)
  └──< Deployment >── AppProduct

LaunchEngine enum:  OAUTH_CLOUD_FLY | GITHUB_CODESPACES
DeploymentStatus:   PROVISIONING | RUNNING | STOPPED | ERROR
```

`UserCredential` is unique per `(userId, provider)` — one encrypted token set
per engine per user. `AppProduct` holds either a `dockerImage` (Fly) or a
`gitHubRepoUrl` (Codespaces) plus `engineType` and `targetPort`.

---

## 3. API surface summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/apps` | public | Marketplace catalog |
| GET | `/api/me` | session | Current user + connected engines |
| POST | `/api/deploy` | session | Launch an app (orchestration) |
| GET | `/api/deployments` | session | User's deployments |
| DELETE | `/api/deployments/[id]` | session | Stop a deployment |
| GET | `/api/auth/login/[provider]` | public | Google / GitHub login start |
| GET | `/api/auth/callback/[provider]` | public | OAuth callback |
| POST | `/api/auth/dev-login` | dev-only | Email sign-in (local) |
| POST | `/api/auth/logout` | session | Sign out |
| GET | `/api/oauth/[engine]` | session | Engine consent start |
| GET | `/api/oauth/[engine]/callback` | session | Engine token storage |
| DELETE | `/api/credentials/[engine]` | session | Disconnect engine |
| GET | `/api/admin/products` | admin | List catalog |
| POST | `/api/admin/products` | admin | Create app listing |
| PATCH | `/api/admin/products/[id]` | admin | Update app listing |
| DELETE | `/api/admin/products/[id]` | admin | Delete app listing |
| GET | `/api/admin/stats` | admin | Fleet metrics |

Middleware (`src/middleware.ts`) enforces: `/admin/*` → admins only,
`/dashboard/*` → signed-in users only; everything else redirects to `/login?next=…`.

---

## 4. UI screens

| Screen | Route | Description |
|---|---|---|
| Storefront | `/` | Searchable app grid, Launch buttons, consent + success modals, auto-resume flow |
| Login | `/login` | OAuth buttons + dev email sign-in (gated) |
| User dashboard | `/dashboard` | Engine connection cards (connect/disconnect) + running instances table (open / stop) |
| Admin fleet dashboard | `/admin` | Stats: users, deployments, active instances, catalog size, status breakdown, recent activity |
| Admin catalog | `/admin/products` | Full CRUD: title, slug, description, icon, port, engine, Docker image / GitHub repo |

---

## 5. Security model

- **AES-256-GCM** encryption for all OAuth tokens (`src/lib/crypto.ts`), keyed by
  `ENCRYPTION_KEY`. Format: `[12-byte IV][16-byte auth tag][ciphertext]` base64.
- **httpOnly + SameSite=Lax** session cookie (JWT, HS256, 30-day expiry).
- **CSRF state** on every OAuth flow, bound to a short-lived httpOnly cookie.
- **Zod validation** on all request bodies (product schema, deploy, dev-login).
- **Admin authorization** enforced twice: edge middleware + server-side `requireAdmin()`.
- Tokens are never exposed to the browser — decryption happens only server-side
  in `src/lib/credentials.ts`.

---

## 6. Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Signs the session JWT (`openssl rand -base64 48`) |
| `ENCRYPTION_KEY` | AES-256-GCM key (`openssl rand -base64 32`) |
| `ADMIN_EMAILS` | Comma-separated admin emails |
| `NEXT_PUBLIC_APP_URL` | Public base URL (must match OAuth callback URLs) |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth (user login) |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth (user login) |
| `FLY_OAUTH_CLIENT_ID/SECRET` | Fly.io OAuth (engine consent) |
| `FLY_ORG` | Default Fly organization override (defaults to user's personal org) |
| `GITHUB_ENGINE_CLIENT_ID/SECRET` | GitHub OAuth for the Codespaces engine |
| `DEV_LOGIN`, `NEXT_PUBLIC_DEV_LOGIN` | Enable dev-only email sign-in (never in production) |

---

## 7. What works today vs. what needs real credentials

**Verified working (local, without any third-party accounts):**
- Full storefront with 6 seeded apps, search, and Launch flow
- Dev email sign-in + session cookies + middleware protection
- One-click engine-consent trigger (`428` → consent modal)
- Codespaces deployments (launch URL generation + DB records)
- Admin catalog CRUD and fleet dashboard
- AES-256-GCM token round-trip, encrypted credential storage
- Deployment list, stop/delete, engine connect/disconnect UI

**Requires real OAuth credentials to exercise live:**
- Google / GitHub login callbacks
- Fly.io machine orchestration (volume + container provisioning) — the Fly
  Machine API is fully wired in `src/lib/engines/fly.ts` but needs a valid
  `FLY_OAUTH_CLIENT_ID/SECRET` and a Fly account

---

## 8. Running it

```bash
# 1. Start Postgres and set DATABASE_URL (see .env.example)
docker run --name servelless-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=servelless -p 5432:5432 -d postgres:16-alpine

# 2. Configure .env (copy .env.example, generate secrets)

# 3. Sync schema + seed catalog
npx prisma db push
npm run db:seed

# 4. Run
npm run dev          # development
# or
npm run build && npm run start   # production
```

Then open:
- Storefront → `http://localhost:3000/`
- Login (admin UI) → `http://localhost:3000/login` (dev sign-in: `admin@servelless.app`)
- Admin panel → `http://localhost:3000/admin`
- User dashboard → `http://localhost:3000/dashboard`
