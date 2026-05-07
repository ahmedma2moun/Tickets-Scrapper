import { chromium } from 'playwright'

const TAZKARTI_URL = process.env.TAZKARTI_URL || 'https://www.tazkarti.com/#/matches'
const TEAM_NAME = process.env.TEAM_NAME || ''

function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]/g, '')
}

function buildMatchId(homeTeam, awayTeam, date) {
  return `${slugify(homeTeam)}-vs-${slugify(awayTeam)}-${slugify(date)}`
}

async function clickViewMoreUntilDone(page) {
  const MAX_CLICKS = 20
  for (let i = 0; i < MAX_CLICKS; i++) {
    const btn = page.locator('button.button-blue', { hasText: /view more/i }).first()
    if (await btn.count() === 0) {
      console.log('[watcher] No "View More" button — all matches loaded')
      break
    }

    const isDisabled = await btn.evaluate(el => {
      if (el.disabled) return true
      if (el.classList.contains('disabled')) return true
      if (el.getAttribute('aria-disabled') === 'true') return true
      return parseFloat(getComputedStyle(el).opacity) < 0.5
    }).catch(() => true)

    if (isDisabled) {
      console.log('[watcher] "View More" is disabled — stopping')
      break
    }

    console.log(`[watcher] Clicking "View More" (#${i + 1})`)
    await btn.click()
    await page.waitForTimeout(1500)
  }
}

async function extractMatchData(page) {
  const selector = '.all-matches .match'
  const count = await page.locator(selector).count()
  console.log(`[watcher] Found ${count} match card(s)`)

  if (count === 0) {
    console.log('[watcher] No cards found — check the page loaded correctly')
    return []
  }

  const cards = await page.$$eval(selector, (cards) =>
    cards.map(card => {
      const homeTeam = card.querySelector('.team-names > .team-name.first')?.innerText.trim() ?? ''
      const awayTeam = card.querySelector('.team-name-holder .team-name.second')?.innerText.trim() ?? ''
      const date = card.querySelector('.one-block.when .info .first')?.innerText.trim() ?? ''
      const time = (card.querySelector('.one-block.when .info .second')?.innerText ?? '').replace(/^Time\s*:\s*/i, '').trim()
      const competition = card.querySelector('.bottom .one:first-child .second')?.innerText.trim() ?? ''
      const status = card.querySelector('.bottom .status')?.innerText.trim() ?? ''
      return { homeTeam, awayTeam, date, time, competition, status }
    })
  )

  cards.forEach((c, i) =>
    console.log(`[watcher]   ${i + 1}. "${c.homeTeam}" vs "${c.awayTeam}" | ${c.date} ${c.time} | ${c.competition} | ${c.status}`)
  )

  return cards
}

export async function scrapeMatches() {
  let browser = null
  try {
    console.log('[watcher] Launching browser')
    browser = await chromium.launch({ headless: true })

    const page = await browser.newPage()
    const baseUrl = TAZKARTI_URL.split('#')[0]

    console.log(`[watcher] Navigating to ${baseUrl}`)
    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    console.log('[watcher] Pushing hash route #/matches')
    await page.evaluate(() => { window.location.hash = '/matches' })
    await page.waitForTimeout(3000)
    console.log(`[watcher] URL: ${page.url()}`)

    await clickViewMoreUntilDone(page)

    const rawCards = await extractMatchData(page)
    const teamLower = TEAM_NAME.toLowerCase()

    const matches = rawCards
      .map(card => ({
        id: buildMatchId(card.homeTeam, card.awayTeam, card.date),
        homeTeam: card.homeTeam,
        awayTeam: card.awayTeam,
        date: card.date,
        time: card.time,
        competition: card.competition,
        status: card.status,
        ticketUrl: TAZKARTI_URL,
      }))
      .filter(m => m.homeTeam || m.awayTeam)
      .filter(m => {
        if (!teamLower) return true
        return m.homeTeam.toLowerCase().includes(teamLower) || m.awayTeam.toLowerCase().includes(teamLower)
      })

    console.log(`[watcher] ${matches.length} match(es) after filtering for "${TEAM_NAME}"`)
    return matches
  } finally {
    if (browser) {
      await browser.close()
      console.log('[watcher] Browser closed')
    }
  }
}
