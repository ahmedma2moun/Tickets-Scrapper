import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

const recipients = (process.env.NOTIFY_TO || '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean)

export async function sendNotification(match) {
  console.log(`[notifier] Sending to: ${recipients.join(', ')}`)
  await transporter.sendMail({
    from: `"Tazkarti Watcher" <${process.env.GMAIL_USER}>`,
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
  })
}
