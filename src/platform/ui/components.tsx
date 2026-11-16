import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime, humanize, initials, toneFor, type Tone } from "./format";

/** Colored status pill. Text is the humanized status ("PENDING_APPROVAL" -> "Pending approval"). */
export function StatusBadge({ status, label, tone, testId }: { status: string; label?: string; tone?: Tone; testId?: string }) {
  return (
    <span className={`pill ${tone ?? toneFor(status)}`} data-testid={testId}>
      {label ?? humanize(status)}
    </span>
  );
}

export function PageHeader({ title, subtitle, back, badges, actions }: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      {back && <Link href={back.href} className="back">← {back.label}</Link>}
      <div className="page-header">
        <div>
          <div className="title-row"><h1>{title}</h1>{badges}</div>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="form-actions" style={{ marginTop: 0 }}>{actions}</div>}
      </div>
    </>
  );
}

export function Fields({ items, testId }: { items: [label: string, value: ReactNode][]; testId?: string }) {
  return (
    <dl className="fields" data-testid={testId}>
      {items.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

export function Avatar({ name }: { name: string }) {
  return <span className="avatar" aria-hidden>{initials(name)}</span>;
}

type ApprovalRow = {
  id: string;
  status: string;
  requesterUsername: string;
  deciderUsername: string | null;
  requestComment: string | null;
  decisionComment: string | null;
  createdAt: Date;
  decidedAt?: Date | null;
};

/** Maker-checker history table shared by every app. */
export function ApprovalHistory({ approvals, empty = "No approval requests yet." }: { approvals: ApprovalRow[]; empty?: string }) {
  return (
    <div className="section">
      <div className="section-title"><h2>Approval history</h2></div>
      <div className="table-wrap">
        <table data-testid="approvals">
          <thead><tr><th>Status</th><th>Requested by</th><th>Decided by</th><th>Comment</th><th>When</th></tr></thead>
          <tbody>
            {approvals.map((a) => (
              <tr key={a.id}>
                <td><StatusBadge status={a.status} /></td>
                <td>{a.requesterUsername}</td>
                <td>{a.deciderUsername ?? <span className="muted">—</span>}</td>
                <td>
                  {a.requestComment && <span className="sub">Request: “{a.requestComment}”</span>}
                  {a.decisionComment && <span className="sub">Decision: “{a.decisionComment}”</span>}
                  {!a.requestComment && !a.decisionComment && <span className="muted">—</span>}
                </td>
                <td className="muted">{formatDateTime(a.decidedAt ?? a.createdAt)}</td>
              </tr>
            ))}
            {approvals.length === 0 && <tr><td colSpan={5} className="empty">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
