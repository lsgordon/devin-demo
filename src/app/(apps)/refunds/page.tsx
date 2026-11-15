import Link from "next/link";
import { hasPermission, requirePermission } from "@/platform/authz";
import { PageHeader, StatusBadge } from "@/platform/ui/components";
import { formatDate, humanize, toneFor } from "@/platform/ui/format";
import { formatCents, listRefunds, REFUND_REASONS, REFUND_STATUSES, type RefundFilters } from "@/apps/refunds/service";

export default async function RefundsList({ searchParams }: { searchParams: Promise<RefundFilters> }) {
  const user = await requirePermission("refunds:read");
  const f = await searchParams;
  const { rows, totals } = await listRefunds(user, f);
  const filtered = Boolean(f.status || f.reason || f.q || f.min || f.max);
  return (
    <>
      <PageHeader
        title="Refund requests"
        subtitle="Refunds up to $100 are approved instantly. Larger refunds wait for a refunds approver."
        actions={hasPermission(user, "refunds:write") && (
          <Link className="button primary" href="/refunds/new" data-testid="new-refund">New refund request</Link>
        )}
      />

      <form key={JSON.stringify(f)} className="filters" method="get" data-testid="refund-filters">
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {REFUND_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <select name="reason" defaultValue={f.reason ?? ""} aria-label="Reason">
          <option value="">All reasons</option>
          {REFUND_REASONS.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
        </select>
        <input name="q" placeholder="Order id" defaultValue={f.q ?? ""} aria-label="Order id" />
        <input name="min" placeholder="Min $" defaultValue={f.min ?? ""} aria-label="Min amount" style={{ width: 90 }} />
        <input name="max" placeholder="Max $" defaultValue={f.max ?? ""} aria-label="Max amount" style={{ width: 90 }} />
        <button type="submit">Filter</button>
        <Link href="/refunds" className={`button ghost${filtered ? "" : " muted"}`}>Clear</Link>
      </form>

      <div className="stats" data-testid="refund-totals">
        <div className="stat">
          <div className="label">{filtered ? "Matching requests" : "All requests"}</div>
          <div className="value" data-testid="total-count">{totals.count}</div>
          <div className="sub" data-testid="total-amount">{formatCents(totals.amountCents)}</div>
        </div>
        {REFUND_STATUSES.map((s) => (
          <div className="stat" key={s}>
            <div className="label"><span className={`dot ${toneFor(s)}`} />{humanize(s)}</div>
            <div className="value" data-testid={`total-count-${s}`}>{totals.byStatus[s].count}</div>
            <div className="sub" data-testid={`total-amount-${s}`}>{formatCents(totals.byStatus[s].amountCents)}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table data-testid="refund-list">
          <thead>
            <tr><th>Order</th><th>Customer email</th><th>Card</th><th className="num">Amount</th><th>Reason</th><th>Status</th><th>Requested by</th><th>Date</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`row-${r.id}`}>
                <td><Link href={`/refunds/${r.id}`} className="mono">{r.orderId}</Link></td>
                <td data-testid="customer-email">{r.customerEmail}</td>
                <td className="mono" data-testid="card-last4">{r.cardLast4}</td>
                <td className="num">{formatCents(r.amountCents)}</td>
                <td>{humanize(r.reason)}</td>
                <td>
                  <StatusBadge status={r.status} />
                  {r.autoApproved && <> <span className="badge">Auto</span></>}
                </td>
                <td>{r.createdByUsername}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatDate(r.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="empty">No refund requests match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
