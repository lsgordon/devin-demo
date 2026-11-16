import { describe, expect, it } from "vitest";
import { auditChanges, displayValue } from "@/platform/audit/summary";

describe("audit change summary", () => {
  it("keeps free text that merely starts with a timestamp", () => {
    const note = "2026-11-15T10:00:00Z Customer called";
    expect(displayValue(note)).toBe(note);
    expect(auditChanges(null, { body: note })).toEqual([{ key: "body", label: "Body", from: undefined, to: note }]);
  });

  it("formats real timestamps and enum values", () => {
    expect(displayValue("2026-11-15T10:00:00.000Z")).toBe("Nov 15, 2026, 10:00 AM UTC");
    expect(displayValue("PENDING_APPROVAL")).toBe("Pending approval");
    expect(displayValue("ABC123")).toBe("ABC123");
    expect(displayValue("ORD-TEST-0001")).toBe("ORD-TEST-0001");
  });

  it("shows reassignment as previous and new assignee, resolving names with an OID fallback", () => {
    const names = new Map([["oid-a", "Fakey McFakeface"]]);
    const diff = auditChanges(
      { id: "kyc-0003", assigneeOid: "oid-a", updatedAt: "2026-11-15T10:00:00Z" },
      { id: "kyc-0003", assigneeOid: "oid-b", updatedAt: "2026-11-15T11:00:00Z" },
      (oid) => names.get(oid),
    );
    expect(diff).toEqual([{ key: "assigneeOid", label: "Assignee", from: "Fakey McFakeface", to: "oid-b" }]);
  });
});
