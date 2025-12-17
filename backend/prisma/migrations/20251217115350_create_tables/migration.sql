-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CacheProvider" AS ENUM ('GOOGLE_CSE', 'EMAIL_FINDER', 'EMAIL_VERIFIER');

-- CreateEnum
CREATE TYPE "VerifyMode" AS ENUM ('OFFLINE', 'ONLINE');

-- CreateEnum
CREATE TYPE "CurrentStatus" AS ENUM ('STILL_EMPLOYED', 'LEFT_ORGANIZATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('WORK_VERIFIED', 'WORK_UNVERIFIED', 'PERSONAL', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "originalFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipInputRecord" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "filerEin" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "websiteRaw" TEXT,
    "orgDomain" TEXT,
    "employeeNameRaw" TEXT NOT NULL,
    "employeeTitleRaw" TEXT,
    "compOrg" TEXT,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "suffix" TEXT,
    "inputIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadershipInputRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheResult" (
    "id" TEXT NOT NULL,
    "provider" "CacheProvider" NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "statusCode" INTEGER,
    "costUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CacheResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipVerificationResult" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "mode" "VerifyMode" NOT NULL,
    "currentStatus" "CurrentStatus" NOT NULL,
    "currentTitle" TEXT,
    "evidenceDate" TIMESTAMP(3),
    "dataSources" JSONB,
    "notes" TEXT,
    "verifiedEmail" TEXT,
    "emailType" "EmailType" NOT NULL DEFAULT 'NOT_FOUND',
    "emailChecks" JSONB,
    "emailSources" JSONB,
    "emailLastCheckedAt" TIMESTAMP(3),
    "emailCostUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "confidenceLevel" "ConfidenceLevel" NOT NULL DEFAULT 'LOW',
    "costPerRecordUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "costUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "LeadershipVerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadershipInputRecord_jobId_idx" ON "LeadershipInputRecord"("jobId");

-- CreateIndex
CREATE INDEX "LeadershipInputRecord_filerEin_idx" ON "LeadershipInputRecord"("filerEin");

-- CreateIndex
CREATE INDEX "LeadershipInputRecord_orgDomain_idx" ON "LeadershipInputRecord"("orgDomain");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipInputRecord_jobId_rowIndex_key" ON "LeadershipInputRecord"("jobId", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CacheResult_cacheKey_key" ON "CacheResult"("cacheKey");

-- CreateIndex
CREATE INDEX "CacheResult_provider_idx" ON "CacheResult"("provider");

-- CreateIndex
CREATE INDEX "CacheResult_expiresAt_idx" ON "CacheResult"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipVerificationResult_recordId_key" ON "LeadershipVerificationResult"("recordId");

-- CreateIndex
CREATE INDEX "LeadershipVerificationResult_jobId_idx" ON "LeadershipVerificationResult"("jobId");

-- CreateIndex
CREATE INDEX "LeadershipVerificationResult_currentStatus_idx" ON "LeadershipVerificationResult"("currentStatus");

-- CreateIndex
CREATE INDEX "LeadershipVerificationResult_mode_idx" ON "LeadershipVerificationResult"("mode");

-- CreateIndex
CREATE INDEX "LeadershipVerificationResult_confidenceLevel_idx" ON "LeadershipVerificationResult"("confidenceLevel");

-- AddForeignKey
ALTER TABLE "LeadershipInputRecord" ADD CONSTRAINT "LeadershipInputRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipVerificationResult" ADD CONSTRAINT "LeadershipVerificationResult_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "LeadershipInputRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
