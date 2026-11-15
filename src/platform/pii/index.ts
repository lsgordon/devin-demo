import type { CurrentUser } from "@/platform/authz/core";
import { PII_FIELDS } from "@/platform/apps/registry";
import { maskForUser } from "./mask";

export { maskValue, isMasked, MASK } from "./mask";

/**
 * Server-side serializer: mask PII declared in app manifests unless the user has pii:read.
 * scopedDb() reads are already masked; use this for anything else that crosses to the client
 * (e.g. data read with the raw client in platform code, audit before/after JSON).
 */
export function toClient<T>(user: CurrentUser, model: string, data: T): T {
  return maskForUser(user, model, data, PII_FIELDS);
}
