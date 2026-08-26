import { restoreMatchesBackup } from "./evidence.ts";
import { factsFingerprint, planHash } from "./plan-hash.ts";
import type { MemoryOperationStore } from "./operation-store.ts";
import { agentHasPrivilege, actorMay } from "./rbac.ts";
import { asBackupProof } from "./schema.ts";
import {
  AdapterFailureError,
  AdapterTimeoutError,
  AdapterUnauthorizedError,
  PERCONA_KINDS,
  type AgentCapabilities,
  type AdapterActor,
  type DenialCode,
  type EvidenceBundle,
  type ExecuteResult,
  type K8sAdapter,
  type OperationRecord,
} from "./types.ts";

export type ExecuteInput = {
  document: unknown;
  agent: AgentCapabilities;
  actor: AdapterActor;
  adapter: K8sAdapter;
  store: MemoryOperationStore;
  postBackupWriteDigest?: string | undefined;
};

function deny(
  store: MemoryOperationStore,
  operationId: string,
  planHashValue: string,
  denial: DenialCode,
): ExecuteResult {
  const record: OperationRecord = {
    operationId,
    planHash: planHashValue,
    backupCreated: false,
    restoreCreated: false,
    evidence: null,
    denial,
  };
  store.putIfAbsent(record);
  return { ok: false, replayed: false, denial, record };
}

export function executeBackupProof(input: ExecuteInput): ExecuteResult {
  const document = asBackupProof(input.document);
  const existing = input.store.get(document.operationId);
  if (existing) {
    if (existing.denial) {
      return { ok: false, replayed: true, denial: existing.denial, record: existing };
    }
    return { ok: true, replayed: true, record: existing };
  }
  if (agentHasPrivilege(input.agent)) {
    return deny(input.store, document.operationId, document.planHash, "AGENT_PRIVILEGE");
  }
  if (document.intent.sourceNamespace === document.intent.restoreNamespace) {
    return deny(input.store, document.operationId, document.planHash, "SAME_NAMESPACE");
  }
  if (
    document.plan.sourceNamespace !== document.intent.sourceNamespace ||
    document.plan.restoreNamespace !== document.intent.restoreNamespace
  ) {
    return deny(input.store, document.operationId, document.planHash, "DRIFT");
  }
  if (!document.approval || document.approval.decided !== "approve") {
    return deny(input.store, document.operationId, document.planHash, "UNAPPROVED");
  }
  if (document.approval.planHash !== document.planHash) {
    return deny(input.store, document.operationId, document.planHash, "UNAPPROVED");
  }
  if (planHash(document.plan) !== document.planHash) {
    return deny(input.store, document.operationId, document.planHash, "PLAN_HASH_MISMATCH");
  }
  if (factsFingerprint(document.facts) !== document.plan.factsFingerprint) {
    return deny(input.store, document.operationId, document.planHash, "DRIFT");
  }
  for (const kind of PERCONA_KINDS) {
    if (
      !actorMay(input.actor, document.plan.sourceNamespace, kind) ||
      !actorMay(input.actor, document.plan.restoreNamespace, kind)
    ) {
      return deny(input.store, document.operationId, document.planHash, "RBAC");
    }
  }
  try {
    const backup = input.adapter.create(input.actor, {
      kind: "PerconaServerMySQLBackup",
      namespace: document.plan.sourceNamespace,
      name: document.plan.backupName,
      spec: { mysqlName: document.plan.mysqlName },
    });
    const restore = input.adapter.create(input.actor, {
      kind: "PerconaServerMySQLRestore",
      namespace: document.plan.restoreNamespace,
      name: document.plan.restoreName,
      spec: {
        backupName: document.plan.backupName,
        backupNamespace: document.plan.sourceNamespace,
        restoreClusterName: document.plan.restoreClusterName,
      },
    });
    const evidence: EvidenceBundle = {
      operationId: document.operationId,
      planHash: document.planHash,
      sourceNamespace: document.plan.sourceNamespace,
      restoreNamespace: document.plan.restoreNamespace,
      backupDataDigest: backup.dataDigest ?? "",
      restoreDataDigest: restore.dataDigest ?? "",
      postBackupWriteDigest: input.postBackupWriteDigest ?? null,
      createdKinds: ["PerconaServerMySQLBackup", "PerconaServerMySQLRestore"],
    };
    if (!restoreMatchesBackup(evidence)) {
      return deny(input.store, document.operationId, document.planHash, "RESTORE_PROOF_MISMATCH");
    }
    const record: OperationRecord = {
      operationId: document.operationId,
      planHash: document.planHash,
      backupCreated: true,
      restoreCreated: true,
      evidence,
      denial: null,
    };
    input.store.putIfAbsent(record);
    return { ok: true, replayed: false, record };
  } catch (error) {
    if (error instanceof AdapterTimeoutError) {
      return deny(input.store, document.operationId, document.planHash, "TIMEOUT");
    }
    if (error instanceof AdapterUnauthorizedError) {
      return deny(input.store, document.operationId, document.planHash, "RBAC");
    }
    if (error instanceof AdapterFailureError) {
      return deny(input.store, document.operationId, document.planHash, "ADAPTER_FAILURE");
    }
    throw error;
  }
}
