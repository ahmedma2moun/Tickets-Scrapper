import chromium from '@sparticuz/chromium-min'
import { chromium as playwrightChromium } from 'playwright-core'
import { writeFileSync } from 'fs'

const TAZKARTI_URL = process.env.TAZKARTI_URL || 'https://www.tazkarti.com/#/matches'
const TEAM_NAME = process.env.TEAM_NAME || ''

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '')
}

function buildMatchId(homeTeam, awayTeam, date) {
  return `${slugify(homeTeam)}-vs-${slugify(awayTeam)}-${slugify(date)}`
}

async function clickViewMoreUntilDone(page) {
  const MAX_CLICKS = 20
  for (let i = 0; i < MAX_CLICKS; i++) {
    const btn = page.locator('button.button-blue', { hasText: /view more/i }).first()
    const btnCount = await btn.count()
    if (btnCount === 0) {
      console.log('[watcher] No "View More" button found — all matches loaded')
      break
    }

    const isDisabled = await btn.evaluate(el => {
      if (el.disabled) return true
      if (el.classList.contains('disabled')) return true
      if (el.getAttribute('aria-disabled') === 'true') return true
      const opacity = parseFloat(getComputedStyle(el).opacity)
      if (opacity < 0.5) return true
      return false
    }).catch(() => true)

    if (isDisabled) {
      console.log('[watcher] "View More" button is disabled — stopping pagination')
      break
    }

    console.log(`[watcher] Clicking "View More" (click #${i + 1})...`)
    await btn.click()
    await page.waitForTimeout(1500)
  }
}

async function scrapeMatchCards(page) {
  const selector = '.all-matches .match'
  const count = await page.locator(selector).count()
  console.log(`[watcher] Found ${count} match card(s) with selector "${selector}"`)

  if (count === 0) {
    console.log('[watcher] No cards found — dumping page content for inspection')
    const content = await page.content()
    console.log('[watcher] Page content (first 5000 chars):\n', content.slice(0, 5000))
    return []
  }

  return extractMatchData(page, selector)
}

async function extractMatchData(page, cardSelector) {
  const cards = await page.$$eval(cardSelector, (cards) => {
    return cards.map(card => {
      // Home team: .team-name.first (direct child of .team-names)
      const homeTeamEl = card.querySelector('.team-names > .team-name.first')
      const homeTeam = homeTeamEl ? homeTeamEl.innerText.trim() : ''

      // Away team: .team-name.second inside .team-name-holder
      const awayTeamEl = card.querySelector('.team-name-holder .team-name.second')
      const awayTeam = awayTeamEl ? awayTeamEl.innerText.trim() : ''

      // Date: .one-block.when .info .first
      const dateEl = card.querySelector('.one-block.when .info .first')
      const date = dateEl ? dateEl.innerText.trim() : ''

      // Time: .one-block.when .info .second — strip "Time : " prefix
      const timeEl = card.querySelector('.one-block.when .info .second')
      const time = timeEl ? timeEl.innerText.replace(/^Time\s*:\s*/i, '').trim() : ''

      // Competition: first .one block's .second inside .bottom
      const competitionEl = card.querySelector('.bottom .one:first-child .second')
      const competition = competitionEl ? competitionEl.innerText.trim() : ''

      // Status (Available / Sold Out)
      const statusEl = card.querySelector('.bottom .status')
      const status = statusEl ? statusEl.innerText.trim() : ''

      return { homeTeam, awayTeam, date, time, competition, status }
    })
  })

  console.log(`[watcher] Extracted ${cards.length} card(s):`)
  cards.forEach((c, i) => {
    console.log(`[watcher]   ${i + 1}. "${c.homeTeam}" vs "${c.awayTeam}" | ${c.date} ${c.time} | ${c.competition} | ${c.status}`)
  })

  return cards
}

async function getLaunchOptions() {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    console.log(`[watcher] Using CHROMIUM_EXECUTABLE_PATH: ${process.env.CHROMIUM_EXECUTABLE_PATH}`)
    return { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, headless: true, args: [] }
  }
  if (process.platform !== 'linux') {
    console.log('[watcher] Non-Linux detected — using local Chrome via playwright-core')
    return { headless: true, channel: 'chrome' }
  }
  console.log('[watcher] Linux detected — using @sparticuz/chromium-min')
  return {
    args: chromium.args,
    executablePath: await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
    ),
    headless: true,
  }
}

export async function scrapeMatches() {
  let browser = null
  try {
    console.log(`[watcher] Launching browser (platform: ${process.platform})`)
    browser = await playwrightChromium.launch(await getLaunchOptions())
    console.log('[watcher] Browser launched')

    const page = await browser.newPage()

    const baseUrl = TAZKARTI_URL.split('#')[0]
    console.log(`[watcher] Navigating to base URL: ${baseUrl}`)
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    console.log('[watcher] Base page loaded')

    console.log('[watcher] Pushing hash route: #/matches')
    await page.evaluate(() => { window.location.hash = '/matches' })
    await page.waitForTimeout(3000)
    console.log(`[watcher] Current URL: ${page.url()}`)

    const html = await page.content()
    writeFileSync('page-dump.html', html, 'utf8')
    console.log(`[watcher] Page saved to page-dump.html (${html.length} chars)`)

    await clickViewMoreUntilDone(page)

    const rawCards = await scrapeMatchCards(page)

    const teamLower = TEAM_NAME.toLowerCase()
    console.log(`[watcher] Filtering for team: "${TEAM_NAME}"`)

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
      .filter(m => {
        if (!teamLower) return true
        return (
          m.homeTeam.toLowerCase().includes(teamLower) ||
          m.awayTeam.toLowerCase().includes(teamLower)
        )
      })
      .filter(m => m.homeTeam || m.awayTeam)

    console.log(`[watcher] ${matches.length} match(es) after filtering`)
    return matches
  } finally {
    if (browser) {
      await browser.close()
      console.log('[watcher] Browser closed')
    }
  }
}
