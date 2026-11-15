"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withPermission } from "@/platform/authz";
import { createRefund, decideRefund, parseDecision, ValidationError } from "@/apps/refunds/service";

export type FormState = { error?: string } | null;

export const createRefundAction = withPermission("refunds:write", async (user, _prev: FormState, formData: FormData): Promise<FormState> => {
  let id: string;
  try {
    id = (await createRefund(user, Object.fromEntries(formData))).id;
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/refunds");
  redirect(`/refunds/${id}`);
});

export const decideRefundAction = withPermission("refunds:approve", async (user, formData: FormData) => {
  const id = String(formData.get("id"));
  await decideRefund(user, id, parseDecision(formData.get("decision")), String(formData.get("comment") ?? ""));
  revalidatePath("/refunds");
  revalidatePath(`/refunds/${id}`);
});
