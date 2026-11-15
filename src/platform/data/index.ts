import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/platform/db/client";
import type { CurrentUser } from "@/platform/authz/core";
import { hasPermission } from "@/platform/authz/core";
import { NotFoundError } from "@/platform/authz/errors";
import type { ScopeRule } from "@/platform/apps/define";
import { PII_FIELDS, SCOPE_RULES } from "@/platform/apps/registry";
import { isMasked, maskForUser } from "@/platform/pii/mask";
import { writeAudit, type AuditEntryInput } from "@/platform/audit/write";
import { applyScope, DENY_ALL, scopeWhere } from "./scope";

const PLATFORM_SCOPES: Record<string, ScopeRule> = {
  Approval: "unscoped",
  AuditLog: (user) => (hasPermission(user, "audit:read") ? null : DENY_ALL),
};

const SCOPED_OPS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow",
  "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany",
]);
const MASKED_RESULT_OPS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow",
  "create", "createManyAndReturn", "update", "updateManyAndReturn", "delete", "upsert",
]);
const WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert"]);

export function ruleFor(model: string): ScopeRule {
  const rule = SCOPE_RULES.get(model) ?? PLATFORM_SCOPES[model];
  if (!rule) throw new Error(`Model ${model} has no scope rule. Declare it in its app manifest \`scopes\`.`);
  return rule;
}

function assertNoMaskedPii(model: string, args: Record<string, unknown>) {
  const fields = PII_FIELDS.get(model);
  if (!fields?.length) return;
  const payloads = [args.data, args.create, args.update].flat().filter(Boolean) as Record<string, unknown>[];
  for (const p of payloads) {
    for (const f of fields) {
      if (isMasked(p[f])) throw new Error(`Refusing to write masked PII to ${model}.${f}`);
    }
  }
}

/**
 * Prisma client for app code, bound to the current user:
 *  - every read/update/delete on a model gets the model's row scope (from the app manifest);
 *  - out-of-scope findUniqueOrThrow/update/delete -> NotFoundError (HTTP 404, existence not leaked);
 *  - PII fields in results are masked unless the user has pii:read;
 *  - upsert on scoped models is blocked (it would create when the row is out of scope);
 *  - writing a masked value back into a PII field throws.
 */
export function scopedDb(user: CurrentUser) {
  return db.$extends({
    name: "platform-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const rule = ruleFor(model);
          const scope = scopeWhere(user, rule);
          const a = { ...(args as Record<string, unknown>) };
          if (WRITE_OPS.has(operation)) assertNoMaskedPii(model, a);
          if (operation === "upsert" && scope) throw new Error(`upsert is not allowed on scoped model ${model}`);
          if (SCOPED_OPS.has(operation)) a.where = applyScope(a.where as Record<string, unknown> | undefined, scope);
          let result: unknown;
          try {
            result = await query(a as typeof args);
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw new NotFoundError();
            throw e;
          }
          return MASKED_RESULT_OPS.has(operation) ? maskForUser(user, model, result, PII_FIELDS) : result;
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
export type ScopedTx = Omit<ScopedDb, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type MutationContext = {
  user: CurrentUser;
  tx: ScopedTx;
  /** Record an audit entry in the SAME transaction as the mutation. */
  audit: (entry: AuditEntryInput) => Promise<void>;
};

/**
 * Run a mutation in one DB transaction with a scoped client and an audit writer.
 * Throws (and rolls back) if the mutation records no audit entry.
 */
export async function mutate<T>(user: CurrentUser, fn: (ctx: MutationContext) => Promise<T>): Promise<T> {
  return scopedDb(user).$transaction(async (tx) => {
    let entries = 0;
    const audit = async (entry: AuditEntryInput) => {
      await writeAudit(tx, user, entry);
      entries++;
    };
    const result = await fn({ user, tx, audit });
    if (entries === 0) throw new Error("mutate(): every mutation must record at least one audit entry");
    return result;
  });
}

export { NotFoundError };
