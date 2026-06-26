# AIO TaskSync

## Overview
AIO TaskSync is middleware that syncs Asana project tasks onto HubSpot company and deal timelines as formatted notes. Users map each HubSpot company/deal to an Asana project through a web UI; a sync (manual via button, or automatic via a daily Vercel cron) fetches all tasks (grouped by section, with nested subtasks) from each mapped project and writes a single HTML summary note to the associated HubSpot object. It is a small Next.js App Router app deployed on Vercel, with username/password auth and an admin user-management screen.

## Tech Stack
- **Language:** TypeScript (strict mode), targeting ES5 / esnext modules.
- **Framework:** Next.js 14 (App Router) + React 18 / react-dom.
- **Auth:** `jsonwebtoken` (JWT in an httpOnly cookie) + `bcryptjs` (password hashing) + `cookie` (serialization).
- **Storage:** `@vercel/kv` (Redis) in production; local JSON files under `data/` for development (see `src/lib/store.ts`).
- **External APIs:** Asana REST API (`app.asana.com/api/1.0`) and HubSpot CRM v3/v4 API (`api.hubapi.com`).
- **Deploy/hosting:** Vercel (`vercel.json`, `.vercel/`).
- No test framework, linter, or CSS framework is configured. Styling is inline + `src/app/globals.css`.

## Architecture
Three layers, all under `src/`:

1. **`src/lib/` — core logic (server-side):**
   - `store.ts` — persistence abstraction. Uses Vercel KV when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set, otherwise falls back to JSON files in `data/`. Defines the `User`, `Mapping`, `Mappings`, and `SyncState` types and CRUD helpers for users / mappings / sync state.
   - `auth.ts` — password hashing, JWT create/verify, session reading from the `aiotasksync_token` cookie, `requireAuth()` / `requireAdmin()` guards, and `ensureAdminUser()` (bootstraps the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` on first run when no users exist).
   - `asana.ts` — Asana client with retry/backoff on 429/5xx. Fetches workspaces, projects, sections, section tasks (paginated), and recursive subtasks (max depth 3).
   - `hubspot.ts` — HubSpot client with retry/backoff. Searches companies/deals, creates/deletes notes, and finds existing sync notes by marker text.
   - `sync.ts` — orchestration. Builds the HTML note from sectioned Asana tasks (`buildProjectNote`), then for each mapping deletes old sync notes and creates a fresh one. Runs mappings through a bounded concurrency pool (`SYNC_CONCURRENCY = 5`). Exposes `runFullSync` (used by cron) and `runStreamingSync` (used by the UI for SSE progress).

2. **`src/app/api/` — route handlers** that wrap the lib layer with auth guards (see Key Files below).

3. **`src/app/` — UI pages** (`page.tsx` mapping/sync dashboard, `login/`, `admin/`) — all client components.

`src/middleware.ts` runs on every non-static request, enforcing auth: it lets through `/login`, `/api/auth/login`, `GET /api/sync` (cron), and `GET /api/report/*`; everything else requires the `aiotasksync_token` cookie (401 for `/api/*`, redirect to `/login` for pages).

## Key Files & Entry Points
- `src/middleware.ts` — global auth gate; defines public vs. protected routes.
- `src/app/layout.tsx` — root layout + metadata.
- `src/app/page.tsx` — main dashboard: list HubSpot companies/deals, assign Asana projects, trigger sync (consumes the SSE stream from `POST /api/sync`).
- `src/app/login/page.tsx` — login screen.
- `src/app/admin/page.tsx` — admin user management UI.
- `src/app/api/sync/route.ts` — **`POST`** = manual streaming sync (Server-Sent Events, `maxDuration = 300`); **`GET`** = cron auto-sync, protected by `CRON_SECRET` bearer token.
- `src/app/api/sync/status/route.ts` — `GET` last-run info.
- `src/app/api/mappings/route.ts` — `GET`/`POST` the company/deal → project mappings.
- `src/app/api/auth/{login,logout,me}/route.ts` — session endpoints.
- `src/app/api/admin/users/route.ts` — admin-only `GET`/`POST`/`PATCH`/`DELETE` user management.
- `src/app/api/hubspot/{companies,deals}/route.ts` — search proxies for the mapping UI.
- `src/app/api/asana/{workspaces,projects}/route.ts` — Asana lookups for the dropdowns.
- `src/app/api/report/projects/route.ts` — `GET` Asana-wide project report (scans sections for go-live/activation/churn markers). Note: auth is best-effort here (allows unauthenticated — see Gotchas).
- `vercel.json` — Vercel config; registers the cron `GET /api/sync` at `30 16 * * *` (16:30 UTC daily).
- `.env.example` — required environment variables (copy to `.env` for local dev).

## Build / Run / Test
From `package.json` (no test/lint scripts exist):
```bash
npm install
cp .env.example .env   # then fill in tokens
npm run dev            # next dev — http://localhost:3000
npm run build          # next build
npm run start          # next start (production server)
```
Deployment: push to the Vercel-connected repo; Vercel auto-detects Next.js and runs `next build`. Set env vars in Vercel project settings.

**Required environment variables** (`.env.example`):
- `ASANA_TOKEN` — Asana Personal Access Token.
- `HUBSPOT_TOKEN` — HubSpot Private App token. Scopes: `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.notes.write`.
- `JWT_SECRET` — secret for signing session tokens (defaults to `dev-secret-change-me` if unset — set it in prod).
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — initial admin, created on first login (defaults to `admin@admin.com` / `admin123` if unset).
- `CRON_SECRET` — protects `GET /api/sync`; Vercel auto-sets this. Only required for cron.
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — not in `.env.example`; when both are set, storage uses Vercel KV instead of the filesystem.

## Conventions & Gotchas
- **Storage is filesystem in dev, KV in prod.** Locally, users/mappings/sync-state are JSON files in `data/` (gitignored). On Vercel serverless the filesystem is ephemeral (`/tmp`-like, resets between cold starts), so **Vercel KV must be configured for any persistence** — otherwise mappings and users will not survive. `store.ts` switches automatically based on the presence of the two `KV_REST_API_*` env vars.
- **Admin bootstrap is lazy.** The admin account is created on the first call to `ensureAdminUser()` (invoked by `/api/auth/login` and `/api/auth/me`) only when there are zero users. Change `ADMIN_*` *before* first login.
- **Sync always fully regenerates notes.** `syncOne` ignores Asana's project-level `modified_at` (it doesn't reflect subtask changes), so every run deletes old sync notes and rewrites them. This is intentional given the small (~20) mapping count.
- **Sync note identification** relies on a text marker: notes whose `hs_note_body` contains `aiotasksync` or `AIO TaskSync` are treated as sync-managed and get deleted/replaced (`hubspot.ts: findSyncNotes`). The footer string `"by AIO TaskSync"` in `buildProjectNote` provides this marker — don't remove it.
- **HubSpot association type IDs are hardcoded:** `190` for company↔note, `214` for deal↔note (`hubspot.ts: createNote`).
- **Rate limiting** is handled by retry/backoff (429 + 5xx, honoring `Retry-After`) in both `asana.ts` and `hubspot.ts`; the sync pool concurrency is 5.
- **`GET /api/report/projects` allows unauthenticated access** ("temporary" per the code comment) and is also whitelisted in middleware. Treat as a known exposure.
- **Path alias:** `@/*` maps to `./src/*` (`tsconfig.json`).
- Cookie name is `aiotasksync_token` (httpOnly, 7-day expiry, `secure` only in production).
- The cron schedule `30 16 * * *` is **UTC** (Vercel crons run in UTC).
