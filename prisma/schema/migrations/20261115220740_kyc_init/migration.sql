-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID_CARD');

-- CreateEnum
CREATE TYPE "KycCaseStatus" AS ENUM ('SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycRecommendation" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "kyc_case" (
    "id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "date_of_birth" TEXT NOT NULL,
    "national_id" TEXT NOT NULL,
    "document_type" "KycDocumentType" NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "status" "KycCaseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assignee_oid" TEXT,
    "recommendation" "KycRecommendation",
    "recommended_by_oid" TEXT,
    "recommendation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kyc_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_note" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "author_oid" TEXT NOT NULL,
    "author_username" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_case_assignee_oid_idx" ON "kyc_case"("assignee_oid");

-- CreateIndex
CREATE INDEX "kyc_case_status_idx" ON "kyc_case"("status");

-- CreateIndex
CREATE INDEX "kyc_note_case_id_idx" ON "kyc_note"("case_id");

-- AddForeignKey
ALTER TABLE "kyc_note" ADD CONSTRAINT "kyc_note_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "kyc_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
