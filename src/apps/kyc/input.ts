/** Input parsing shared by the kyc server actions and route handlers. */

export class KycInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "KycInputError";
  }
}

export type Recommendation = "APPROVE" | "REJECT";
type Input = Record<string, unknown>;

const MAX_TEXT = 2000;

function text(input: Input, key: string, { required }: { required: boolean }): string {
  const raw = input[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (raw !== undefined && raw !== null && typeof raw !== "string") throw new KycInputError(`${key} must be a string`);
  if (required && !value) throw new KycInputError(`${key} is required`);
  if (value.length > MAX_TEXT) throw new KycInputError(`${key} must be at most ${MAX_TEXT} characters`);
  return value;
}

function choice(input: Input, key: string): Recommendation {
  const value = input[key];
  if (value !== "APPROVE" && value !== "REJECT") throw new KycInputError(`${key} must be APPROVE or REJECT`);
  return value;
}

export const parseNote = (input: Input) => ({ body: text(input, "body", { required: true }) });
export const parseRecommendation = (input: Input) => ({
  recommendation: choice(input, "recommendation"),
  reason: text(input, "reason", { required: false }),
});
export const parseAssignment = (input: Input) => ({ assigneeOid: text(input, "assigneeOid", { required: true }) });
export const parseDecision = (input: Input) => ({
  decision: choice(input, "decision"),
  comment: text(input, "comment", { required: false }),
});

export function formInput(formData: FormData): Input {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
}

/**
 * JSON body only, with an exact media type: browsers send application/json cross-origin only after a CORS
 * preflight (which this app never grants), so simple-request bodies (forms, text/plain) are refused.
 */
export async function jsonInput(req: Request): Promise<Input> {
  const mediaType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw new KycInputError("Content-Type must be application/json");
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new KycInputError("Body must be a JSON object");
  return body as Input;
}

/** Runs a route handler body: JSON result, or 400 for invalid input. Platform errors propagate to withPermission (403/404/409). */
export async function respond(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof KycInputError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
