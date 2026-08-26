import { FakeK8s, readTarget, type CrObject } from "./fake-k8s.ts";
import { appendEvent, closedVerdict, reduceJournal } from "./journal.ts";
import { backupName, restoreClusterName, restoreName } from "./names.ts";
import { artifactDigestOf, encodeBackupArtifact, evaluateOracle, observeSetAB, schemaMatchesFixed } from "./oracle.ts";
import { computeFactsDigest, planHash } from "./plan-hash.ts";
import { STARTUP_PINS } from "./pins.ts";
import { agentHasPrivilege, writerMustAllow } from "./rbac.ts";
import { sha256Canonical } from "./rfc8785.ts";
import { admitEvidence, admitRequest } from "./schema.ts";
import { approvalFresh, signCanonical, verifyCanonical } from "./signature.ts";
import {
  AdapterConflictError,
  AdapterFailureError,
  AdapterTimeoutError,
  AdapterUnauthorizedError,
  API_VERSION,
  EVIDENCE_KIND,
  FENCE_ANNOTATION,
  PHASE1_BUDGET,
  SCHEMA_VERSION,
  SPEC_P1_DRIFT_DURING,
  SPEC_P1_RESUME_OR_BLOCKED,
  SPEC_P1_SCOPE_NONDESTRUCTIVE,
  SPEC_P1_TARGET_FENCE,
  type Actor,
  type AgentCapabilities,
  type ApprovalEnvelope,
  type DenialCode,
  type EffectIdentity,
  type EvidenceManifest,
  type JournalEvent,
  type JournalEventType,
  type OperationRecord,
  type TargetRef,
  type TrustedKeys,
} from "./types.ts";

void SPEC_P1_SCOPE_NONDESTRUCTIVE;
void SPEC_P1_TARGET_FENCE;
void SPEC_P1_DRIFT_DURING;
void SPEC_P1_RESUME_OR_BLOCKED;

export type CrashAfter =
  | JournalEventType
  | "afterFenceApi"
  | "afterReleaseApi"
  | "afterRestoreClusterApi"
  | "afterBackupApi"
  | "afterRestoreApi"
  | "afterSetBApi"
  | "afterEvidenceStore"
  | "afterEvidenceStoreWa"
  | "none";

export type ExecuteInput = {
  request: unknown;
  agent: AgentCapabilities;
  actor: Actor;
  cluster: FakeK8s;
  keys: TrustedKeys;
  nowMs: number;
  startedAtMs?: number;
  crashAfter?: CrashAfter;
};

export type ExecuteResult = {
  ok: boolean;
  replayed: boolean;
  denial: DenialCode | null;
  record: OperationRecord;
};

function result(record: OperationRecord, replayed: boolean): ExecuteResult {
  return { ok: record.denial === null && record.evidence !== null, replayed, denial: record.denial, record };
}

function deny(operationId: string, planHashValue: string, denial: DenialCode, replayed = false): ExecuteResult {
  return result(
    {
      operationId,
      planHash: planHashValue,
      denial,
      evidence: null,
      driftedDuring: denial === "TARGET_DRIFTED_DURING_OPERATION",
    },
    replayed,
  );
}

function sameTarget(left: TargetRef, right: TargetRef): boolean {
  return (
    left.uid === right.uid &&
    left.generation === right.generation &&
    left.resourceVersion === right.resourceVersion &&
    left.specDigest === right.specDigest &&
    left.namespace === right.namespace &&
    left.name === right.name
  );
}

function exactObject(left: CrObject, right: CrObject): boolean {
  return (
    left.kind === right.kind &&
    left.namespace === right.namespace &&
    left.name === right.name &&
    left.uid === right.uid &&
    left.generation === right.generation &&
    left.annotations.operationId === right.annotations.operationId &&
    left.annotations.planHash === right.annotations.planHash &&
    left.annotations.factsDigest === right.annotations.factsDigest &&
    sha256Canonical(left.spec) === sha256Canonical(right.spec) &&
    sha256Canonical(left.rows ?? null) === sha256Canonical(right.rows ?? null) &&
    sha256Canonical(left.observedSchema ?? null) === sha256Canonical(right.observedSchema ?? null) &&
    left.artifactId === right.artifactId &&
    left.artifactDigest === right.artifactDigest &&
    left.artifactBytes === right.artifactBytes &&
    left.backupStatus === right.backupStatus
  );
}

function verifyApproval(envelope: ApprovalEnvelope, planHashValue: string, subject: string, role: string, keys: TrustedKeys, nowMs: number): boolean {
  const trusted = keys.approval[envelope.keyId];
  if (!trusted) {
    return false;
  }
  if (trusted.subject !== envelope.approverSubject || trusted.subject !== subject) {
    return false;
  }
  if (trusted.role !== role) {
    return false;
  }
  if (envelope.planHash !== planHashValue) {
    return false;
  }
  if (!approvalFresh(envelope, nowMs)) {
    return false;
  }
  const unsigned: Omit<ApprovalEnvelope, "signature"> = {
    approvalId: envelope.approvalId,
    planHash: envelope.planHash,
    approverSubject: envelope.approverSubject,
    keyId: envelope.keyId,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    nonce: envelope.nonce,
  };
  return verifyCanonical(trusted.publicKeyPem, unsigned, envelope.signature);
}

function loadConsumed(events: JournalEvent[]): { envelope: ApprovalEnvelope; digest: string } | undefined {
  const event = events.find((item) => item.type === "ApprovalConsumed");
  if (!event?.payload.approval || !event.payload.approvalDigest) {
    return undefined;
  }
  const envelope = JSON.parse(event.payload.approval) as ApprovalEnvelope;
  return { envelope, digest: event.payload.approvalDigest };
}

function loadIntentClock(events: JournalEvent[]): { startedAtMs: number; deadlineMs: number } | undefined {
  const event = events.find((item) => item.type === "IntentAccepted");
  if (!event?.payload.startedAtMs || !event.payload.deadlineMs) {
    return undefined;
  }
  return { startedAtMs: Number(event.payload.startedAtMs), deadlineMs: Number(event.payload.deadlineMs) };
}

function effectOf(object: CrObject): EffectIdentity {
  return {
    kind: object.kind,
    namespace: object.namespace,
    name: object.name,
    uid: object.uid,
    generation: object.generation,
  };
}

function evidencePins(): EvidenceManifest["pins"] {
  return STARTUP_PINS.map((pin) => ({
    id: pin.id,
    admission: pin.admission,
    candidate: pin.candidate ?? "",
    digest: pin.digest ?? "",
  }));
}

function terminalChainOk(
  request: { operationId: string; planHash: string; plan: { actor: string }; approval: ApprovalEnvelope },
  events: JournalEvent[],
  evidence: EvidenceManifest | null,
): boolean {
  if (events.length === 0 || events.some((event) => event.operationId !== request.operationId)) {
    return false;
  }
  const intent = events[0];
  if (!intent || intent.type !== "IntentAccepted" || intent.payload.planHash !== request.planHash) {
    return false;
  }
  const consumed = loadConsumed(events);
  if (!consumed || consumed.digest !== sha256Canonical(request.approval) || consumed.digest !== sha256Canonical(consumed.envelope)) {
    return false;
  }
  if (!evidence) {
    return true;
  }
  return (
    evidence.operationId === request.operationId &&
    evidence.planHash === request.planHash &&
    evidence.actor === request.plan.actor &&
    sha256Canonical(evidence.approval) === consumed.digest
  );
}

export function executeBackupProof(input: ExecuteInput): ExecuteResult {
  try {
    return executeInner(input);
  } catch (error) {
    if (error instanceof TypeError) {
      return deny("unknown", "unknown", "BLOCKED");
    }
    if (error instanceof Error && (error.message === "SCHEMA" || error.message.startsWith("RFC8785"))) {
      return deny("unknown", "unknown", "BLOCKED");
    }
    throw error;
  } finally {
    input.cluster.deadlineMs = null;
  }
}

function executeInner(input: ExecuteInput): ExecuteResult {
  let request;
  try {
    request = admitRequest(input.request);
  } catch {
    return deny("unknown", "unknown", "BLOCKED");
  }
  const { agent, actor, cluster, keys, nowMs } = input;
  const crashAfter = input.crashAfter ?? "none";
  cluster.nowMs = Math.max(cluster.nowMs, nowMs);
  cluster.deadlineMs = null;
  if (request.plan.budget !== PHASE1_BUDGET) {
    return deny(request.operationId, request.planHash, "BLOCKED");
  }
  if (agentHasPrivilege(agent)) {
    return deny(request.operationId, request.planHash, "AGENT_PRIVILEGE");
  }
  if (request.operationId !== request.plan.operationId || actor.actorId !== request.plan.actor) {
    return deny(request.operationId, request.planHash, "DRIFT");
  }
  if (request.plan.target.namespace === request.plan.restoreNamespace) {
    return deny(request.operationId, request.planHash, "SAME_NAMESPACE");
  }
  if (planHash(request.plan) !== request.planHash) {
    return deny(request.operationId, request.planHash, "PLAN_HASH_MISMATCH");
  }
  if (cluster.clusterUid !== request.plan.clusterUid) {
    return deny(request.operationId, request.planHash, "DRIFT");
  }
  if (
    cluster.namespaceUids[request.plan.targetNamespace] !== request.plan.targetNamespaceUid ||
    cluster.namespaceUids[request.plan.restoreNamespace] !== request.plan.restoreNamespaceUid
  ) {
    return deny(request.operationId, request.planHash, "DRIFT");
  }
  if (!writerMustAllow(actor, request.plan.target.namespace, request.plan.restoreNamespace)) {
    return deny(request.operationId, request.planHash, "RBAC");
  }
  try {
    if (!cluster.acquireLease(actor, actor.actorId)) {
      return deny(request.operationId, request.planHash, "LEASE_CONTENDED");
    }
    const eventsFor = (): JournalEvent[] =>
      cluster.listJournal(actor).filter((event) => event.operationId === request.operationId);
    let events = eventsFor();
    const phase = reduceJournal(events);
    if (phase === "closed" || phase === "fence_blocked") {
      const closed = closedVerdict(events);
      const stored = closed.evidenceDigest ? cluster.getEvidence(closed.evidenceDigest) : undefined;
      const evidence = stored ? admitEvidence(stored) : null;
      if (!terminalChainOk(request, events, evidence) || (closed.evidenceDigest && (!evidence || sha256Canonical(evidence) !== closed.evidenceDigest))) {
        return deny(request.operationId, request.planHash, "BLOCKED", true);
      }
      if (evidence && closed.signature && closed.signature !== evidence.signature) {
        return deny(request.operationId, request.planHash, "BLOCKED", true);
      }
      if (evidence) {
        return result(
          {
            operationId: request.operationId,
            planHash: request.planHash,
            denial: closed.denial,
            driftedDuring: closed.denial === "TARGET_DRIFTED_DURING_OPERATION",
            evidence,
          },
          true,
        );
      }
      return deny(request.operationId, request.planHash, closed.denial ?? "BLOCKED", true);
    }
    if (events.length > 0 && events[0]!.payload.planHash !== request.planHash) {
      return deny(request.operationId, request.planHash, "BLOCKED", true);
    }
    const persistedClock = loadIntentClock(events);
    if (input.startedAtMs !== undefined && input.startedAtMs > nowMs) {
      return deny(request.operationId, request.planHash, "BLOCKED");
    }
    const startedAtMs = persistedClock?.startedAtMs ?? nowMs;
    const deadlineMs = persistedClock?.deadlineMs ?? startedAtMs + request.plan.timeoutMs;
    cluster.deadlineMs = deadlineMs;
    const pastDeadline = (): boolean => cluster.nowMs > deadlineMs;
    if (pastDeadline()) {
      return deny(request.operationId, request.planHash, "TIMEOUT");
    }
    let approval = request.approval;
    const consumed = loadConsumed(events);
    if (consumed) {
      if (sha256Canonical(request.approval) !== consumed.digest) {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      approval = consumed.envelope;
    } else {
      if (phase === "empty") {
        appendEvent(cluster, actor, request.operationId, "IntentAccepted", {
          planHash: request.planHash,
          startedAtMs: String(startedAtMs),
          deadlineMs: String(deadlineMs),
          factsDigest: request.plan.factsDigest,
          targetDigest: sha256Canonical(request.plan.target),
        });
        if (crashAfter === "IntentAccepted") {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
      }
      const consumedAt = cluster.nowMs;
      if (
        !verifyApproval(
          request.approval,
          request.planHash,
          request.plan.requiredApproverSubject,
          request.plan.requiredApproverRole,
          keys,
          consumedAt,
        )
      ) {
        return deny(request.operationId, request.planHash, "UNAPPROVED");
      }
      const digest = sha256Canonical(request.approval);
      appendEvent(cluster, actor, request.operationId, "ApprovalConsumed", {
        planHash: request.planHash,
        approvalId: request.approval.approvalId,
        approvalDigest: digest,
        approval: JSON.stringify(request.approval),
        consumedAt: String(consumedAt),
      });
      approval = request.approval;
      if (crashAfter === "ApprovalConsumed") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
    }
    if (pastDeadline()) {
      return deny(request.operationId, request.planHash, "TIMEOUT");
    }
    const fence = `${request.operationId}:${request.planHash}`;
    const live = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
    if (!live) {
      return deny(request.operationId, request.planHash, "DRIFT");
    }
    let currentPhase = reduceJournal(eventsFor());
    if (currentPhase === "approved") {
      const liveTarget = readTarget(live);
      if (!sameTarget(liveTarget, request.plan.target) || live.annotations[FENCE_ANNOTATION] !== undefined) {
        return deny(request.operationId, request.planHash, "DRIFT");
      }
      if (
        computeFactsDigest({
          clusterUid: cluster.clusterUid,
          targetNamespaceUid: cluster.namespaceUids[request.plan.target.namespace] ?? "",
          restoreNamespaceUid: cluster.namespaceUids[request.plan.restoreNamespace] ?? "",
          target: liveTarget,
        }) !== request.plan.factsDigest
      ) {
        return deny(request.operationId, request.planHash, "DRIFT");
      }
      appendEvent(cluster, actor, request.operationId, "FenceWriteAhead", { fence });
      if (crashAfter === "FenceWriteAhead") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      currentPhase = "fence_wa";
    }
    if (currentPhase === "fence_wa") {
      const again = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
      if (!again) {
        return deny(request.operationId, request.planHash, "DRIFT");
      }
      if (again.annotations[FENCE_ANNOTATION] === fence) {
        appendEvent(cluster, actor, request.operationId, "FenceSet", { fence });
      } else if (again.annotations[FENCE_ANNOTATION] === undefined) {
        cluster.patchFence(actor, request.plan.target, fence);
        if (crashAfter === "afterFenceApi") {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
        appendEvent(cluster, actor, request.operationId, "FenceSet", { fence });
      } else {
        return deny(request.operationId, request.planHash, "DRIFT");
      }
      if (crashAfter === "FenceSet") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
    } else if (
      currentPhase === "fenced" ||
      currentPhase === "backup_wa" ||
      currentPhase === "backed_up" ||
      currentPhase === "setb_wa" ||
      currentPhase === "setb_applied" ||
      currentPhase === "restore_wa" ||
      currentPhase === "restore_cluster" ||
      currentPhase === "restored"
    ) {
      const fencedLive = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
      if (fencedLive?.annotations[FENCE_ANNOTATION] !== fence) {
        return deny(request.operationId, request.planHash, "DRIFT");
      }
    }
    if (pastDeadline()) {
      return deny(request.operationId, request.planHash, "TIMEOUT");
    }
    const backup = backupName(request.operationId);
    const snapshot = cluster.snapshotRows(request.plan.target.namespace, request.plan.target.name);
    const observedSchema = cluster.get(
      actor,
      "PerconaServerMySQL",
      request.plan.target.namespace,
      request.plan.target.name,
    )?.observedSchema;
    if (!snapshot || !schemaMatchesFixed(observedSchema) || !observedSchema) {
      return deny(request.operationId, request.planHash, "BLOCKED");
    }
    const backupObject: CrObject = {
      kind: "PerconaServerMySQLBackup",
      namespace: request.plan.target.namespace,
      name: backup,
      uid: `${request.operationId}-backup`,
      generation: 1,
      resourceVersion: "1",
      annotations: {
        operationId: request.operationId,
        planHash: request.planHash,
        factsDigest: request.plan.factsDigest,
      },
      specDigest: request.planHash,
      spec: {
        mysqlName: request.plan.target.name,
        destination: sha256Canonical(request.plan.artifactDestination),
        destinationBucket: request.plan.artifactDestination.bucket,
        destinationObjectKey: request.plan.artifactDestination.objectKey,
        destinationEndpoint: request.plan.artifactDestination.endpoint,
        factsDigest: request.plan.factsDigest,
      },
      rows: snapshot,
      observedSchema,
      backupStatus: "Succeeded",
      artifactId: `${backup}-artifact`,
      artifactBytes: encodeBackupArtifact(request.plan.artifactDestination, snapshot),
      artifactDigest: artifactDigestOf(encodeBackupArtifact(request.plan.artifactDestination, snapshot)),
    };
    let phaseNow = reduceJournal(eventsFor());
    if (phaseNow === "fenced") {
      appendEvent(cluster, actor, request.operationId, "BackupWriteAhead", { name: backup });
      if (crashAfter === "BackupWriteAhead") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      phaseNow = "backup_wa";
    }
    if (phaseNow === "backup_wa") {
      try {
        cluster.create(actor, backupObject);
      } catch (error) {
        if (!(error instanceof AdapterConflictError)) {
          return mapAdapter(request, error);
        }
        const existing = cluster.get(actor, "PerconaServerMySQLBackup", request.plan.target.namespace, backup);
        if (!existing || !exactObject(existing, backupObject)) {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
      }
      const created = cluster.get(actor, "PerconaServerMySQLBackup", request.plan.target.namespace, backup);
      if (
        !created ||
        created.backupStatus !== "Succeeded" ||
        !created.artifactId ||
        !created.artifactDigest ||
        !created.artifactBytes ||
        created.artifactDigest !== artifactDigestOf(created.artifactBytes) ||
        !schemaMatchesFixed(created.observedSchema)
      ) {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      if (crashAfter === "afterBackupApi") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      appendEvent(cluster, actor, request.operationId, "BackupCreated", {
        name: backup,
        artifactId: created.artifactId,
        artifactDigest: created.artifactDigest,
      });
      if (crashAfter === "BackupCreated") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
    }
    phaseNow = reduceJournal(eventsFor());
    if (phaseNow === "backed_up") {
      appendEvent(cluster, actor, request.operationId, "SetBWriteAhead", { name: request.plan.target.name });
      if (crashAfter === "SetBWriteAhead") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      phaseNow = "setb_wa";
    }
    if (phaseNow === "setb_wa") {
      cluster.writeSetB(request.plan.target);
      if (crashAfter === "afterSetBApi") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      const observed = observeSetAB(cluster.snapshotRows(request.plan.target.namespace, request.plan.target.name));
      if (!observed.ok) {
        return deny(request.operationId, request.planHash, "ORACLE_FAILED");
      }
      appendEvent(cluster, actor, request.operationId, "SetBApplied", {
        digest: observed.digest,
        count: String(observed.count),
      });
      if (crashAfter === "SetBApplied") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
    }
    if (cluster.forceDriftAfterBackup) {
      cluster.mutateTarget(request.plan.target);
    }
    const post = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
    if (!post) {
      return deny(request.operationId, request.planHash, "DRIFT");
    }
    let postTarget = readTarget(post);
    const driftedDuring =
      postTarget.uid !== request.plan.target.uid ||
      postTarget.generation !== request.plan.target.generation ||
      postTarget.specDigest !== request.plan.target.specDigest;
    const restore = restoreName(request.operationId);
    const restoredCluster = restoreClusterName(request.operationId);
    const backupObj = cluster.get(actor, "PerconaServerMySQLBackup", request.plan.target.namespace, backup);
    if (
      !backupObj?.rows ||
      backupObj.backupStatus !== "Succeeded" ||
      !backupObj.artifactId ||
      !backupObj.artifactDigest ||
      !backupObj.artifactBytes ||
      backupObj.artifactDigest !== artifactDigestOf(backupObj.artifactBytes) ||
      !backupObj.observedSchema ||
      !schemaMatchesFixed(backupObj.observedSchema)
    ) {
      return deny(request.operationId, request.planHash, "BLOCKED");
    }
    const restoreRows = backupObj.rows;
    const backupSchema = backupObj.observedSchema;
    const clusterObject: CrObject = {
      kind: "PerconaServerMySQL",
      namespace: request.plan.restoreNamespace,
      name: restoredCluster,
      uid: `${request.operationId}-cluster`,
      generation: 1,
      resourceVersion: "1",
      annotations: {
        operationId: request.operationId,
        planHash: request.planHash,
        factsDigest: request.plan.factsDigest,
      },
      specDigest: request.planHash,
      spec: {
        clusterType: "group-replication",
        backupSource: backup,
        factsDigest: request.plan.factsDigest,
      },
      rows: restoreRows,
      observedSchema: backupSchema,
    };
    const restoreObject: CrObject = {
      kind: "PerconaServerMySQLRestore",
      namespace: request.plan.restoreNamespace,
      name: restore,
      uid: `${request.operationId}-restore`,
      generation: 1,
      resourceVersion: "1",
      annotations: {
        operationId: request.operationId,
        planHash: request.planHash,
        factsDigest: request.plan.factsDigest,
      },
      specDigest: request.planHash,
      spec: {
        backupName: backup,
        restoreClusterName: restoredCluster,
        factsDigest: request.plan.factsDigest,
      },
      rows: restoreRows,
    };
    phaseNow = reduceJournal(eventsFor());
    if (phaseNow === "setb_applied") {
      appendEvent(cluster, actor, request.operationId, "RestoreWriteAhead", { name: restore });
      if (crashAfter === "RestoreWriteAhead") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      phaseNow = "restore_wa";
    }
    if (phaseNow === "restore_wa") {
      const existingCluster = cluster.get(actor, "PerconaServerMySQL", request.plan.restoreNamespace, restoredCluster);
      if (!existingCluster) {
        cluster.create(actor, clusterObject);
        if (crashAfter === "afterRestoreClusterApi") {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
      } else if (!exactObject(existingCluster, clusterObject)) {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      appendEvent(cluster, actor, request.operationId, "RestoreClusterCreated", { name: restoredCluster });
      if (crashAfter === "RestoreClusterCreated") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      phaseNow = "restore_cluster";
    }
    if (phaseNow === "restore_cluster") {
      try {
        cluster.create(actor, restoreObject);
      } catch (error) {
        if (!(error instanceof AdapterConflictError)) {
          return mapAdapter(request, error);
        }
        const existing = cluster.get(actor, "PerconaServerMySQLRestore", request.plan.restoreNamespace, restore);
        if (!existing || !exactObject(existing, restoreObject)) {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
      }
      if (crashAfter === "afterRestoreApi") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      appendEvent(cluster, actor, request.operationId, "RestoreCreated", { name: restore });
      if (crashAfter === "RestoreCreated") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
    }
    const sourceObserved = observeSetAB(cluster.snapshotRows(request.plan.target.namespace, request.plan.target.name));
    if (!sourceObserved.ok) {
      return deny(request.operationId, request.planHash, "ORACLE_FAILED");
    }
    const restored = cluster.get(actor, "PerconaServerMySQL", request.plan.restoreNamespace, restoredCluster);
    if (!restored?.rows || !schemaMatchesFixed(restored.observedSchema)) {
      return deny(request.operationId, request.planHash, "ORACLE_FAILED");
    }
    const oracle = evaluateOracle(restored.rows, restored.observedSchema);
    if (!oracle.pass) {
      return deny(request.operationId, request.planHash, "ORACLE_FAILED");
    }
    if (pastDeadline()) {
      return deny(request.operationId, request.planHash, "TIMEOUT");
    }
    phaseNow = reduceJournal(eventsFor());
    if (phaseNow === "restored") {
      appendEvent(cluster, actor, request.operationId, "FenceReleaseWriteAhead", { fence });
      if (crashAfter === "FenceReleaseWriteAhead") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      phaseNow = "fence_rel_wa";
    }
    const journal = eventsFor();
    const restoreObj = cluster.get(actor, "PerconaServerMySQLRestore", request.plan.restoreNamespace, restore);
    if (!restoreObj || !backupObj.uid || !restored.uid || !backupObj.artifactId || !backupObj.artifactDigest) {
      return deny(request.operationId, request.planHash, "BLOCKED");
    }
    const backupArtifactId = backupObj.artifactId;
    const backupArtifactDigest = backupObj.artifactDigest;
    const storeEvent = journal.find((event) => event.type === "EvidenceStoreWriteAhead");
    const journalHead = storeEvent?.previousEventDigest ?? journal[journal.length - 1]!.eventDigest;
    const signManifest = (verdict: DenialCode | "OK", drifted: boolean): EvidenceManifest => {
      const closedAtMs = storeEvent?.payload.closedAtMs ? Number(storeEvent.payload.closedAtMs) : cluster.nowMs;
      const unsigned: Omit<EvidenceManifest, "signature"> = {
        apiVersion: API_VERSION,
        kind: EVIDENCE_KIND,
        schemaVersion: SCHEMA_VERSION,
        operationId: request.operationId,
        planHash: request.planHash,
        actor: actor.actorId,
        clusterUid: request.plan.clusterUid,
        sourceNamespace: request.plan.target.namespace,
        restoreNamespace: request.plan.restoreNamespace,
        targetPre: request.plan.target,
        targetPost: postTarget,
        approval,
        journalRoot: journal[0]!.eventDigest,
        journalHead,
        backupArtifactId,
        backupArtifactDigest,
        observedSchemaDigest: oracle.schemaDigest,
        artifactDigest: backupArtifactDigest,
        artifactDestination: request.plan.artifactDestination,
        oracle: {
          schemaDigest: oracle.schemaDigest,
          count: oracle.count,
          primaryKeyMin: oracle.primaryKeyMin,
          primaryKeyMax: oracle.primaryKeyMax,
          orderedRowHash: oracle.orderedRowHash,
          setBAbsent: oracle.setBAbsent,
        },
        intent: {
          operationId: request.operationId,
          planHash: request.planHash,
          factsSnapshotId: request.plan.factsSnapshotId,
          factsDigest: request.plan.factsDigest,
          startedAtMs,
          deadlineMs,
        },
        facts: {
          snapshotId: request.plan.factsSnapshotId,
          digest: request.plan.factsDigest,
          clusterUid: request.plan.clusterUid,
          targetNamespaceUid: request.plan.targetNamespaceUid,
          restoreNamespaceUid: request.plan.restoreNamespaceUid,
          target: request.plan.target,
        },
        effects: {
          backup: effectOf(backupObj),
          restoreCluster: effectOf(restored),
          restore: effectOf(restoreObj),
        },
        timeline: {
          startedAtMs,
          deadlineMs,
          closedAtMs,
        },
        pins: evidencePins(),
        trustIdentity: {
          approvalKeyId: approval.keyId,
          executionKeyId: keys.execution.keyId,
          approvalPolicyVersion: request.plan.approvalPolicyVersion,
          approvalSubject: approval.approverSubject,
          approvalRole: request.plan.requiredApproverRole,
        },
        factsSnapshotId: request.plan.factsSnapshotId,
        factsDigest: request.plan.factsDigest,
        driftedDuring: drifted,
        verdict,
        pinsDigest: sha256Canonical(STARTUP_PINS),
        keyId: keys.execution.keyId,
      };
      return { ...unsigned, signature: signCanonical(keys.execution.privateKeyPem, unsigned) };
    };
    const persistStore = (manifest: EvidenceManifest): ExecuteResult | null => {
      const digest = sha256Canonical(manifest);
      if (phaseNow === "fence_rel_wa") {
        appendEvent(cluster, actor, request.operationId, "EvidenceStoreWriteAhead", {
          evidenceDigest: digest,
          closedAtMs: String(manifest.timeline.closedAtMs),
          verdict: manifest.verdict,
          driftedDuring: manifest.driftedDuring ? "true" : "false",
        });
        if (crashAfter === "afterEvidenceStoreWa") {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
      }
      const existing = cluster.getEvidence(digest);
      if (!existing) {
        cluster.putEvidence(digest, manifest);
      } else if (sha256Canonical(existing) !== digest) {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      if (crashAfter === "afterEvidenceStore") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      return null;
    };
    const finish = (manifest: EvidenceManifest): ExecuteResult => {
      const digest = sha256Canonical(manifest);
      const terminal = manifest.verdict === "FENCE_RELEASE_BLOCKED" ? "FenceReleaseBlocked" : "EvidenceClosed";
      appendEvent(cluster, actor, request.operationId, terminal, {
        planHash: request.planHash,
        verdict: manifest.verdict,
        evidenceDigest: digest,
        signature: manifest.signature,
        closedAtMs: String(manifest.timeline.closedAtMs),
      });
      return result(
        {
          operationId: request.operationId,
          planHash: request.planHash,
          denial: manifest.verdict === "OK" ? null : (manifest.verdict as DenialCode),
          evidence: manifest,
          driftedDuring: manifest.driftedDuring,
        },
        false,
      );
    };
    if (phaseNow === "fence_rel_wa" || phaseNow === "evidence_wa") {
      if (pastDeadline()) {
        return deny(request.operationId, request.planHash, "TIMEOUT");
      }
    }
    if (phaseNow === "fence_rel_wa") {
      const current = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
      if (!current) {
        return deny(request.operationId, request.planHash, "DRIFT");
      }
      if (current.annotations[FENCE_ANNOTATION] === fence) {
        try {
          cluster.releaseFence(actor, readTarget(current), fence);
        } catch {
          const blocked = signManifest("FENCE_RELEASE_BLOCKED", driftedDuring);
          const crashed = persistStore(blocked);
          if (crashed) {
            return crashed;
          }
          return finish(blocked);
        }
        if (crashAfter === "afterReleaseApi") {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
        const released = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
        if (released) {
          postTarget = readTarget(released);
        }
      } else if (current.annotations[FENCE_ANNOTATION] !== undefined) {
        return deny(request.operationId, request.planHash, "DRIFT");
      }
      const evidence = signManifest(driftedDuring ? "TARGET_DRIFTED_DURING_OPERATION" : "OK", driftedDuring);
      const crashed = persistStore(evidence);
      if (crashed) {
        return crashed;
      }
      return finish(evidence);
    }
    if (phaseNow === "evidence_wa") {
      if (!storeEvent?.payload.evidenceDigest || !storeEvent.payload.closedAtMs || !storeEvent.payload.verdict) {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      const rebuilt = signManifest(storeEvent.payload.verdict as DenialCode | "OK", storeEvent.payload.driftedDuring === "true");
      if (sha256Canonical(rebuilt) !== storeEvent.payload.evidenceDigest) {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      const crashed = persistStore(rebuilt);
      if (crashed) {
        return crashed;
      }
      return finish(rebuilt);
    }
    return deny(request.operationId, request.planHash, "BLOCKED");
  } catch (error) {
    return mapAdapter(request, error);
  }
}

function mapAdapter(request: { operationId: string; planHash: string }, error: unknown): ExecuteResult {
  if (error instanceof AdapterTimeoutError) {
    return deny(request.operationId, request.planHash, "TIMEOUT");
  }
  if (error instanceof AdapterUnauthorizedError) {
    return deny(request.operationId, request.planHash, "RBAC");
  }
  if (error instanceof AdapterFailureError || error instanceof AdapterConflictError) {
    return deny(request.operationId, request.planHash, "ADAPTER_FAILURE");
  }
  if (error instanceof Error && (error.message === "LEASE_CONTENDED" || error.message === "BLOCKED" || error.message === "SCHEMA")) {
    return deny(request.operationId, request.planHash, error.message === "LEASE_CONTENDED" ? "LEASE_CONTENDED" : "BLOCKED");
  }
  throw error;
}
