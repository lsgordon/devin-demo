import Link from "next/link";
import { requirePermission } from "@/platform/authz";
import { PageHeader, StatusBadge } from "@/platform/ui/components";
import { listRequests } from "@/apps/example/service";

export default async function ExampleList() {
  const user = await requirePermission("example:read");
  const rows = await listRequests(user);
  return (
    <>
      <PageHeader title="Example requests" subtitle="Reference app showing scoped lists, masked PII and maker-checker approval." />
      <div className="table-wrap">
        <table data-testid="example-list">
          <thead><tr><th>Request</th><th>Customer</th><th>Date of birth</th><th>ID number</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`row-${r.id}`}>
                <td><Link href={`/example/${r.id}`}>{r.title}</Link></td>
                <td>{r.customerName}</td>
                <td className="mono">{r.dateOfBirth}</td>
                <td className="mono">{r.idNumber}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="empty">No requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
