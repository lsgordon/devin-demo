"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withPermission } from "@/platform/authz";
import { createFlag, decideChangeRequest, parseFlagPatch, parseNewFlag, updateFlag } from "@/apps/flags/service";
import { userError } from "@/apps/flags/http";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const withError = (path: string, msg: string) => `${path}?error=${encodeURIComponent(msg)}`;

export const createFlagAction = withPermission("flags:write", async (user, formData: FormData) => {
  let target: string;
  try {
    const input = parseNewFlag({
      key: str(formData, "key"),
      environment: str(formData, "environment"),
      description: str(formData, "description"),
      enabled: formData.get("enabled") ?? "false",
      rolloutPercent: str(formData, "rolloutPercent"),
    });
    const res = await createFlag(user, input, str(formData, "comment"));
    target = res.status === "applied" ? `/flags/${res.flag.id}` : `/flags/requests/${res.changeRequest.id}`;
  } catch (e) {
    const msg = userError(e);
    if (!msg) throw e;
    target = withError("/flags", msg);
  }
  revalidatePath("/flags");
  redirect(target);
});

export const updateFlagAction = withPermission("flags:write", async (user, formData: FormData) => {
  const id = str(formData, "id");
  let target: string;
  try {
    const patch = parseFlagPatch({
      description: str(formData, "description"),
      enabled: formData.get("enabled") ?? "false",
      rolloutPercent: str(formData, "rolloutPercent"),
    });
    const res = await updateFlag(user, id, patch, str(formData, "comment"));
    target = res.status === "applied" ? `/flags/${id}` : `/flags/requests/${res.changeRequest.id}`;
  } catch (e) {
    const msg = userError(e);
    if (!msg) throw e;
    target = withError(`/flags/${id}`, msg);
  }
  revalidatePath("/flags");
  revalidatePath(`/flags/${id}`);
  redirect(target);
});

export const decideChangeRequestAction = withPermission("flags:approve", async (user, formData: FormData) => {
  const id = str(formData, "changeRequestId");
  const decision = formData.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  let target = `/flags/requests/${id}`;
  try {
    await decideChangeRequest(user, id, decision, str(formData, "comment"));
  } catch (e) {
    const msg = userError(e);
    if (!msg) throw e;
    target = withError(target, msg);
  }
  revalidatePath("/flags");
  redirect(target);
});
