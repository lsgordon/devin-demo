import Link from "next/link";
import { requirePermission } from "@/platform/authz";
import { analystLabel } from "@/apps/kyc/analysts";
import { listCases } from "@/apps/kyc/service";

export default async function KycList() {
  const user = await requirePermission("kyc:read");
  const rows = await listCases(user);
  return (
    <>
      <h1>KYC cases</h1>
      <table data-testid="kyc-list">
        <thead>
          <tr><th>Id</th><th>Customer</th><th>DOB</th><th>National ID</th><th>Document</th><th>Risk</th><th>Status</th><th>Assignee</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`row-${r.id}`}>
              <td><Link href={`/kyc/${r.id}`}>{r.id}</Link></td>
              <td>{r.customerName}</td>
              <td>{r.dateOfBirth}</td>
              <td>{r.nationalId}</td>
              <td>{r.documentType}</td>
              <td>{r.riskScore}</td>
              <td>{r.status}</td>
              <td>{analystLabel(r.assigneeOid)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No cases assigned to you.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
