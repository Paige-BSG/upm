import { reduceJournal, replayJournal } from "./journal.ts";
import { planHash } from "./plan-hash.ts";
import { admitEvidence, admitRequest } from "./schema.ts";
import { verifyCanonical } from "./signature.ts";
import type { ApprovalEnvelope, EvidenceManifest, JournalEvent } from "./types.ts";

export type OfflineVerifyInput = {
  request: unknown;
  evidence: unknown;
  journal: unknown;
  executionPublicKeyPem: string;
  approvalPublicKeyPem: string;
};

export type OfflineVerifyResult = { ok: boolean; reason: string };

function isJournal(value: unknown): value is JournalEvent[] {
  return Array.isArray(value);
}

export function verifyOffline(input: OfflineVerifyInput): OfflineVerifyResult {
  try {
    const request = admitRequest(input.request);
    const evidence = admitEvidence(input.evidence);
    if (!isJournal(input.journal)) {
      return { ok: false, reason: "BLOCKED" };
    }
    const events = replayJournal(input.journal);
    reduceJournal(events);
    if (planHash(request.plan) !== request.planHash || request.planHash !== evidence.planHash) {
      return { ok: false, reason: "PLAN_HASH_MISMATCH" };
    }
    if (evidence.approval.planHash !== request.planHash) {
      return { ok: false, reason: "UNAPPROVED" };
    }
    const unsignedApproval: Omit<ApprovalEnvelope, "signature"> = {
      approvalId: evidence.approval.approvalId,
      planHash: evidence.approval.planHash,
      approverSubject: evidence.approval.approverSubject,
      keyId: evidence.approval.keyId,
      issuedAt: evidence.approval.issuedAt,
      expiresAt: evidence.approval.expiresAt,
      nonce: evidence.approval.nonce,
    };
    if (!verifyCanonical(input.approvalPublicKeyPem, unsignedApproval, evidence.approval.signature)) {
      return { ok: false, reason: "UNAPPROVED" };
    }
    if (events[0]?.eventDigest !== evidence.journalRoot) {
      return { ok: false, reason: "BLOCKED" };
    }
    const beforeClose = events.filter((event) => event.type !== "EvidenceClosed" && event.type !== "FenceReleaseBlocked");
    const head = beforeClose[beforeClose.length - 1];
    if (!head || head.eventDigest !== evidence.journalHead) {
      return { ok: false, reason: "BLOCKED" };
    }
    if (!evidence.backupArtifactId || !evidence.backupArtifactDigest || !evidence.oracle.schemaDigest) {
      return { ok: false, reason: "BLOCKED" };
    }
    const { signature, ...unsigned } = evidence;
    if (!verifyCanonical(input.executionPublicKeyPem, unsigned as Omit<EvidenceManifest, "signature">, signature)) {
      return { ok: false, reason: "BLOCKED" };
    }
    return { ok: true, reason: "OK" };
  } catch {
    return { ok: false, reason: "BLOCKED" };
  }
}
