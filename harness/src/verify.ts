import { reduceJournal, replayJournal } from "./journal.ts";
import { backupName, restoreClusterName, restoreName } from "./names.ts";
import { artifactDigestOf, evaluateOracle, FIXED_SCHEMA, SCHEMA_DIGEST, setA, setAB } from "./oracle.ts";
import { computeFactsDigest, planHash } from "./plan-hash.ts";
import { STARTUP_PINS } from "./pins.ts";
import { sha256Canonical } from "./rfc8785.ts";
import { admitDestination, admitEvidence, admitJournalEvent, admitRequest } from "./schema.ts";
import { verifyCanonical } from "./signature.ts";
import {
  APPROVAL_TTL_MS,
  PHASE1_VERDICTS,
  type ApprovalEnvelope,
  type EvidenceManifest,
  type JournalEvent,
  type TrustedApproval,
} from "./types.ts";

export type OfflineVerifyInput = {
  request: unknown;
  evidence: unknown;
  journal: unknown;
  artifactRows: unknown;
  artifactBytes: unknown;
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

function evidencePins() {
  return STARTUP_PINS.map((pin) => ({
    id: pin.id,
    admission: pin.admission,
    candidate: pin.candidate ?? "",
    digest: pin.digest ?? "",
  }));
}

function payloadOf(events: JournalEvent[], type: JournalEvent["type"]): Record<string, string> | undefined {
  return events.find((event) => event.type === type)?.payload;
}

export function verifyOffline(input: OfflineVerifyInput): OfflineVerifyResult {
  try {
    const request = admitRequest(input.request);
    const evidence = admitEvidence(input.evidence);
    admitDestination(request.plan.artifactDestination);
    if (!Array.isArray(input.journal)) {
      return fail("BLOCKED");
    }
    const events: JournalEvent[] = input.journal.map((item) => admitJournalEvent(item));
    replayJournal(events);
    const phase = reduceJournal(events);
    if (phase !== "closed" && phase !== "fence_blocked") {
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
    if (
      request.plan.factsDigest !== evidence.factsDigest ||
      computeFactsDigest(request.plan) !== evidence.facts.digest ||
      request.plan.factsSnapshotId !== evidence.factsSnapshotId ||
      request.plan.factsSnapshotId !== evidence.facts.snapshotId ||
      request.plan.factsSnapshotId !== evidence.intent.factsSnapshotId
    ) {
      return fail("BLOCKED");
    }
    if (
      !sameJson(request.plan.target, evidence.facts.target) ||
      evidence.facts.clusterUid !== request.plan.clusterUid ||
      evidence.facts.targetNamespaceUid !== request.plan.targetNamespaceUid ||
      evidence.facts.restoreNamespaceUid !== request.plan.restoreNamespaceUid
    ) {
      return fail("BLOCKED");
    }
    if (
      evidence.intent.operationId !== request.operationId ||
      evidence.intent.planHash !== request.planHash ||
      evidence.intent.factsDigest !== request.plan.factsDigest
    ) {
      return fail("BLOCKED");
    }
    if (
      evidence.trustIdentity.approvalKeyId !== request.approval.keyId ||
      evidence.trustIdentity.approvalKeyId !== evidence.approval.keyId ||
      evidence.trustIdentity.approvalSubject !== request.plan.requiredApproverSubject ||
      evidence.trustIdentity.approvalSubject !== evidence.approval.approverSubject ||
      evidence.trustIdentity.approvalPolicyVersion !== request.plan.approvalPolicyVersion ||
      evidence.trustIdentity.approvalRole !== request.plan.requiredApproverRole
    ) {
      return fail("BLOCKED");
    }
    if (events.some((event) => event.operationId !== request.operationId)) {
      return fail("BLOCKED");
    }
    if (!(PHASE1_VERDICTS as readonly string[]).includes(evidence.verdict)) {
      return fail("BLOCKED");
    }
    const intent = events[0];
    if (!intent || intent.type !== "IntentAccepted" || intent.payload.planHash !== request.planHash) {
      return fail("BLOCKED");
    }
    if (
      intent.payload.factsDigest !== request.plan.factsDigest ||
      intent.payload.targetDigest !== sha256Canonical(request.plan.target) ||
      Number(intent.payload.startedAtMs) !== evidence.intent.startedAtMs ||
      Number(intent.payload.deadlineMs) !== evidence.intent.deadlineMs ||
      Number(intent.payload.deadlineMs) !== Number(intent.payload.startedAtMs) + request.plan.timeoutMs
    ) {
      return fail("BLOCKED");
    }
    if (
      evidence.timeline.startedAtMs !== Number(intent.payload.startedAtMs) ||
      evidence.timeline.deadlineMs !== Number(intent.payload.deadlineMs)
    ) {
      return fail("BLOCKED");
    }
    const consumed = events.find((event) => event.type === "ApprovalConsumed");
    if (!consumed || consumed.payload.approvalDigest !== sha256Canonical(request.approval)) {
      return fail("UNAPPROVED");
    }
    const approvalText = consumed.payload.approval;
    const consumedAt = Number(consumed.payload.consumedAt);
    if (!approvalText || !Number.isFinite(consumedAt)) {
      return fail("UNAPPROVED");
    }
    const storedApproval = JSON.parse(approvalText) as ApprovalEnvelope;
    if (!sameJson(storedApproval, request.approval) || !sameJson(storedApproval, evidence.approval)) {
      return fail("UNAPPROVED");
    }
    if (
      evidence.approval.expiresAt - evidence.approval.issuedAt > APPROVAL_TTL_MS ||
      evidence.approval.issuedAt > evidence.approval.expiresAt ||
      consumedAt < evidence.approval.issuedAt ||
      consumedAt > evidence.approval.expiresAt ||
      Number(intent.payload.startedAtMs) > consumedAt ||
      evidence.timeline.closedAtMs < consumedAt
    ) {
      return fail("UNAPPROVED");
    }
    const trusted = input.keys.approval[evidence.approval.keyId];
    if (!trusted) {
      return fail("UNAPPROVED");
    }
    if (trusted.subject !== request.plan.requiredApproverSubject || trusted.role !== request.plan.requiredApproverRole) {
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
    const terminal = events.find((event) => event.type === "EvidenceClosed" || event.type === "FenceReleaseBlocked");
    if (!terminal || terminal.payload.evidenceDigest !== sha256Canonical(evidence) || terminal.payload.signature !== evidence.signature) {
      return fail("BLOCKED");
    }
    if (terminal.payload.planHash !== request.planHash || terminal.payload.verdict !== evidence.verdict) {
      return fail("BLOCKED");
    }
    if (Number(terminal.payload.closedAtMs) !== evidence.timeline.closedAtMs) {
      return fail("BLOCKED");
    }
    if (
      evidence.timeline.closedAtMs < evidence.timeline.startedAtMs ||
      evidence.timeline.closedAtMs > evidence.timeline.deadlineMs
    ) {
      return fail("BLOCKED");
    }
    if (phase === "fence_blocked" && (terminal.type !== "FenceReleaseBlocked" || evidence.verdict !== "FENCE_RELEASE_BLOCKED")) {
      return fail("BLOCKED");
    }
    if (phase === "closed" && (terminal.type !== "EvidenceClosed" || evidence.verdict === "FENCE_RELEASE_BLOCKED")) {
      return fail("BLOCKED");
    }
    if (terminal.type === "FenceReleaseBlocked" && evidence.verdict !== "FENCE_RELEASE_BLOCKED") {
      return fail("BLOCKED");
    }
    if (evidence.verdict === "OK" && evidence.driftedDuring) {
      return fail("BLOCKED");
    }
    if (evidence.verdict === "TARGET_DRIFTED_DURING_OPERATION" && !evidence.driftedDuring) {
      return fail("BLOCKED");
    }
    if (
      (evidence.verdict === "OK" || (evidence.verdict === "FENCE_RELEASE_BLOCKED" && !evidence.driftedDuring)) &&
      (evidence.targetPost.uid !== evidence.targetPre.uid ||
        evidence.targetPost.generation !== evidence.targetPre.generation ||
        evidence.targetPost.specDigest !== evidence.targetPre.specDigest ||
        evidence.targetPost.name !== evidence.targetPre.name ||
        evidence.targetPost.namespace !== evidence.targetPre.namespace)
    ) {
      return fail("BLOCKED");
    }
    if (
      evidence.verdict === "TARGET_DRIFTED_DURING_OPERATION" &&
      evidence.targetPost.uid === evidence.targetPre.uid &&
      evidence.targetPost.generation === evidence.targetPre.generation &&
      evidence.targetPost.specDigest === evidence.targetPre.specDigest
    ) {
      return fail("BLOCKED");
    }
    if (intent.eventDigest !== evidence.journalRoot) {
      return fail("BLOCKED");
    }
    const store = events.find((event) => event.type === "EvidenceStoreWriteAhead");
    if (
      !store ||
      store.payload.evidenceDigest !== terminal.payload.evidenceDigest ||
      store.previousEventDigest !== evidence.journalHead ||
      store.payload.verdict !== evidence.verdict ||
      store.payload.closedAtMs !== String(evidence.timeline.closedAtMs) ||
      store.payload.driftedDuring !== (evidence.driftedDuring ? "true" : "false")
    ) {
      return fail("BLOCKED");
    }
    const fence = `${request.operationId}:${request.planHash}`;
    const expectedBackup = backupName(request.operationId);
    const expectedRestore = restoreName(request.operationId);
    const expectedCluster = restoreClusterName(request.operationId);
    if (
      payloadOf(events, "FenceWriteAhead")?.fence !== fence ||
      payloadOf(events, "FenceSet")?.fence !== fence ||
      payloadOf(events, "FenceReleaseWriteAhead")?.fence !== fence
    ) {
      return fail("BLOCKED");
    }
    if (
      payloadOf(events, "BackupWriteAhead")?.name !== expectedBackup ||
      payloadOf(events, "SetBWriteAhead")?.name !== request.plan.target.name ||
      payloadOf(events, "SetBApplied")?.digest !== sha256Canonical(setAB()) ||
      payloadOf(events, "SetBApplied")?.count !== "1100" ||
      payloadOf(events, "RestoreWriteAhead")?.name !== expectedRestore ||
      payloadOf(events, "RestoreClusterCreated")?.name !== expectedCluster ||
      payloadOf(events, "RestoreCreated")?.name !== expectedRestore
    ) {
      return fail("BLOCKED");
    }
    const backup = events.find((event) => event.type === "BackupCreated");
    if (!backup || backup.payload.artifactId !== evidence.backupArtifactId || backup.payload.artifactDigest !== evidence.backupArtifactDigest) {
      return fail("BLOCKED");
    }
    if (backup.payload.name !== expectedBackup) {
      return fail("BLOCKED");
    }
    if (
      evidence.effects.backup.kind !== "PerconaServerMySQLBackup" ||
      evidence.effects.backup.namespace !== request.plan.target.namespace ||
      evidence.effects.backup.name !== expectedBackup ||
      evidence.effects.backup.uid !== `${request.operationId}-backup` ||
      evidence.effects.backup.generation !== 1
    ) {
      return fail("BLOCKED");
    }
    if (
      evidence.effects.restoreCluster.kind !== "PerconaServerMySQL" ||
      evidence.effects.restoreCluster.namespace !== request.plan.restoreNamespace ||
      evidence.effects.restoreCluster.name !== expectedCluster ||
      evidence.effects.restoreCluster.uid !== `${request.operationId}-cluster` ||
      evidence.effects.restoreCluster.generation !== 1
    ) {
      return fail("BLOCKED");
    }
    if (
      evidence.effects.restore.kind !== "PerconaServerMySQLRestore" ||
      evidence.effects.restore.namespace !== request.plan.restoreNamespace ||
      evidence.effects.restore.name !== expectedRestore ||
      evidence.effects.restore.uid !== `${request.operationId}-restore` ||
      evidence.effects.restore.generation !== 1
    ) {
      return fail("BLOCKED");
    }
    if (!sameJson(evidence.artifactDestination, request.plan.artifactDestination)) {
      return fail("BLOCKED");
    }
    if (!sameJson(evidence.pins, evidencePins()) || evidence.pinsDigest !== sha256Canonical(STARTUP_PINS)) {
      return fail("BLOCKED");
    }
    const expected = evaluateOracle(setA(), { ...FIXED_SCHEMA });
    if (
      evidence.oracle.count !== expected.count ||
      evidence.oracle.orderedRowHash !== expected.orderedRowHash ||
      evidence.oracle.setBAbsent !== expected.setBAbsent ||
      evidence.oracle.schemaDigest !== SCHEMA_DIGEST ||
      evidence.oracle.primaryKeyMin !== 1 ||
      evidence.oracle.primaryKeyMax !== 1000 ||
      evidence.observedSchemaDigest !== SCHEMA_DIGEST ||
      evidence.artifactDigest !== evidence.backupArtifactDigest
    ) {
      return fail("BLOCKED");
    }
    if (typeof input.artifactBytes !== "string" || input.artifactBytes.length < 1) {
      return fail("BLOCKED");
    }
    if (artifactDigestOf(input.artifactBytes) !== evidence.backupArtifactDigest) {
      return fail("BLOCKED");
    }
    if (!isRowArray(input.artifactRows)) {
      return fail("BLOCKED");
    }
    if (sha256Canonical(input.artifactRows) === evidence.artifactDigest) {
      return fail("BLOCKED");
    }
    const liveOracle = evaluateOracle(input.artifactRows, { ...FIXED_SCHEMA });
    if (
      liveOracle.count !== evidence.oracle.count ||
      liveOracle.orderedRowHash !== evidence.oracle.orderedRowHash ||
      liveOracle.setBAbsent !== evidence.oracle.setBAbsent ||
      liveOracle.schemaDigest !== evidence.oracle.schemaDigest ||
      liveOracle.primaryKeyMin !== evidence.oracle.primaryKeyMin
    ) {
      return fail("BLOCKED");
    }
    return { ok: true, reason: evidence.verdict };
  } catch {
    return fail("BLOCKED");
  }
}
