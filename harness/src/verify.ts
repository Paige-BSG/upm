import { reduceJournal, replayJournal } from "./journal.ts";
import { setA } from "./oracle.ts";
import { computeFactsDigest, planHash } from "./plan-hash.ts";
import { STARTUP_PINS } from "./pins.ts";
import { sha256Canonical } from "./rfc8785.ts";
import { admitEvidence, admitJournalEvent, admitRequest } from "./schema.ts";
import { verifyCanonical } from "./signature.ts";
import type { ApprovalEnvelope, EvidenceManifest, JournalEvent, TrustedApproval } from "./types.ts";
import { evaluateOracle, FIXED_SCHEMA } from "./oracle.ts";

export type OfflineVerifyInput = {
  request: unknown;
  evidence: unknown;
  journal: unknown;
  artifactRows: unknown;
  keys: {
    approval: Record<string, TrustedApproval>;
    execution: { keyId: string; publicKeyPem: string };
  };
};

export type OfflineVerifyResult = { ok: boolean; reason: string };

function fail(reason: string): OfflineVerifyResult {
  return { ok: false, reason };
}

function sameJson(left: unknown, right: unknown): boolean {
  return sha256Canonical(left) === sha256Canonical(right);
}

function unsignedApproval(envelope: ApprovalEnvelope): Omit<ApprovalEnvelope, "signature"> {
  return {
    approvalId: envelope.approvalId,
    planHash: envelope.planHash,
    approverSubject: envelope.approverSubject,
    keyId: envelope.keyId,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    nonce: envelope.nonce,
  };
}

function isRowArray(value: unknown): value is { id: number; payload: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as { id?: unknown }).id === "number" &&
        typeof (row as { payload?: unknown }).payload === "string",
    )
  );
}

export function verifyOffline(input: OfflineVerifyInput): OfflineVerifyResult {
  try {
    const request = admitRequest(input.request);
    const evidence = admitEvidence(input.evidence);
    if (!Array.isArray(input.journal)) {
      return fail("BLOCKED");
    }
    const events: JournalEvent[] = input.journal.map((item) => admitJournalEvent(item));
    replayJournal(events);
    if (reduceJournal(events) !== "closed") {
      return fail("BLOCKED");
    }
    if (planHash(request.plan) !== request.planHash || request.planHash !== evidence.planHash) {
      return fail("PLAN_HASH_MISMATCH");
    }
    if (request.operationId !== evidence.operationId || request.plan.actor !== evidence.actor) {
      return fail("BLOCKED");
    }
    if (request.plan.clusterUid !== evidence.clusterUid) {
      return fail("BLOCKED");
    }
    if (request.plan.target.namespace !== evidence.sourceNamespace || request.plan.restoreNamespace !== evidence.restoreNamespace) {
      return fail("BLOCKED");
    }
    if (!sameJson(request.plan.target, evidence.targetPre) || !sameJson(request.approval, evidence.approval)) {
      return fail("BLOCKED");
    }
    if (request.plan.factsDigest !== evidence.factsDigest || computeFactsDigest(request.plan) !== evidence.facts.digest) {
      return fail("BLOCKED");
    }
    if (events.some((event) => event.operationId !== request.operationId)) {
      return fail("BLOCKED");
    }
    const intent = events[0];
    if (!intent || intent.type !== "IntentAccepted" || intent.payload.planHash !== request.planHash) {
      return fail("BLOCKED");
    }
    const consumed = events.find((event) => event.type === "ApprovalConsumed");
    if (!consumed || consumed.payload.approvalDigest !== sha256Canonical(request.approval)) {
      return fail("UNAPPROVED");
    }
    const trusted = input.keys.approval[evidence.approval.keyId];
    if (!trusted) {
      return fail("UNAPPROVED");
    }
    if (trusted.subject !== request.plan.requiredApproverSubject || trusted.subject !== evidence.approval.approverSubject) {
      return fail("UNAPPROVED");
    }
    if (trusted.role !== request.plan.requiredApproverRole || trusted.role !== evidence.trustIdentity.approvalRole) {
      return fail("UNAPPROVED");
    }
    if (evidence.approval.planHash !== request.planHash) {
      return fail("UNAPPROVED");
    }
    if (!verifyCanonical(trusted.publicKeyPem, unsignedApproval(evidence.approval), evidence.approval.signature)) {
      return fail("UNAPPROVED");
    }
    if (input.keys.execution.keyId !== evidence.keyId || input.keys.execution.keyId !== evidence.trustIdentity.executionKeyId) {
      return fail("BLOCKED");
    }
    const { signature, ...unsigned } = evidence;
    if (!verifyCanonical(input.keys.execution.publicKeyPem, unsigned as Omit<EvidenceManifest, "signature">, signature)) {
      return fail("BLOCKED");
    }
    const closed = events.find((event) => event.type === "EvidenceClosed");
    if (!closed || closed.payload.evidenceDigest !== sha256Canonical(evidence) || closed.payload.signature !== evidence.signature) {
      return fail("BLOCKED");
    }
    if (closed.payload.planHash !== request.planHash || closed.payload.verdict !== evidence.verdict) {
      return fail("BLOCKED");
    }
    if (intent.eventDigest !== evidence.journalRoot) {
      return fail("BLOCKED");
    }
    const beforeClose = events.filter((event) => event.type !== "EvidenceClosed" && event.type !== "FenceReleaseBlocked");
    const head = beforeClose[beforeClose.length - 1];
    if (!head || head.eventDigest !== evidence.journalHead) {
      return fail("BLOCKED");
    }
    const backup = events.find((event) => event.type === "BackupCreated");
    if (!backup || backup.payload.artifactId !== evidence.backupArtifactId || backup.payload.artifactDigest !== evidence.backupArtifactDigest) {
      return fail("BLOCKED");
    }
    if (evidence.artifactDestination !== request.plan.artifactDestination) {
      return fail("BLOCKED");
    }
    if (evidence.pinsDigest !== sha256Canonical(STARTUP_PINS)) {
      return fail("BLOCKED");
    }
    const expected = evaluateOracle(setA(), { ...FIXED_SCHEMA });
    if (
      evidence.oracle.count !== expected.count ||
      evidence.oracle.orderedRowHash !== expected.orderedRowHash ||
      evidence.oracle.setBAbsent !== expected.setBAbsent ||
      evidence.oracle.schemaDigest !== expected.schemaDigest ||
      evidence.backupArtifactDigest !== sha256Canonical(setA())
    ) {
      return fail("BLOCKED");
    }
    if (!isRowArray(input.artifactRows)) {
      return fail("BLOCKED");
    }
    if (sha256Canonical(input.artifactRows) !== evidence.backupArtifactDigest) {
      return fail("BLOCKED");
    }
    const liveOracle = evaluateOracle(input.artifactRows, { ...FIXED_SCHEMA });
    if (
      liveOracle.count !== evidence.oracle.count ||
      liveOracle.orderedRowHash !== evidence.oracle.orderedRowHash ||
      liveOracle.setBAbsent !== evidence.oracle.setBAbsent ||
      liveOracle.schemaDigest !== evidence.oracle.schemaDigest
    ) {
      return fail("BLOCKED");
    }
    return { ok: true, reason: "OK" };
  } catch {
    return fail("BLOCKED");
  }
}
