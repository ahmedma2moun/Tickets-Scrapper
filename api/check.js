import { scrapeMatches } from '../lib/watcher.js'
import { sendNotification } from '../lib/notifier.js'
import { isMatchSeen, saveMatch } from '../lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    console.log('[check] Rejected request — invalid or missing x-cron-secret')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log(`[check] Request received — watching team: "${process.env.TEAM_NAME}"`)

  try {
    console.log('[check] Starting scrape...')
    const newMatches = await scrapeMatches()
    console.log(`[check] Scrape complete — ${newMatches.length} matching match(es) found`)

    const results = []

    for (const match of newMatches) {
      console.log(`[check] Checking match: ${match.homeTeam} vs ${match.awayTeam} (id: ${match.id})`)

      if (await isMatchSeen(match.id)) {
        console.log(`[check]   → already seen, skipping`)
        results.push({ ...match, status: 'already_seen' })
        continue
      }

      console.log(`[check]   → new match! saving and sending notification...`)
      await saveMatch({ ...match, seenAt: new Date().toISOString() })
      await sendNotification(match)
      console.log(`[check]   → notification sent`)
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
}
