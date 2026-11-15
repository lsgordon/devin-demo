import { describe, expect, it } from "vitest";
import { applyScope, scopeWhere } from "@/platform/data/scope";
import { buildUser } from "@/platform/authz/core";

const analyst = buildUser({ oid: "oid-a", tid: "t", username: "a", name: "a", roles: ["kyc_analyst"] });
const approver = buildUser({ oid: "oid-b", tid: "t", username: "b", name: "b", roles: ["kyc_approver"] });
const rule = { ownerField: "assigneeOid", allPermission: "kyc:read_all" } as const;

describe("row scoping", () => {
  it("restricts makers to their own rows and lets read_all see everything", () => {
    expect(scopeWhere(analyst, rule)).toEqual({ assigneeOid: "oid-a" });
    expect(scopeWhere(approver, rule)).toBeNull();
  });

  it("supports explicit unscoped and custom rules", () => {
    expect(scopeWhere(analyst, "unscoped")).toBeNull();
    expect(scopeWhere(analyst, (u) => ({ team: u.oid }))).toEqual({ team: "oid-a" });
  });

  it("keeps unique fields at the top level and appends to AND", () => {
    expect(applyScope({ id: "1" }, { assigneeOid: "oid-a" })).toEqual({ id: "1", AND: [{ assigneeOid: "oid-a" }] });
    expect(applyScope({ id: "1", AND: { status: "X" } }, { assigneeOid: "oid-a" })).toEqual({
      id: "1",
      AND: [{ status: "X" }, { assigneeOid: "oid-a" }],
    });
    expect(applyScope(undefined, { assigneeOid: "oid-a" })).toEqual({ AND: [{ assigneeOid: "oid-a" }] });
    expect(applyScope({ id: "1" }, null)).toEqual({ id: "1" });
  });
});
