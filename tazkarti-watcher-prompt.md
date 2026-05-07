# Tazkarti Match Watcher — Claude Code Prompt

## Goal

Build a lightweight Node.js HTTP API (single endpoint) that acts as a **Tazkarti football match watcher**. It is designed to be called by a cron job. When called, it:

1. Opens `https://www.tazkarti.com/#/matches` using Playwright (headless Chromium)
2. Clicks "View More" repeatedly until the button is gone or disabled/dimmed
3. Scrapes all visible match cards
4. Checks if any match involves the **configured team**
5. If a match is found and **not already saved**, saves it and sends a Gmail email notification
6. Returns a JSON response summarizing what happened

---

## Deployment Target: Vercel

This API will be deployed to **Vercel** as a serverless function. This has critical implications for the architecture:

### Vercel Constraints to Handle

1. **No persistent filesystem** — Vercel functions are stateless. The `lowdb` JSON file approach will **not work** across invocations. Replace it with **Vercel KV** (Redis-based key-value store) using the `@vercel/kv` package to persist seen match IDs.

2. **No long-running processes** — Vercel functions have a max execution timeout (default 10s on Hobby, 60s on Pro). Playwright with Chromium is heavy. Use `@sparticuz/chromium` + `playwright-core` instead of the full `playwright` package — this is the standard approach for running Playwright on serverless/Vercel.

3. **No `node-cron`** — The cron trigger will come from **cron-job.org** calling the deployed Vercel URL. No internal scheduler is needed.

4. **API routes** — Structure the handler as a Vercel serverless function under `api/check.js` (or `api/check/route.js` if using Next.js API routes). Express is optional — a plain Vercel handler function is simpler.

5. **Environment variables** — All `.env` variables are set in the Vercel dashboard under Project → Settings → Environment Variables. No `.env` file is needed in production.

### Vercel-Specific File Structure

```
tazkarti-watcher/
├── api/
│   └── check.js          # Vercel serverless function (GET handler)
├── lib/
│   ├── watcher.js        # Playwright scraping logic
│   ├── notifier.js       # Gmail email sender
│   └── db.js             # Vercel KV persistence
├── .env.local            # Local dev only (never committed)
├── .env.example
└── package.json
```

### Securing the Endpoint

Since cron-job.org will call your public Vercel URL, add a simple secret token to prevent unauthorized calls:

Add to env vars:
```env
CRON_SECRET=some-long-random-string
```

In `api/check.js`, validate it:
```js
if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
  return res.status(401).json({ error: 'Unauthorized' })
}
```

Then in cron-job.org, add a request header `x-cron-secret: your-secret`.

### Playwright on Vercel

Use `@sparticuz/chromium` + `playwright-core`:

```js
import chromium from '@sparticuz/chromium'
import { chromium as playwrightChromium } from 'playwright-core'

const browser = await playwrightChromium.launch({
  args: chromium.args,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
})
```

Add to `package.json` dependencies:
```json
"@sparticuz/chromium": "^123.0.0",
"playwright-core": "^1.44.0"
```

Do **not** include the full `playwright` package — it bundles Chromium binaries that exceed Vercel's function size limit.

### Vercel KV — Persistence

Replace `lowdb` with `@vercel/kv`:

```js
import { kv } from '@vercel/kv'

export async function isMatchSeen(matchId) {
  const val = await kv.get(`match:${matchId}`)
  return val !== null
}

export async function saveMatch(match) {
  // Store with no expiry — or set TTL e.g. 90 days
  await kv.set(`match:${match.id}`, JSON.stringify(match))
}
```

Vercel KV must be enabled in the Vercel dashboard (Storage → Create KV Database → link to project). The `KV_URL`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` env vars are automatically injected.

### Vercel Serverless Handler Shape

```js
// api/check.js
export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') return res.status(405).end()
  // ... scrape, check, notify
  res.json({ ok: true, ... })
}
```

### Local Development

For local dev, install Vercel CLI and run:
```bash
npm i -g vercel
vercel dev
```

This emulates the serverless environment locally including env vars from `.env.local`.

---

## Tech Stack

- **Runtime**: Node.js (ESM, `"type": "module"`)
- **Deployment**: Vercel (serverless functions + Vercel Cron)
- **HTTP handler**: Vercel serverless function (no Express needed)
- **Browser automation**: `playwright-core` + `@sparticuz/chromium` (serverless-compatible)
- **Persistence**: Vercel KV (Redis) via `@vercel/kv`
- **Email**: Nodemailer with Gmail SMTP (App Password)
- **Config**: Vercel Environment Variables (dashboard) + `.env.local` for local dev

---

## Project Structure

```
tazkarti-watcher/
├── api/
│   └── check.js          # Vercel serverless function (the single endpoint)
├── lib/
│   ├── watcher.js        # Playwright scraping + detection logic
│   ├── notifier.js       # Gmail email sender
│   └── db.js             # Vercel KV persistence
├── .env.local            # Local dev only (never committed)
├── .env.example          # Template
├── vercel.json           # Cron schedule
├── package.json
└── README.md
```

---

## Environment Variables

Set these in the **Vercel dashboard** (Project → Settings → Environment Variables). For local dev, put them in `.env.local`.

```env
TEAM_NAME=Al Ahly               # Partial match, case-insensitive
TAZKARTI_URL=https://www.tazkarti.com/#/matches

GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password (not account password)
NOTIFY_TO=you@gmail.com

# These are auto-injected by Vercel when KV is linked — do not set manually in production:
# KV_URL
# KV_REST_API_URL
# KV_REST_API_TOKEN
```

---

## Implementation Details

### `lib/db.js`

Use `@vercel/kv` for serverless-safe persistence:

```js
import { kv } from '@vercel/kv'

export async function isMatchSeen(matchId) {
  const val = await kv.get(`match:${matchId}`)
  return val !== null
}

export async function saveMatch(match) {
  await kv.set(`match:${match.id}`, JSON.stringify(match))
  // Optional: set expiry after 90 days
  // await kv.expire(`match:${match.id}`, 60 * 60 * 24 * 90)
}
```

---

### `lib/watcher.js`

Use `@sparticuz/chromium` + `playwright-core` (required for Vercel — full `playwright` is too large):

```js
import chromium from '@sparticuz/chromium'
import { chromium as playwrightChromium } from 'playwright-core'
```

Then launch with:
```js
const browser = await playwrightChromium.launch({
  args: chromium.args,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
})
```

Use Playwright to:

1. Launch Chromium headless
2. Navigate to `TAZKARTI_URL`
3. Wait for match cards to appear — selector: look for cards or list items containing match info (inspect the page; likely `.match-card`, `.event-card`, or similar)
4. **Click "View More" loop**:
   - Find the "View More" button (text match: `عرض المزيد` or `View More`)
   - If it exists and is **not disabled and not dimmed** (check for a `.disabled`, `[disabled]`, reduced opacity, or greyed-out class), click it
   - Wait for new content to load (use `waitForTimeout` or `waitForResponse`)
   - Repeat until button is gone or dimmed
5. After all matches are loaded, scrape each match card and extract:
   - `id`: a stable unique identifier — construct from home team + away team + date (slugified), e.g. `al-ahly-zamalek-2025-05-10`
   - `homeTeam`: string
   - `awayTeam`: string
   - `date`: string (as shown on site)
   - `time`: string
   - `competition`: string (league/cup name if visible)
   - `ticketUrl`: href of the "Buy" or match detail button if present
6. Filter matches where `homeTeam` or `awayTeam` contains `TEAM_NAME` (case-insensitive)
7. For each matched result: check `isMatchSeen(id)`, skip if already saved
8. Return array of new matches found

```js
export async function scrapeMatches() { ... }
```

---

### `lib/notifier.js`

Use Nodemailer with Gmail SMTP:

```js
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function sendNotification(match) {
  await transporter.sendMail({
    from: `"Tazkarti Watcher 🎫" <${process.env.GMAIL_USER}>`,
    to: process.env.NOTIFY_TO,
    subject: `🎟️ Ticket Alert: ${match.homeTeam} vs ${match.awayTeam}`,
    html: `
      <h2>Match Available on Tazkarti!</h2>
      <p><strong>${match.homeTeam} vs ${match.awayTeam}</strong></p>
      <p>📅 ${match.date} at ${match.time}</p>
      <p>🏆 ${match.competition}</p>
      ${match.ticketUrl ? `<p><a href="${match.ticketUrl}">👉 Buy Tickets</a></p>` : ''}
      <hr/>
      <small>Sent by Tazkarti Watcher</small>
    `,
  })
}
```

---

### `api/check.js`

Vercel serverless handler — no Express needed:

```js
import { scrapeMatches } from '../lib/watcher.js'
import { sendNotification } from '../lib/notifier.js'
import { isMatchSeen, saveMatch } from '../lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const newMatches = await scrapeMatches()
    const results = []

    for (const match of newMatches) {
      if (await isMatchSeen(match.id)) {
        results.push({ ...match, status: 'already_seen' })
        continue
      }
      await saveMatch({ ...match, seenAt: new Date().toISOString() })
      await sendNotification(match)
      results.push({ ...match, status: 'notified' })
    }

    res.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      team: process.env.TEAM_NAME,
      newMatches: results.filter(m => m.status === 'notified').length,
      results,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, error: err.message })
  }
}
```

---

## `package.json`

```json
{
  "name": "tazkarti-watcher",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vercel dev"
  },
  "dependencies": {
    "@sparticuz/chromium": "^123.0.0",
    "@vercel/kv": "^1.0.0",
    "nodemailer": "^6.9.13",
    "playwright-core": "^1.44.0"
  }
}
```

> **Do not include** the full `playwright` package or `lowdb` — they are replaced by `playwright-core`+`@sparticuz/chromium` and `@vercel/kv` respectively.

---

## Playwright Scraping Notes

- The site is an **Angular SPA** — always wait for the network to settle after navigation:
  ```js
  await page.goto(url, { waitUntil: 'networkidle' })
  ```
- After each "View More" click, wait for new cards:
  ```js
  await page.waitForTimeout(1500)
  ```
- To detect a dimmed/disabled button, check:
  ```js
  const isDisabled = await btn.evaluate(el =>
    el.disabled || el.classList.contains('disabled') ||
    getComputedStyle(el).opacity < 0.5 ||
    el.getAttribute('aria-disabled') === 'true'
  )
  ```
- Use `page.locator('button', { hasText: /view more|عرض المزيد/i })` for the button
- For match cards, inspect the live DOM first using `page.content()` logged to console on first run, then refine selectors
- Run with `headless: false` during development to visually verify behavior

---

## Cron Job Setup — cron-job.org

The endpoint is triggered externally by **[cron-job.org](https://cron-job.org)** (free). Setup steps:

1. Create a free account at cron-job.org
2. Create a new cronjob:
   - **URL**: `https://your-project.vercel.app/api/check`
   - **Schedule**: Every 30 minutes
   - **Request method**: GET
   - **Headers**: Add `x-cron-secret: your-secret-value` (must match `CRON_SECRET` env var in Vercel)
3. Save and enable — cron-job.org will show execution history and response codes in its dashboard

No `vercel.json` cron config needed.

---

## README.md

Claude Code should also generate a `README.md` covering:
- Setup steps (clone, `npm install`, copy `.env.example` to `.env.local`)
- How to get a Gmail App Password (Google Account → Security → 2FA → App Passwords)
- How to create a Vercel KV database (Vercel Dashboard → Storage → Create Database → KV → link to project)
- How to deploy: `vercel deploy` or connect GitHub repo to Vercel for auto-deploy
- How to set environment variables in Vercel dashboard (including `CRON_SECRET`)
- How to set up cron-job.org to call the deployed endpoint every 30 minutes with the secret header
- How to change the watched team (update `TEAM_NAME` in Vercel env vars)
- Local dev: `vercel dev` (requires Vercel CLI)

---

## Important Implementation Notes for Claude Code

1. **Inspect first**: On first run (or a dedicated `/api/inspect` endpoint), dump `page.content()` to console so selectors can be verified against the real DOM
2. **Selector fallback**: If specific class selectors fail, fall back to searching all elements containing team name text
3. **Match ID stability**: The ID must be deterministic — same match always produces same ID regardless of page order
4. **Error isolation**: If Playwright crashes, the handler must return a 500 with the error — never hang (Vercel will timeout at 60s max)
5. **Browser cleanup**: Always close the browser in a `finally` block — on Vercel, leaked browser processes waste memory and can cause timeouts
6. **Arabic support**: Team names and button text may be in Arabic — handle both RTL Arabic and English text variants
7. **Function size**: Keep the deployment bundle lean — do not import the full `playwright` package. Use only `playwright-core` + `@sparticuz/chromium`
8. **Vercel function timeout**: Set `maxDuration` in `vercel.json` if Playwright scraping takes long (Hobby plan allows up to 60s):
   ```json
   {
     "functions": {
       "api/check.js": { "maxDuration": 60 }
     }
   }
   ```
9. **KV cold start**: `@vercel/kv` calls add latency — batch them where possible and keep the match ID check before any heavy scraping work
10. **Secret validation**: Always check `x-cron-secret` header at the top of the handler before doing any work — return 401 immediately if missing or wrong
