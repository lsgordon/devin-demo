import { formatDateTime, humanize } from "@/platform/ui/format";

export type Change = { key: string; label: string; from?: string; to: string };
type Json = Record<string, unknown> | null;

const IGNORED = new Set(["id", "updatedAt", "createdAt", "version"]);
const ENUM = /^[A-Z]+(_[A-Z]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})?$/;
const isOidKey = (k: string) => k.endsWith("Oid");

/** Display value for an audit snapshot field; `nameFor` resolves identity OIDs to names. */
export function displayValue(v: unknown, nameFor: (oid: string) => string | undefined = () => undefined, key = ""): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") {
    if (isOidKey(key)) return nameFor(v) ?? v;
    if (ENUM.test(v)) return humanize(v);
    if (ISO_DATE.test(v) && !Number.isNaN(Date.parse(v))) return formatDateTime(v);
  }
  return String(v);
}

/** Fields whose value changed between the before/after snapshots (all set fields for creates). */
export function auditChanges(before: unknown, after: unknown, nameFor?: (oid: string) => string | undefined): Change[] {
  const b = (before && typeof before === "object" ? before : null) as Json;
  const a = (after && typeof after === "object" ? after : null) as Json;
  if (!a) return [];
  return Object.keys(a)
    .filter((k) => !IGNORED.has(k))
    .filter((k) => (b ? JSON.stringify(b[k]) !== JSON.stringify(a[k]) : a[k] !== null && !isOidKey(k)))
    .map((k) => ({
      key: k,
      label: humanize(isOidKey(k) ? k.slice(0, -3) : k),
      from: b ? displayValue(b[k], nameFor, k) : undefined,
      to: displayValue(a[k], nameFor, k),
    }));
}
