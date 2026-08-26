import {
  API_VERSION,
  BACKUP_PROOF_KIND,
  CLUSTER_TYPE,
  SCHEMA_VERSION,
  type ApprovalEnvelope,
  type BackupProofRequest,
  type EvidenceManifest,
  type PlanDocument,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function reqString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const PLAN_KEYS = [
  "schemaVersion",
  "operationId",
  "actor",
  "clusterUid",
  "targetNamespace",
  "targetNamespaceUid",
  "restoreNamespace",
  "restoreNamespaceUid",
  "requiredApproverRole",
  "requiredApproverSubject",
  "target",
  "factsSnapshotId",
  "factsDigest",
  "actions",
  "parameters",
  "artifactDestination",
  "risk",
  "timeoutMs",
  "budget",
  "stopConditions",
  "approvalPolicyVersion",
] as const;

const TARGET_KEYS = ["namespace", "name", "uid", "generation", "resourceVersion", "specDigest"] as const;
const APPROVAL_KEYS = [
  "approvalId",
  "planHash",
  "approverSubject",
  "keyId",
  "issuedAt",
  "expiresAt",
  "nonce",
  "signature",
] as const;
const REQUEST_KEYS = ["apiVersion", "kind", "operationId", "plan", "planHash", "approval"] as const;

export function admitPlan(value: unknown): PlanDocument {
  if (!isRecord(value) || !onlyKeys(value, PLAN_KEYS)) {
    throw new Error("SCHEMA");
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("SCHEMA");
  }
  if (!isRecord(value.target) || !onlyKeys(value.target, TARGET_KEYS)) {
    throw new Error("SCHEMA");
  }
  if (value.target.namespace !== value.targetNamespace) {
    throw new Error("SCHEMA");
  }
  if (value.parameters !== undefined && (!isRecord(value.parameters) || value.parameters.clusterType !== CLUSTER_TYPE)) {
    throw new Error("SCHEMA");
  }
  if (!Array.isArray(value.actions) || !Array.isArray(value.stopConditions)) {
    throw new Error("SCHEMA");
  }
  if (typeof value.timeoutMs !== "number" || value.timeoutMs <= 0) {
    throw new Error("SCHEMA");
  }
  return value as PlanDocument;
}

export function admitApproval(value: unknown): ApprovalEnvelope {
  if (!isRecord(value) || !onlyKeys(value, APPROVAL_KEYS)) {
    throw new Error("SCHEMA");
  }
  if (typeof value.issuedAt !== "number" || typeof value.expiresAt !== "number") {
    throw new Error("SCHEMA");
  }
  return value as ApprovalEnvelope;
}

export function admitRequest(value: unknown): BackupProofRequest {
  if (!isRecord(value) || !onlyKeys(value, REQUEST_KEYS)) {
    throw new Error("SCHEMA");
  }
  if (value.apiVersion !== API_VERSION || value.kind !== BACKUP_PROOF_KIND || !reqString(value.operationId)) {
    throw new Error("SCHEMA");
  }
  const plan = admitPlan(value.plan);
  const approval = admitApproval(value.approval);
  if (value.operationId !== plan.operationId || !reqString(value.planHash as string)) {
    throw new Error("SCHEMA");
  }
  return {
    apiVersion: API_VERSION,
    kind: BACKUP_PROOF_KIND,
    operationId: value.operationId,
    plan,
    planHash: value.planHash as string,
    approval,
  };
}

export function admitEvidence(value: unknown): EvidenceManifest {
  if (!isRecord(value) || value.operationId === undefined || value.signature === undefined) {
    throw new Error("SCHEMA");
  }
  return value as EvidenceManifest;
}
