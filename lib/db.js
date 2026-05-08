import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient()
}
const prisma = globalForPrisma.prisma

export async function isMatchSeen(matchId) {
  const match = await prisma.seenMatch.findFirst({ where: { matchId } })
  return match !== null
}

export async function saveMatch(match) {
  await prisma.seenMatch.create({
    data: {
      matchId: match.id,
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
