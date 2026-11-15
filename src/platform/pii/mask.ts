import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/platform/authz/core";
import { hasPermission } from "@/platform/authz/core";

export const MASK = "••••";

/** Keep only the last 4 characters. Short values are fully masked. Idempotent. */
export function maskValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (s.startsWith(MASK)) return s;
  return s.length <= 4 ? MASK : MASK + s.slice(-4);
}

export function isMasked(value: unknown): boolean {
  return typeof value === "string" && value.includes(MASK);
}

type PiiMap = ReadonlyMap<string, readonly string[]>;

const relationTargets: Map<string, Map<string, string>> = new Map(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    new Map(m.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type])),
  ]),
);

/**
 * Masks declared PII fields of `model` (and of nested relations, resolved via the Prisma DMMF).
 * Returns a new object; never mutates the input.
 */
export function maskModel<T>(model: string, data: T, pii: PiiMap): T {
  if (data === null || data === undefined || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((row) => maskModel(model, row, pii)) as T;
  if (data instanceof Date) return data;
  const fields = pii.get(model) ?? [];
  const relations = relationTargets.get(model);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (fields.includes(key)) out[key] = maskValue(value);
    else if (relations?.has(key)) out[key] = maskModel(relations.get(key)!, value, pii);
    else out[key] = value;
  }
  return out as T;
}

export function maskForUser<T>(user: CurrentUser, model: string, data: T, pii: PiiMap): T {
  return hasPermission(user, "pii:read") ? data : maskModel(model, data, pii);
}
