# AIO TaskSync

Middleware that syncs Asana project tasks as notes on HubSpot company and deal timelines.

## Features

- **Mapping Interface** — Browse all your HubSpot companies and deals, assign an Asana project to each via dropdown
- **One-Click Sync** — Pulls tasks from mapped Asana projects and creates formatted notes on HubSpot timelines
- **User Management** — Admin can add/remove users with username & password auth
- **Vercel Ready** — Deploys as a Next.js app on Vercel

## How It Works

1. Admin sets Asana and HubSpot API tokens as environment variables
2. Users log in and see all HubSpot companies/deals in a searchable list
3. For each company/deal, select the matching Asana project from the dropdown
4. Click **Sync Now** — the app fetches all tasks from each mapped project and creates a summary note on the HubSpot timeline showing open tasks, assignees, due dates, and completed work

## Setup

### 1. Environment Variables

Set these in Vercel (Settings > Environment Variables):

| Variable | Description |
|---|---|
| `ASANA_TOKEN` | Asana Personal Access Token |
| `HUBSPOT_TOKEN` | HubSpot Private App token (needs scopes: `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.notes.write`) |
| `JWT_SECRET` | Random secret string for session tokens |
| `ADMIN_EMAIL` | Email for the initial admin account |
| `ADMIN_PASSWORD` | Password for the initial admin account |

### 2. Deploy to Vercel

1. Connect this repo to Vercel
2. Add the environment variables above
3. Deploy — Vercel auto-detects Next.js

### 3. First Login

Use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set. The admin account is created automatically on first login.

## Local Development

```bash
npm install
cp .env.example .env   # fill in your tokens
npm run dev
```

Open http://localhost:3000

## Important Notes

- **Storage**: Mappings are stored in the filesystem. On Vercel serverless, `/tmp` is used which resets between cold starts. For production persistence, consider adding Vercel KV or a database.
- **Rate Limits**: The sync processes mappings sequentially to respect API rate limits.
- **HubSpot Scopes**: Your HubSpot Private App needs read access to companies and deals, plus write access to notes.
