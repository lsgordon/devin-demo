-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('DAMAGED', 'NOT_RECEIVED', 'DUPLICATE_CHARGE', 'WRONG_ITEM', 'OTHER');

-- CreateTable
CREATE TABLE "refund_request" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "card_last4" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "note" TEXT,
    "status" "RefundStatus" NOT NULL,
    "auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_by_oid" TEXT NOT NULL,
    "created_by_username" TEXT NOT NULL,
    "decided_by_oid" TEXT,
    "decided_by_username" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refund_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_request_created_by_oid_idx" ON "refund_request"("created_by_oid");

-- CreateIndex
CREATE INDEX "refund_request_status_idx" ON "refund_request"("status");

-- Defense in depth for rules enforced in src/apps/refunds/service.ts (Prisma does not model CHECKs).
ALTER TABLE "refund_request" ADD CONSTRAINT "refund_request_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "refund_request" ADD CONSTRAINT "refund_request_card_last4_digits" CHECK ("card_last4" ~ '^[0-9]{4}$');
ALTER TABLE "refund_request" ADD CONSTRAINT "refund_request_auto_approve_limit" CHECK (NOT "auto_approved" OR ("amount_cents" <= 10000 AND "status" = 'APPROVED'));
ALTER TABLE "refund_request" ADD CONSTRAINT "refund_request_decider_not_creator" CHECK ("decided_by_oid" IS NULL OR "decided_by_oid" <> "created_by_oid");
