import { sha256Canonical } from "./rfc8785.ts";
import { SPEC_P1_PLANHASH_BINDINGS, type PlanDocument } from "./types.ts";

void SPEC_P1_PLANHASH_BINDINGS;

export function planHash(plan: PlanDocument): string {
  return sha256Canonical(plan);
}
