const MAIL_API_URL = process.env.MAIL_API_URL
const MAIL_SECRET = process.env.MAIL_SECRET

const recipients = (process.env.NOTIFY_TO || '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean)

export async function sendNotification(match) {
  console.log(`[notifier] Sending to: ${recipients.join(', ')}`)

  const res = await fetch(`${MAIL_API_URL}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mail-secret': MAIL_SECRET,
    },
    body: JSON.stringify({
      to: recipients,
      subject: `Ticket Alert: ${match.homeTeam} vs ${match.awayTeam}`,
      html: `
        <h2>Match Available on Tazkarti!</h2>
        <p><strong>${match.homeTeam} vs ${match.awayTeam}</strong></p>
        <p>Date: ${match.date} at ${match.time}</p>
        <p>Competition: ${match.competition}</p>
        <p>Status: ${match.status}</p>
        <p><a href="${match.ticketUrl}">Open Tazkarti</a></p>
        <hr/>
        <small>Sent by Tazkarti Watcher</small>
      `,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Mail API error: ${err.error || res.status}`)
  }

  console.log('[notifier] Email sent successfully')
}
