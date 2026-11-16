import Link from "next/link";
import { requirePermission } from "@/platform/authz";
import { PageHeader, StatusBadge } from "@/platform/ui/components";
import { humanize } from "@/platform/ui/format";
import { analystLabel } from "@/apps/kyc/analysts";
import { RiskBadge } from "@/apps/kyc/ui";
import { listCases } from "@/apps/kyc/service";

export default async function KycList() {
  const user = await requirePermission("kyc:read");
  const rows = await listCases(user);
  const open = rows.filter((r) => r.status === "SUBMITTED").length;
  const awaiting = rows.filter((r) => r.status === "PENDING_APPROVAL").length;
  return (
    <>
      <PageHeader title="KYC cases" subtitle="Analysts review a case and recommend a decision. A KYC approver makes the final call." />
      <div className="stats">
        <div className="stat"><div className="label">All cases</div><div className="value">{rows.length}</div></div>
        <div className="stat"><div className="label"><span className="dot blue" />Needs review</div><div className="value">{open}</div></div>
        <div className="stat"><div className="label"><span className="dot amber" />Awaiting approval</div><div className="value">{awaiting}</div></div>
      </div>
      <div className="table-wrap">
        <table data-testid="kyc-list">
          <thead>
            <tr><th>Case</th><th>Customer</th><th>Date of birth</th><th>National ID</th><th>Document</th><th>Risk</th><th>Status</th><th>Assignee</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`row-${r.id}`}>
                <td><Link href={`/kyc/${r.id}`} className="mono">{r.id.toUpperCase()}</Link></td>
                <td>{r.customerName}</td>
                <td className="mono">{r.dateOfBirth}</td>
                <td className="mono">{r.nationalId}</td>
                <td>{humanize(r.documentType)}</td>
                <td><RiskBadge score={r.riskScore} /></td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.assigneeOid ? analystLabel(r.assigneeOid) : <span className="muted">Unassigned</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="empty">No cases assigned to you.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
