const SMALL_WORDS = new Set(["of", "and", "or", "to", "by"]);
const ACRONYMS = new Set(["id", "kyc", "pii", "dob"]);

/** "PENDING_APPROVAL" -> "Pending approval", "rolloutPercent" -> "Rollout percent". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/);
  return words
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .map((w, i) => (i === 0 && !SMALL_WORDS.has(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** Stable server-side timestamp (UTC) for tables and detail pages. */
export const formatDateTime = (d: Date | string | null | undefined) => (d ? `${DATE_TIME.format(new Date(d))} UTC` : "—");
export const formatDate = (d: Date | string | null | undefined) => (d ? DATE.format(new Date(d)) : "—");

/** "Testy McTestface" -> "TM"; "kyc.analyst1@example.com" -> "KA". */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.split("@")[0];
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export type Tone = "green" | "amber" | "red" | "blue" | "gray";

const TONES: Record<string, Tone> = {
  APPROVED: "green", APPROVE: "green", ON: "green", ENABLED: "green",
  REJECTED: "red", REJECT: "red",
  PENDING: "amber", PENDING_APPROVAL: "amber",
  SUBMITTED: "blue", IN_REVIEW: "blue",
  DRAFT: "gray", OFF: "gray",
};

export const toneFor = (status: string): Tone => TONES[status.toUpperCase()] ?? "gray";
