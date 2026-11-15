"use server";

import { revalidatePath } from "next/cache";
import { withPermission } from "@/platform/authz";
import { formInput, parseAssignment, parseDecision, parseNote, parseRecommendation } from "@/apps/kyc/input";
import { addNote, decide, reassign, recommend } from "@/apps/kyc/service";

const caseId = (formData: FormData) => String(formData.get("caseId") ?? "");

export const addNoteAction = withPermission("kyc:write", async (user, formData: FormData) => {
  const { body } = parseNote(formInput(formData));
  await addNote(user, caseId(formData), body);
  revalidatePath(`/kyc/${caseId(formData)}`);
});

export const recommendAction = withPermission("kyc:write", async (user, formData: FormData) => {
  const { recommendation, reason } = parseRecommendation(formInput(formData));
  await recommend(user, caseId(formData), recommendation, reason);
  revalidatePath(`/kyc/${caseId(formData)}`);
});

export const reassignAction = withPermission("kyc:approve", async (user, formData: FormData) => {
  const { assigneeOid } = parseAssignment(formInput(formData));
  await reassign(user, caseId(formData), assigneeOid);
  revalidatePath(`/kyc/${caseId(formData)}`);
});

export const decideAction = withPermission("kyc:approve", async (user, formData: FormData) => {
  const { decision, comment } = parseDecision(formInput(formData));
  await decide(user, caseId(formData), decision, comment);
  revalidatePath(`/kyc/${caseId(formData)}`);
});
