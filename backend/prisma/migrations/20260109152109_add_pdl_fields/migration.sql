-- AlterEnum
ALTER TYPE "CacheProvider" ADD VALUE 'PDL';

-- AlterTable
ALTER TABLE "LeadershipVerificationResult" ADD COLUMN     "pdlConfidenceScore" DECIMAL(65,30),
ADD COLUMN     "pdlEmail" TEXT,
ADD COLUMN     "pdlEnrichedAt" TIMESTAMP(3),
ADD COLUMN     "pdlJobTitle" TEXT,
ADD COLUMN     "pdlLinkedin" TEXT,
ADD COLUMN     "pdlOrganization" TEXT,
ADD COLUMN     "pdlPhone" TEXT,
ADD COLUMN     "pdlRawResponse" JSONB,
ADD COLUMN     "pdlSeniority" TEXT;
