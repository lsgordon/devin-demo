import Link from "next/link";
import { hasPermission, requirePermission } from "@/platform/authz";
import { formatCents, listRefunds, REFUND_REASONS, REFUND_STATUSES, type RefundFilters } from "@/apps/refunds/service";

export default async function RefundsList({ searchParams }: { searchParams: Promise<RefundFilters> }) {
  const user = await requirePermission("refunds:read");
  const f = await searchParams;
  const { rows, totals } = await listRefunds(user, f);
  return (
    <>
      <h1>Refund requests</h1>
      {hasPermission(user, "refunds:write") && (
        <p><Link className="button" href="/refunds/new" data-testid="new-refund">New refund request</Link></p>
      )}

      <form key={JSON.stringify(f)} className="filters" method="get" data-testid="refund-filters">
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {REFUND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="reason" defaultValue={f.reason ?? ""} aria-label="Reason">
          <option value="">All reasons</option>
          {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input name="q" placeholder="Order id contains" defaultValue={f.q ?? ""} aria-label="Order id" />
        <input name="min" placeholder="Min $" defaultValue={f.min ?? ""} aria-label="Min amount" size={8} />
        <input name="max" placeholder="Max $" defaultValue={f.max ?? ""} aria-label="Max amount" size={8} />
        <button type="submit">Filter</button>
        <Link href="/refunds">Clear</Link>
      </form>

      <div className="cards" data-testid="refund-totals">
        <div className="card">
          <div className="muted">Total</div>
          <strong data-testid="total-count">{totals.count}</strong> requests,{" "}
          <strong data-testid="total-amount">{formatCents(totals.amountCents)}</strong>
        </div>
        {REFUND_STATUSES.map((s) => (
          <div className="card" key={s}>
            <div className="muted">{s}</div>
            <strong data-testid={`total-count-${s}`}>{totals.byStatus[s].count}</strong>,{" "}
            <span data-testid={`total-amount-${s}`}>{formatCents(totals.byStatus[s].amountCents)}</span>
          </div>
        ))}
      </div>

      <table data-testid="refund-list">
        <thead>
          <tr><th>Id</th><th>Order</th><th>Customer email</th><th>Card</th><th>Amount</th><th>Reason</th><th>Status</th><th>Created by</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`row-${r.id}`}>
              <td><Link href={`/refunds/${r.id}`}>{r.id}</Link></td>
              <td>{r.orderId}</td>
              <td data-testid="customer-email">{r.customerEmail}</td>
              <td data-testid="card-last4">{r.cardLast4}</td>
              <td>{formatCents(r.amountCents)}</td>
              <td>{r.reason}</td>
              <td>{r.status}{r.autoApproved && <> <span className="badge">auto</span></>}</td>
              <td>{r.createdByUsername}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No refund requests.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
