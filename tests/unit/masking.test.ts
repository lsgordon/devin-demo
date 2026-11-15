import { describe, expect, it } from "vitest";
import { maskModel, maskValue, maskForUser, MASK, isMasked } from "@/platform/pii/mask";
import { buildUser } from "@/platform/authz/core";

const pii = new Map([["ExampleRequest", ["dateOfBirth", "idNumber"]]]);
const row = { id: "x", customerName: "Testy McTestface", dateOfBirth: "1990-01-01", idNumber: "TEST-0000-1234" };
const analyst = buildUser({ oid: "a", tid: "t", username: "a", name: "a", roles: ["kyc_analyst"] });
const approver = buildUser({ oid: "b", tid: "t", username: "b", name: "b", roles: ["kyc_approver"] });

describe("PII masking", () => {
  it("keeps only the last 4 characters", () => {
    expect(maskValue("TEST-0000-1234")).toBe(`${MASK}1234`);
    expect(maskValue("abc")).toBe(MASK);
    expect(maskValue(null)).toBe(null);
    expect(maskValue(new Date("1990-01-01T00:00:00Z"))).toBe(`${MASK}1-01`);
  });

  it("is idempotent", () => {
    expect(maskValue(maskValue("TEST-0000-1234"))).toBe(`${MASK}1234`);
  });

  it("masks declared fields only, and arrays of rows", () => {
    const [out] = maskModel("ExampleRequest", [row], pii);
    expect(out).toEqual({ ...row, dateOfBirth: `${MASK}1-01`, idNumber: `${MASK}1234` });
    expect(JSON.stringify(out)).not.toContain("TEST-0000-1234");
    expect(isMasked(out.idNumber)).toBe(true);
  });

  it("does not mutate the input", () => {
    maskModel("ExampleRequest", row, pii);
    expect(row.idNumber).toBe("TEST-0000-1234");
  });

  it("applies unless the user has pii:read", () => {
    expect(maskForUser(analyst, "ExampleRequest", row, pii).idNumber).toBe(`${MASK}1234`);
    expect(maskForUser(approver, "ExampleRequest", row, pii).idNumber).toBe("TEST-0000-1234");
  });
});
