import { requirePermission } from "@/platform/authz";
import { AUTO_APPROVE_LIMIT_CENTS, formatCents, REFUND_REASONS } from "@/apps/refunds/service";
import { NewRefundForm } from "./NewRefundForm";

export default async function NewRefund() {
  await requirePermission("refunds:write");
  return (
    <>
      <h1>New refund request</h1>
      <p className="muted">
        Refunds up to {formatCents(AUTO_APPROVE_LIMIT_CENTS)} are approved automatically. Larger refunds need approval by a
        refunds approver.
      </p>
      <NewRefundForm reasons={[...REFUND_REASONS]} />
    </>
  );
}
