/*
  Warnings:

  - The primary key for the `seen_matches` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `seen_matches` table. All the data in the column will be lost.
  - Added the required column `matchId` to the `seen_matches` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "seen_matches" DROP CONSTRAINT "seen_matches_pkey",
DROP COLUMN "id",
ADD COLUMN     "dbId" SERIAL NOT NULL,
ADD COLUMN     "matchId" TEXT NOT NULL,
ADD CONSTRAINT "seen_matches_pkey" PRIMARY KEY ("dbId");

-- CreateIndex
CREATE INDEX "seen_matches_matchId_idx" ON "seen_matches"("matchId");
