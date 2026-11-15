"use server";

import { revalidatePath } from "next/cache";
import { withPermission } from "@/platform/authz";
import { decide, submitForApproval } from "@/apps/example/service";

export const submitAction = withPermission("example:write", async (user, formData: FormData) => {
  const id = String(formData.get("id"));
  await submitForApproval(user, id, String(formData.get("comment") ?? ""));
  revalidatePath(`/example/${id}`);
});

export const decideAction = withPermission("example:approve", async (user, formData: FormData) => {
  const decision = formData.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const row = await decide(user, String(formData.get("approvalId")), decision, String(formData.get("comment") ?? ""));
  revalidatePath(`/example/${row.id}`);
});
