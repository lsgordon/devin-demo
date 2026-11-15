-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor_oid" TEXT NOT NULL,
    "actor_username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requester_oid" TEXT NOT NULL,
    "requester_username" TEXT NOT NULL,
    "request_comment" TEXT,
    "decider_oid" TEXT,
    "decider_username" TEXT,
    "decision_comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_oid_idx" ON "audit_log"("actor_oid");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "approval_entity_type_entity_id_idx" ON "approval"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "approval_status_idx" ON "approval"("status");

-- ---------------------------------------------------------------------------
-- Hand-written platform invariants (Prisma does not model these; it never drops them).
-- ---------------------------------------------------------------------------

-- Audit log is append-only: reject UPDATE and DELETE (and TRUNCATE) at the database level.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();

-- Maker-checker: the requester can never decide their own approval.
ALTER TABLE "approval"
  ADD CONSTRAINT approval_decider_not_requester
  CHECK (decider_oid IS NULL OR decider_oid <> requester_oid);

-- A decided approval always has a decider; a pending one never does.
ALTER TABLE "approval"
  ADD CONSTRAINT approval_decider_matches_status
  CHECK ((status = 'PENDING') = (decider_oid IS NULL));

-- At most one pending approval per entity + action.
CREATE UNIQUE INDEX approval_one_pending_per_entity_action
  ON "approval" (entity_type, entity_id, action)
  WHERE status = 'PENDING';
