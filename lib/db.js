import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient()
}
const prisma = globalForPrisma.prisma

export async function isMatchSeen(matchId) {
  const match = await prisma.seenMatch.findUnique({ where: { id: matchId } })
  return match !== null
}

export async function saveMatch(match) {
  await prisma.seenMatch.upsert({
    where: { id: match.id },
    update: {},
    create: {
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      matchDate: match.date,
      matchTime: match.time,
      competition: match.competition ?? '',
      ticketUrl: match.ticketUrl ?? '',
      status: match.status ?? '',
      seenAt: new Date(match.seenAt),
    },
  })
}
