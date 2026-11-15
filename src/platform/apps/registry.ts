import { manifests } from "./registry.generated";
import type { AppManifest, ScopeRule } from "./define";

/** All app manifests, auto-discovered from src/apps/<app>/manifest.ts by scripts/generate-registry.ts. */
export const APPS: readonly AppManifest[] = manifests;

export const SCOPE_RULES: ReadonlyMap<string, ScopeRule> = new Map(
  APPS.flatMap((m) => Object.entries(m.scopes)),
);

export const PII_FIELDS: ReadonlyMap<string, readonly string[]> = new Map(
  APPS.flatMap((m) => Object.entries(m.pii ?? {})),
);
