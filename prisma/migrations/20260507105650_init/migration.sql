-- CreateTable
CREATE TABLE "seen_matches" (
    "id" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "matchDate" TEXT NOT NULL,
    "matchTime" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "ticketUrl" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seen_matches_pkey" PRIMARY KEY ("id")
);
