import { requirePermission } from "@/platform/authz";
import { PageHeader } from "@/platform/ui/components";
import { humanize } from "@/platform/ui/format";
import { AUTO_APPROVE_LIMIT_CENTS, formatCents, REFUND_REASONS } from "@/apps/refunds/service";
import { NewRefundForm } from "./NewRefundForm";

export default async function NewRefund() {
  await requirePermission("refunds:write");
  return (
    <>
      <PageHeader
        back={{ href: "/refunds", label: "Refund requests" }}
        title="New refund request"
        subtitle={`Refunds up to ${formatCents(AUTO_APPROVE_LIMIT_CENTS)} are approved automatically. Larger refunds need approval by a refunds approver.`}
      />
      <NewRefundForm reasons={REFUND_REASONS.map((r) => ({ value: r, label: humanize(r) }))} />
    </>
  );
}
