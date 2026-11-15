import { withPermission } from "@/platform/authz";
import { jsonInput, parseNote, respond } from "@/apps/kyc/input";
import { addNote } from "@/apps/kyc/service";

// POST /kyc/api/cases/:id/notes {body}
export const POST = withPermission("kyc:write", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return respond(async () => addNote(user, id, parseNote(await jsonInput(req)).body));
});
