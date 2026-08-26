import { sha256Canonical } from "./canonical.ts";
import type { LiveFacts, Plan } from "./types.ts";

export function planHash(plan: Plan): string {
  return sha256Canonical(plan);
}

export function factsFingerprint(facts: LiveFacts): string {
  return sha256Canonical(facts);
}
