import { FakeK8s, readTarget, type CrObject } from "./fake-k8s.ts";
import { appendEvent, closedVerdict, reduceJournal } from "./journal.ts";
import { backupName, restoreClusterName, restoreName } from "./names.ts";
import { evaluateOracle } from "./oracle.ts";
import { planHash } from "./plan-hash.ts";
import { STARTUP_PINS } from "./pins.ts";
import { agentHasPrivilege, actorMay } from "./rbac.ts";
import { sha256Canonical } from "./rfc8785.ts";
import { admitRequest } from "./schema.ts";
import { approvalFresh, signCanonical, verifyCanonical } from "./signature.ts";
import {
  AdapterConflictError,
  AdapterFailureError,
  AdapterTimeoutError,
  AdapterUnauthorizedError,
  CONTROL_NAMESPACE,
  FENCE_ANNOTATION,
  PERCONA_KINDS,
  SPEC_P1_DRIFT_DURING,
  SPEC_P1_RESUME_OR_BLOCKED,
  SPEC_P1_SCOPE_NONDESTRUCTIVE,
  SPEC_P1_TARGET_FENCE,
  type Actor,
  type AgentCapabilities,
  type ApprovalEnvelope,
  type DenialCode,
  type EvidenceManifest,
  type JournalEventType,
  type OperationRecord,
  type TargetRef,
} from "./types.ts";

void SPEC_P1_SCOPE_NONDESTRUCTIVE;
void SPEC_P1_TARGET_FENCE;
void SPEC_P1_DRIFT_DURING;
void SPEC_P1_RESUME_OR_BLOCKED;

export type TrustedApproval = {
  publicKeyPem: string;
  subject: string;
  role: string;
};

export type TrustedKeys = {
  approval: Record<string, TrustedApproval>;
  execution: { keyId: string; publicKeyPem: string; privateKeyPem: string };
};

export type CrashAfter = JournalEventType | "none";

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
    left.annotations.operationId === right.annotations.operationId &&
    left.annotations.planHash === right.annotations.planHash &&
    sha256Canonical(left.spec) === sha256Canonical(right.spec) &&
    sha256Canonical(left.rows ?? null) === sha256Canonical(right.rows ?? null) &&
    left.artifactDigest === right.artifactDigest &&
    left.backupStatus === right.backupStatus
  );
}

function verifyApproval(request: ReturnType<typeof admitRequest>, keys: TrustedKeys, nowMs: number): boolean {
  const envelope = request.approval;
  const trusted = keys.approval[envelope.keyId];
  if (!trusted) {
    return false;
  }
  if (trusted.subject !== envelope.approverSubject || trusted.subject !== request.plan.requiredApproverSubject) {
    return false;
  }
  if (trusted.role !== request.plan.requiredApproverRole) {
    return false;
  }
  if (envelope.planHash !== request.planHash) {
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

export function executeBackupProof(input: ExecuteInput): ExecuteResult {
  let request;
  try {
    request = admitRequest(input.request);
  } catch (error) {
    if (error instanceof Error && error.message === "SCHEMA") {
      return deny("unknown", "unknown", "BLOCKED");
    }
    throw error;
  }
  const { agent, actor, cluster, keys, nowMs } = input;
  const startedAtMs = input.startedAtMs ?? nowMs;
  const crashAfter = input.crashAfter ?? "none";
  cluster.nowMs = nowMs;
  if (nowMs - startedAtMs > request.plan.timeoutMs) {
    return deny(request.operationId, request.planHash, "TIMEOUT");
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
  for (const kind of PERCONA_KINDS) {
    if (
      !actorMay(actor, request.plan.target.namespace, kind) ||
      !actorMay(actor, request.plan.restoreNamespace, kind)
    ) {
      return deny(request.operationId, request.planHash, "RBAC");
    }
  }
  if (!actorMay(actor, CONTROL_NAMESPACE, "ConfigMap") || !actorMay(actor, CONTROL_NAMESPACE, "Lease")) {
    return deny(request.operationId, request.planHash, "RBAC");
  }
  if (!cluster.acquireLease(actor.actorId)) {
    return deny(request.operationId, request.planHash, "LEASE_CONTENDED");
  }
  let events;
  try {
    events = cluster.listJournal().filter((event) => event.operationId === request.operationId);
    const phase = reduceJournal(events);
    if (phase === "closed" || phase === "fence_blocked") {
      const closed = closedVerdict(events);
      if (closed.evidenceJson) {
        return result(
          {
            operationId: request.operationId,
            planHash: request.planHash,
            denial: closed.denial,
            driftedDuring: closed.denial === "TARGET_DRIFTED_DURING_OPERATION",
            evidence: JSON.parse(closed.evidenceJson) as EvidenceManifest,
          },
          true,
        );
      }
      return deny(request.operationId, request.planHash, closed.denial ?? "BLOCKED", true);
    }
    if (events.length > 0 && events[0]!.payload.planHash !== request.planHash) {
      return deny(request.operationId, request.planHash, "BLOCKED", true);
    }
    const approved = phase !== "empty" && phase !== "intent";
    if (!approved) {
      if (!verifyApproval(request, keys, nowMs)) {
        return deny(request.operationId, request.planHash, "UNAPPROVED");
      }
      if (phase === "empty") {
        appendEvent(cluster, actor, request.operationId, "IntentAccepted", { planHash: request.planHash });
        if (crashAfter === "IntentAccepted") {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
      }
      appendEvent(cluster, actor, request.operationId, "ApprovalConsumed", {
        planHash: request.planHash,
        approvalId: request.approval.approvalId,
      });
      if (crashAfter === "ApprovalConsumed") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
    }
    const fence = `${request.operationId}:${request.planHash}`;
    const live = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
    if (!live) {
      return deny(request.operationId, request.planHash, "DRIFT");
    }
    const currentPhase = reduceJournal(
      cluster.listJournal().filter((event) => event.operationId === request.operationId),
    );
    if (currentPhase === "approved") {
      const liveTarget = readTarget(live);
      if (!sameTarget(liveTarget, request.plan.target) || live.annotations[FENCE_ANNOTATION] !== undefined) {
        return deny(request.operationId, request.planHash, "DRIFT");
      }
      cluster.patchFence(actor, request.plan.target, fence);
      appendEvent(cluster, actor, request.operationId, "FenceSet", { fence });
      if (crashAfter === "FenceSet") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
    } else if (live.annotations[FENCE_ANNOTATION] !== fence) {
      return deny(request.operationId, request.planHash, "DRIFT");
    }
    const backup = backupName(request.operationId);
    const snapshot = cluster.snapshotRows(request.plan.target.namespace, request.plan.target.name);
    const observedSchema = live.observedSchema;
    if (!snapshot || !observedSchema) {
      return deny(request.operationId, request.planHash, "BLOCKED");
    }
    const backupObject: CrObject = {
      kind: "PerconaServerMySQLBackup",
      namespace: request.plan.target.namespace,
      name: backup,
      uid: `${request.operationId}-backup`,
      generation: 1,
      resourceVersion: "1",
      annotations: { operationId: request.operationId, planHash: request.planHash },
      specDigest: request.planHash,
      spec: { mysqlName: request.plan.target.name },
      rows: snapshot,
      observedSchema,
      backupStatus: "Succeeded",
      artifactId: `${backup}-artifact`,
      artifactDigest: sha256Canonical(snapshot),
    };
    let phaseNow = reduceJournal(cluster.listJournal().filter((event) => event.operationId === request.operationId));
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
      if (!created || created.backupStatus !== "Succeeded" || !created.artifactId || !created.artifactDigest) {
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
    cluster.writeSetB(request.plan.target);
    if (cluster.forceDriftAfterBackup) {
      cluster.mutateTarget(request.plan.target);
    }
    const post = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
    if (!post) {
      return deny(request.operationId, request.planHash, "DRIFT");
    }
    const postTarget = readTarget(post);
    const driftedDuring =
      postTarget.uid !== request.plan.target.uid ||
      postTarget.generation !== request.plan.target.generation ||
      postTarget.specDigest !== request.plan.target.specDigest;
    const restore = restoreName(request.operationId);
    const restoredCluster = restoreClusterName(request.operationId);
    const backupObj = cluster.get(actor, "PerconaServerMySQLBackup", request.plan.target.namespace, backup);
    if (!backupObj?.rows || backupObj.backupStatus !== "Succeeded" || !backupObj.artifactDigest || !backupObj.observedSchema) {
      return deny(request.operationId, request.planHash, "BLOCKED");
    }
    const restoreRows = backupObj.rows;
    const clusterObject: CrObject = {
      kind: "PerconaServerMySQL",
      namespace: request.plan.restoreNamespace,
      name: restoredCluster,
      uid: `${request.operationId}-cluster`,
      generation: 1,
      resourceVersion: "1",
      annotations: { operationId: request.operationId, planHash: request.planHash },
      specDigest: request.planHash,
      spec: { clusterType: "group-replication", backupSource: backup },
      rows: restoreRows,
      observedSchema: backupObj.observedSchema,
    };
    const restoreObject: CrObject = {
      kind: "PerconaServerMySQLRestore",
      namespace: request.plan.restoreNamespace,
      name: restore,
      uid: `${request.operationId}-restore`,
      generation: 1,
      resourceVersion: "1",
      annotations: { operationId: request.operationId, planHash: request.planHash },
      specDigest: request.planHash,
      spec: { backupName: backup, restoreClusterName: restoredCluster },
      rows: restoreRows,
    };
    phaseNow = reduceJournal(cluster.listJournal().filter((event) => event.operationId === request.operationId));
    if (phaseNow === "backed_up") {
      appendEvent(cluster, actor, request.operationId, "RestoreWriteAhead", { name: restore });
      if (crashAfter === "RestoreWriteAhead") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
      phaseNow = "restore_wa";
    }
    if (phaseNow === "restore_wa") {
      try {
        cluster.create(actor, clusterObject);
      } catch (error) {
        if (!(error instanceof AdapterConflictError)) {
          return mapAdapter(request, error);
        }
        const existing = cluster.get(actor, "PerconaServerMySQL", request.plan.restoreNamespace, restoredCluster);
        if (!existing || !exactObject(existing, clusterObject)) {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
      }
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
      appendEvent(cluster, actor, request.operationId, "RestoreCreated", { name: restore });
      if (crashAfter === "RestoreCreated") {
        return deny(request.operationId, request.planHash, "BLOCKED");
      }
    }
    const restored = cluster.get(actor, "PerconaServerMySQL", request.plan.restoreNamespace, restoredCluster);
    if (!restored?.rows || !restored.observedSchema) {
      return deny(request.operationId, request.planHash, "ORACLE_FAILED");
    }
    const oracle = evaluateOracle(restored.rows, restored.observedSchema);
    if (!oracle.pass) {
      return deny(request.operationId, request.planHash, "ORACLE_FAILED");
    }
    const journal = cluster.listJournal().filter((event) => event.operationId === request.operationId);
    const unsignedEvidence: Omit<EvidenceManifest, "signature"> = {
      operationId: request.operationId,
      planHash: request.planHash,
      actor: actor.actorId,
      clusterUid: request.plan.clusterUid,
      sourceNamespace: request.plan.target.namespace,
      restoreNamespace: request.plan.restoreNamespace,
      targetPre: request.plan.target,
      targetPost: postTarget,
      approval: request.approval,
      journalRoot: journal[0]!.eventDigest,
      journalHead: journal[journal.length - 1]!.eventDigest,
      backupArtifactId: backupObj.artifactId ?? "",
      backupArtifactDigest: backupObj.artifactDigest,
      observedSchemaDigest: oracle.schemaDigest,
      artifactDigest: backupObj.artifactDigest,
      oracle: {
        schemaDigest: oracle.schemaDigest,
        count: oracle.count,
        primaryKeyMin: oracle.primaryKeyMin,
        primaryKeyMax: oracle.primaryKeyMax,
        orderedRowHash: oracle.orderedRowHash,
        setBAbsent: oracle.setBAbsent,
      },
      driftedDuring,
      verdict: driftedDuring ? "TARGET_DRIFTED_DURING_OPERATION" : "OK",
      pinsDigest: sha256Canonical(STARTUP_PINS),
      keyId: keys.execution.keyId,
    };
    const evidence: EvidenceManifest = {
      ...unsignedEvidence,
      signature: signCanonical(keys.execution.privateKeyPem, unsignedEvidence),
    };
    try {
      cluster.releaseFence(actor, readTarget(post), fence);
    } catch {
      appendEvent(cluster, actor, request.operationId, "FenceReleaseBlocked", { fence });
      return deny(request.operationId, request.planHash, "FENCE_RELEASE_BLOCKED");
    }
    appendEvent(cluster, actor, request.operationId, "EvidenceClosed", {
      planHash: request.planHash,
      verdict: evidence.verdict,
      evidence: JSON.stringify(evidence),
    });
    return result(
      {
        operationId: request.operationId,
        planHash: request.planHash,
        denial: driftedDuring ? "TARGET_DRIFTED_DURING_OPERATION" : null,
        evidence,
        driftedDuring,
      },
      false,
    );
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
