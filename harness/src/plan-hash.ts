import { sha256Canonical } from "./rfc8785.ts";
import { SPEC_P1_PLANHASH_BINDINGS, type PlanDocument } from "./types.ts";

void SPEC_P1_PLANHASH_BINDINGS;

export function computeFactsDigest(
  plan: Pick<PlanDocument, "clusterUid" | "targetNamespaceUid" | "restoreNamespaceUid" | "target">,
): string {
  return sha256Canonical({
    clusterUid: plan.clusterUid,
    targetNamespaceUid: plan.targetNamespaceUid,
    restoreNamespaceUid: plan.restoreNamespaceUid,
    target: plan.target,
  });
}

export function planHash(plan: PlanDocument): string {
  return sha256Canonical(plan);
}
