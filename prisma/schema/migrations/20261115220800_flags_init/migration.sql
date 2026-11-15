-- CreateEnum
CREATE TYPE "FlagEnvironment" AS ENUM ('dev', 'staging', 'prod');

-- CreateEnum
CREATE TYPE "FlagChangeKind" AS ENUM ('CREATE', 'UPDATE');

-- CreateEnum
CREATE TYPE "FlagChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "flag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "environment" "FlagEnvironment" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percent" INTEGER NOT NULL DEFAULT 0,
    "created_by_oid" TEXT NOT NULL,
    "updated_by_oid" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag_change_request" (
    "id" TEXT NOT NULL,
    "kind" "FlagChangeKind" NOT NULL,
    "status" "FlagChangeStatus" NOT NULL DEFAULT 'PENDING',
    "flag_id" TEXT,
    "key" TEXT NOT NULL,
    "environment" "FlagEnvironment" NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "rollout_percent" INTEGER NOT NULL,
    "base_snapshot" JSONB,
    "approval_id" TEXT,
    "requester_oid" TEXT NOT NULL,
    "request_comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "flag_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flag_key_environment_key" ON "flag"("key", "environment");

-- CreateIndex
CREATE INDEX "flag_change_request_key_environment_status_idx" ON "flag_change_request"("key", "environment", "status");

-- CreateIndex
CREATE INDEX "flag_change_request_flag_id_idx" ON "flag_change_request"("flag_id");

-- Rollout percentage must be 0..100 (also validated in src/apps/flags/service.ts).
ALTER TABLE "flag" ADD CONSTRAINT "flag_rollout_percent_range" CHECK ("rollout_percent" BETWEEN 0 AND 100);
ALTER TABLE "flag_change_request" ADD CONSTRAINT "flag_change_request_rollout_percent_range" CHECK ("rollout_percent" BETWEEN 0 AND 100);
