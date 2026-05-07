# Tazkarti Watcher

A Vercel serverless function that scrapes [tazkarti.com](https://www.tazkarti.com/#/matches) for football match tickets and sends a Gmail notification when a match for your configured team appears.

Triggered every 30 minutes by [cron-job.org](https://cron-job.org).

---

## Setup

### 1. Clone & install

```bash
git clone <your-repo-url>
cd tazkarti-watcher
npm install
```

### 2. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values (see **Environment Variables** below).

---

## Environment Variables

| Variable | Description |
|---|---|
| `TEAM_NAME` | Team to watch — partial, case-insensitive (e.g. `Al Ahly`) |
| `TAZKARTI_URL` | Matches page URL (default: `https://www.tazkarti.com/#/matches`) |
| `GMAIL_USER` | Your Gmail address |
| `GMAIL_APP_PASSWORD` | Gmail App Password (see below) |
| `NOTIFY_TO` | Email address to send notifications to |
| `CRON_SECRET` | A long random string to secure the endpoint |

Vercel KV variables (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`) are **auto-injected** when you link a KV database — do not set them manually.

### Gmail App Password

1. Go to [Google Account](https://myaccount.google.com) → **Security**
2. Enable **2-Step Verification** if not already on
3. Search for **App Passwords** (under "How you sign in to Google")
4. Create a new app password — select **Mail** / **Other** (name it "Tazkarti Watcher")
5. Copy the 16-character password into `GMAIL_APP_PASSWORD`

---

## Database Setup (Prisma + PostgreSQL)

You can use any PostgreSQL provider (Supabase, Railway, Neon, Render, etc.).

1. Create a PostgreSQL database on your provider of choice
2. Copy the connection string into `DATABASE_URL` in `.env.local`
3. Run the migration to create the `seen_matches` table:
   ```bash
   npx prisma migrate deploy
   ```
   Or for local development, to create and apply a migration:
   ```bash
   npx prisma migrate dev --name init
   ```
4. Generate the Prisma client (required after any schema change):
   ```bash
   npx prisma generate
   ```

Set `DATABASE_URL` in the **Vercel dashboard** (Project → Settings → Environment Variables) for production.

> **Tip**: Run `npm run db:studio` to open Prisma Studio and browse the `seen_matches` table visually.

---

## Deploy to Vercel

### Option A — GitHub auto-deploy (recommended)

1. Push this repo to GitHub
2. Go to [Vercel](https://vercel.com) → **Add New Project** → import your repo
3. Vercel detects the `api/` folder automatically
4. Set environment variables in **Project → Settings → Environment Variables**

### Option B — CLI deploy

```bash
npm install -g vercel
vercel deploy
```

After first deploy, set env vars in the Vercel dashboard or via:

```bash
vercel env add TEAM_NAME
vercel env add GMAIL_USER
# ... etc
```

---

## Securing the Endpoint with CRON_SECRET

Add `CRON_SECRET` to your Vercel environment variables. The handler rejects any request missing this header with a `401`.

When configuring cron-job.org, add the header:
```
x-cron-secret: <your-secret-value>
```

---

## cron-job.org Setup

1. Create a free account at [cron-job.org](https://cron-job.org)
2. Click **Create cronjob**:
   - **URL**: `https://your-project.vercel.app/api/check`
   - **Schedule**: Every 30 minutes
   - **Request method**: GET
   - **Headers**: Add `x-cron-secret` → your secret value
3. Save and enable

Execution history and response codes are visible in the cron-job.org dashboard.

---

## Local Development

```bash
npm install -g vercel
vercel dev
```

This emulates the Vercel serverless environment locally, including env vars from `.env.local`.

Call the endpoint:
```bash
curl -H "x-cron-secret: your-secret" http://localhost:3000/api/check
```

> **Note**: `@sparticuz/chromium` downloads a Chromium binary on first run. On macOS/Linux local dev you can also use the full `playwright` package to speed up local iteration — just swap it back before deploying.

---

## Changing the Watched Team

Update `TEAM_NAME` in your Vercel environment variables (Project → Settings → Environment Variables) and redeploy (or it takes effect on the next invocation if you use `vercel env pull`).

The value is a **case-insensitive partial match** against both home and away team names on each match card.

---

## How It Works

1. cron-job.org calls `GET /api/check` every 30 minutes with the secret header
2. The handler launches headless Chromium via `@sparticuz/chromium` + `playwright-core`
3. Navigates to tazkarti.com, clicks "View More" until all matches are loaded
4. Scrapes all match cards and filters by `TEAM_NAME`
5. For each match, checks Vercel KV — if not seen before, saves it and sends a Gmail notification
6. Returns a JSON summary of what was found and notified
