import express from 'express'
import { scrapeMatches } from './lib/watcher.js'
import { sendNotification } from './lib/notifier.js'
import { isMatchSeen, saveMatch } from './lib/db.js'

const app = express()
const PORT = process.env.PORT || 3000

app.get('/api/check', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    console.log('[check] Rejected — invalid or missing x-cron-secret')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log(`[check] Request received — watching team: "${process.env.TEAM_NAME}"`)

  try {
    const newMatches = await scrapeMatches()
    console.log(`[check] Scrape complete — ${newMatches.length} match(es) found`)

    const results = []

    for (const match of newMatches) {
      console.log(`[check] ${match.homeTeam} vs ${match.awayTeam}`)

      if (await isMatchSeen(match.id)) {
        console.log(`[check]   → already seen`)
        results.push({ ...match, status: 'already_seen' })
        continue
      }

      await saveMatch({ ...match, seenAt: new Date().toISOString() })
      await sendNotification(match)
      console.log(`[check]   → notified`)
      results.push({ ...match, status: 'notified' })
    }

    const notifiedCount = results.filter(m => m.status === 'notified').length
    console.log(`[check] Done — ${notifiedCount} notification(s) sent`)

    res.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      team: process.env.TEAM_NAME,
      newMatches: notifiedCount,
      results,
    })
  } catch (err) {
    console.error('[check] Error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
