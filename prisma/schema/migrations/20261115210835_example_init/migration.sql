-- CreateEnum
CREATE TYPE "ExampleRequestStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "example_request" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "date_of_birth" TEXT NOT NULL,
    "id_number" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "ExampleRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "assignee_oid" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "example_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "example_request_assignee_oid_idx" ON "example_request"("assignee_oid");
