import Link from "next/link";
import { requirePermission } from "@/platform/authz";
import { listRequests } from "@/apps/example/service";

export default async function ExampleList() {
  const user = await requirePermission("example:read");
  const rows = await listRequests(user);
  return (
    <>
      <h1>Example requests</h1>
      <table data-testid="example-list">
        <thead><tr><th>Id</th><th>Title</th><th>Customer</th><th>DOB</th><th>ID number</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`row-${r.id}`}>
              <td><Link href={`/example/${r.id}`}>{r.id}</Link></td>
              <td>{r.title}</td>
              <td>{r.customerName}</td>
              <td>{r.dateOfBirth}</td>
              <td>{r.idNumber}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
