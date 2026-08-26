import { FakeK8s, readTarget } from "./fake-k8s.ts";
import { appendEvent, replayJournal } from "./journal.ts";
import { backupName, restoreClusterName, restoreName } from "./names.ts";
import { evaluateOracle, setA } from "./oracle.ts";
import { planHash } from "./plan-hash.ts";
import { STARTUP_PINS } from "./pins.ts";
import { agentHasPrivilege, actorMay } from "./rbac.ts";
import { sha256Canonical } from "./rfc8785.ts";
import { approvalFresh, approvalPayload, signCanonical, verifyCanonical } from "./signature.ts";
import {
  AdapterConflictError,
  AdapterFailureError,
  AdapterTimeoutError,
  AdapterUnauthorizedError,
  FENCE_ANNOTATION,
  PERCONA_KINDS,
  SPEC_P1_DRIFT_DURING,
  SPEC_P1_RESUME_OR_BLOCKED,
  SPEC_P1_SCOPE_NONDESTRUCTIVE,
  SPEC_P1_TARGET_FENCE,
  type Actor,
  type AgentCapabilities,
  type ApprovalEnvelope,
  type BackupProofRequest,
  type DenialCode,
  type EvidenceManifest,
  type OperationRecord,
  type TargetRef,
} from "./types.ts";

void SPEC_P1_SCOPE_NONDESTRUCTIVE;
void SPEC_P1_TARGET_FENCE;
void SPEC_P1_DRIFT_DURING;
void SPEC_P1_RESUME_OR_BLOCKED;

export type TrustedKeys = {
  approval: Record<string, string>;
  execution: { keyId: string; publicKeyPem: string; privateKeyPem: string };
};

export type ExecuteInput = {
  request: BackupProofRequest;
  agent: AgentCapabilities;
  actor: Actor;
  cluster: FakeK8s;
  keys: TrustedKeys;
  nowMs: number;
};

export type ExecuteResult = {
  ok: boolean;
  replayed: boolean;
  denial: DenialCode | null;
  record: OperationRecord;
};

type InternalResult = ExecuteResult;

function result(record: OperationRecord, replayed: boolean): InternalResult {
  return { ok: record.denial === null && record.evidence !== null, replayed, denial: record.denial, record };
}

function deny(operationId: string, planHashValue: string, denial: DenialCode, replayed = false): InternalResult {
  return result(
    { operationId, planHash: planHashValue, denial, evidence: null, driftedDuring: denial === "TARGET_DRIFTED_DURING_OPERATION" },
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

function verifyApproval(request: BackupProofRequest, keys: TrustedKeys, nowMs: number): boolean {
  const envelope = request.approval;
  const publicKey = keys.approval[envelope.keyId];
  if (!publicKey) {
    return false;
  }
  if (!approvalFresh(envelope, nowMs)) {
    return false;
  }
  if (envelope.planHash !== request.planHash) {
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
  void approvalPayload(unsigned);
  return verifyCanonical(publicKey, unsigned, envelope.signature);
}

export function executeBackupProof(input: ExecuteInput): ExecuteResult {
  const { request, agent, actor, cluster, keys, nowMs } = input;
  cluster.nowMs = nowMs;
  if (agentHasPrivilege(agent)) {
    return deny(request.operationId, request.planHash, "AGENT_PRIVILEGE");
  }
  if (request.plan.target.namespace === request.restoreNamespace) {
    return deny(request.operationId, request.planHash, "SAME_NAMESPACE");
  }
  if (planHash(request.plan) !== request.planHash) {
    return deny(request.operationId, request.planHash, "PLAN_HASH_MISMATCH");
  }
  for (const kind of PERCONA_KINDS) {
    if (!actorMay(actor, request.plan.target.namespace, kind) || !actorMay(actor, request.restoreNamespace, kind)) {
      return deny(request.operationId, request.planHash, "RBAC");
    }
  }
  if (!cluster.acquireLease(actor.actorId)) {
    return deny(request.operationId, request.planHash, "LEASE_CONTENDED");
  }
  let events;
  try {
    events = replayJournal(cluster.listJournal().filter((event) => event.operationId === request.operationId));
  } catch {
    return deny(request.operationId, request.planHash, "BLOCKED", true);
  }
  const closed = events.find((event) => event.type === "EvidenceClosed");
  if (closed) {
    if (closed.payload.planHash !== request.planHash) {
      return deny(request.operationId, request.planHash, "BLOCKED", true);
    }
    return result(
      {
        operationId: request.operationId,
        planHash: request.planHash,
        denial: null,
        driftedDuring: closed.payload.driftedDuring === "true",
        evidence: JSON.parse(closed.payload.evidence ?? "null") as EvidenceManifest,
      },
      true,
    );
  }
  if (events.length > 0) {
    const first = events[0]!;
    if (first.payload.planHash !== request.planHash) {
      return deny(request.operationId, request.planHash, "BLOCKED", true);
    }
  }
  if (!verifyApproval(request, keys, nowMs)) {
    return deny(request.operationId, request.planHash, "UNAPPROVED");
  }
  if (events.some((event) => event.type === "ApprovalConsumed") === false) {
    try {
      appendEvent(cluster, actor, request.operationId, events.length === 0 ? "IntentAccepted" : "ApprovalConsumed", {
        planHash: request.planHash,
        approvalId: request.approval.approvalId,
      });
      if (events.length === 0) {
        appendEvent(cluster, actor, request.operationId, "ApprovalConsumed", {
          planHash: request.planHash,
          approvalId: request.approval.approvalId,
        });
      }
    } catch (error) {
      return mapAdapter(request, error);
    }
  }
  const live = cluster.get(actor, "PerconaServerMySQL", request.plan.target.namespace, request.plan.target.name);
  if (!live) {
    return deny(request.operationId, request.planHash, "DRIFT");
  }
  const liveTarget = readTarget(live);
  if (!sameTarget(liveTarget, request.plan.target) || live.annotations[FENCE_ANNOTATION] !== undefined) {
    return deny(request.operationId, request.planHash, "DRIFT");
  }
  const fence = `${request.operationId}:${request.planHash}`;
  try {
    cluster.patchFence(actor, request.plan.target, fence);
    appendEvent(cluster, actor, request.operationId, "FenceSet", { fence });
  } catch (error) {
    return mapAdapter(request, error);
  }
  const backup = backupName(request.operationId);
  try {
    appendEvent(cluster, actor, request.operationId, "BackupWriteAhead", { name: backup });
    const snapshot = cluster.snapshotRows(request.plan.target.namespace, request.plan.target.name);
    try {
      cluster.create(actor, {
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
      });
    } catch (error) {
      if (error instanceof AdapterConflictError) {
        const existing = cluster.get(actor, "PerconaServerMySQLBackup", request.plan.target.namespace, backup);
        if (!existing || existing.annotations.planHash !== request.planHash) {
          return deny(request.operationId, request.planHash, "BLOCKED");
        }
      } else {
        return mapAdapter(request, error);
      }
    }
    appendEvent(cluster, actor, request.operationId, "BackupCreated", { name: backup });
  } catch (error) {
    return mapAdapter(request, error);
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
  const restoreRows = backupObj?.rows ?? setA();
  try {
    appendEvent(cluster, actor, request.operationId, "RestoreWriteAhead", { name: restore });
    cluster.create(actor, {
      kind: "PerconaServerMySQL",
      namespace: request.restoreNamespace,
      name: restoredCluster,
      uid: `${request.operationId}-cluster`,
      generation: 1,
      resourceVersion: "1",
      annotations: { operationId: request.operationId, planHash: request.planHash },
      specDigest: request.planHash,
      spec: { clusterType: "group-replication", backupSource: backup },
      rows: restoreRows,
    });
    cluster.create(actor, {
      kind: "PerconaServerMySQLRestore",
      namespace: request.restoreNamespace,
      name: restore,
      uid: `${request.operationId}-restore`,
      generation: 1,
      resourceVersion: "1",
      annotations: { operationId: request.operationId, planHash: request.planHash },
      specDigest: request.planHash,
      spec: { backupName: backup, restoreClusterName: restoredCluster },
      rows: restoreRows,
    });
    appendEvent(cluster, actor, request.operationId, "RestoreCreated", { name: restore });
  } catch (error) {
    if (error instanceof AdapterConflictError) {
      return deny(request.operationId, request.planHash, "BLOCKED");
    }
    return mapAdapter(request, error);
  }
  const oracle = evaluateOracle(restoreRows);
  if (!oracle.pass) {
    return deny(request.operationId, request.planHash, "ORACLE_FAILED");
  }
  const unsignedEvidence: Omit<EvidenceManifest, "signature"> = {
    operationId: request.operationId,
    planHash: request.planHash,
    actor: actor.actorId,
    clusterUid: request.plan.clusterUid,
    sourceNamespace: request.plan.target.namespace,
    restoreNamespace: request.restoreNamespace,
    targetPre: request.plan.target,
    targetPost: postTarget,
    artifactDigest: sha256Canonical(restoreRows),
    oracle: {
      schemaDigest: oracle.schemaDigest,
      count: oracle.count,
      primaryKeyMin: oracle.primaryKeyMin,
      primaryKeyMax: oracle.primaryKeyMax,
      orderedRowHash: oracle.orderedRowHash,
      setBAbsent: oracle.setBAbsent,
    },
    driftedDuring,
    pinsDigest: sha256Canonical(STARTUP_PINS),
    keyId: keys.execution.keyId,
  };
  const evidence: EvidenceManifest = {
    ...unsignedEvidence,
    signature: signCanonical(keys.execution.privateKeyPem, unsignedEvidence),
  };
  appendEvent(cluster, actor, request.operationId, "EvidenceClosed", {
    planHash: request.planHash,
    driftedDuring: String(driftedDuring),
    evidence: JSON.stringify(evidence),
  });
  try {
    cluster.releaseFence(actor, readTarget(post), fence);
  } catch {
    return deny(request.operationId, request.planHash, "FENCE_RELEASE_BLOCKED");
  }
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
}

function mapAdapter(request: BackupProofRequest, error: unknown): InternalResult {
  if (error instanceof AdapterTimeoutError) {
    return deny(request.operationId, request.planHash, "TIMEOUT");
  }
  if (error instanceof AdapterUnauthorizedError) {
    return deny(request.operationId, request.planHash, "RBAC");
  }
  if (error instanceof AdapterFailureError || error instanceof AdapterConflictError) {
    return deny(request.operationId, request.planHash, "ADAPTER_FAILURE");
  }
  if (error instanceof Error && error.message === "LEASE_CONTENDED") {
    return deny(request.operationId, request.planHash, "LEASE_CONTENDED");
  }
  if (error instanceof Error && error.message === "BLOCKED") {
    return deny(request.operationId, request.planHash, "BLOCKED");
  }
  throw error;
}
