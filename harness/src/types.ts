import { requireInvariant } from "./ids.ts";

export const SPEC_P1_SCOPE_NONDESTRUCTIVE = requireInvariant("SPEC-P1-SCOPE-NONDESTRUCTIVE");
export const SPEC_P1_JOURNAL_CHAIN = requireInvariant("SPEC-P1-JOURNAL-CHAIN");
export const SPEC_P1_JOURNAL_APPEND_ONLY = requireInvariant("SPEC-P1-JOURNAL-APPEND-ONLY");
export const SPEC_P1_LEASE_NOT_SECURITY = requireInvariant("SPEC-P1-LEASE-NOT-SECURITY");
export const SPEC_P1_RESUME_OR_BLOCKED = requireInvariant("SPEC-P1-RESUME-OR-BLOCKED");
export const SPEC_P1_PLANHASH_BINDINGS = requireInvariant("SPEC-P1-PLANHASH-BINDINGS");
export const SPEC_P1_APPROVAL_ED25519 = requireInvariant("SPEC-P1-APPROVAL-ED25519");
export const SPEC_P1_TARGET_FENCE = requireInvariant("SPEC-P1-TARGET-FENCE");
export const SPEC_P1_DRIFT_DURING = requireInvariant("SPEC-P1-DRIFT-DURING");
export const SPEC_P1_ORACLE_AB = requireInvariant("SPEC-P1-ORACLE-AB");
export const SPEC_P1_EVIDENCE_SIGN = requireInvariant("SPEC-P1-EVIDENCE-SIGN");
export const SPEC_P1_NO_COMMENT = requireInvariant("SPEC-P1-NO-COMMENT");
export const SPEC_P1_AGENT_NO_PRIVILEGE = requireInvariant("SPEC-P1-AGENT-NO-PRIVILEGE");

export const API_VERSION = "upm.dev/v0" as const;
export const BACKUP_PROOF_KIND = "BackupProof" as const;
export const EVIDENCE_KIND = "BackupProofEvidence" as const;
export const CLUSTER_TYPE = "group-replication" as const;
export const CONTROL_NAMESPACE = "upm-system" as const;
export const WRITER_LEASE_NAME = "upm-backupproof-writer" as const;
export const FENCE_ANNOTATION = "upm.io/backup-proof-fence" as const;
export const APPROVAL_TTL_MS = 15 * 60 * 1000;
export const LEASE_DURATION_MS = 30_000;
export const LEASE_RENEW_MS = 10_000;
export const SCHEMA_VERSION = "phase1-v0.2" as const;
export const PHASE1_BUDGET = "size=1" as const;
export const PHASE1_ACTIONS = ["backup", "isolated-restore"] as const;
export const PHASE1_RISK = "non-destructive" as const;
export const PHASE1_POLICY = "v0.2" as const;
export const PHASE1_STOP = ["unapproved", "drift", "lease-loss"] as const;
export type ArtifactDestination = {
  bucket: string;
  objectKey: string;
  endpoint: string;
};

export const PERCONA_KINDS = [
  "PerconaServerMySQL",
  "PerconaServerMySQLBackup",
  "PerconaServerMySQLRestore",
] as const;

export const CONTROL_KINDS = ["ConfigMap", "Lease"] as const;
export const VERBS = ["get", "create", "list", "patch", "update"] as const;

export type PerconaKind = (typeof PERCONA_KINDS)[number];
export type ControlKind = (typeof CONTROL_KINDS)[number];
export type ResourceKind = PerconaKind | ControlKind;
export type Verb = (typeof VERBS)[number];

export type AgentCapabilities = {
  bash: boolean;
  kubectl: boolean;
  kubeconfig: boolean;
  dbAdmin: boolean;
};

export type Permission = {
  namespace: string;
  kind: ResourceKind;
  verbs: readonly Verb[];
};

export type Actor = {
  actorId: string;
  rules: readonly Permission[];
};

export type TrustedApproval = {
  publicKeyPem: string;
  subject: string;
  role: string;
};

export type TrustedKeys = {
  approval: Record<string, TrustedApproval>;
  execution: { keyId: string; publicKeyPem: string; privateKeyPem: string };
};

export type TargetRef = {
  namespace: string;
  name: string;
  uid: string;
  generation: number;
  resourceVersion: string;
  specDigest: string;
};

export type PlanDocument = {
  schemaVersion: typeof SCHEMA_VERSION;
  operationId: string;
  actor: string;
  clusterUid: string;
  targetNamespace: string;
  targetNamespaceUid: string;
  restoreNamespace: string;
  restoreNamespaceUid: string;
  requiredApproverRole: string;
  requiredApproverSubject: string;
  target: TargetRef;
  factsSnapshotId: string;
  factsDigest: string;
  actions: readonly string[];
  parameters: Record<string, string>;
  artifactDestination: ArtifactDestination;
  risk: string;
  timeoutMs: number;
  budget: string;
  stopConditions: readonly string[];
  approvalPolicyVersion: string;
};

export type ApprovalEnvelope = {
  approvalId: string;
  planHash: string;
  approverSubject: string;
  keyId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature: string;
};

export type BackupProofRequest = {
  apiVersion: typeof API_VERSION;
  kind: typeof BACKUP_PROOF_KIND;
  operationId: string;
  plan: PlanDocument;
  planHash: string;
  approval: ApprovalEnvelope;
};

export type DenialCode =
  | "AGENT_PRIVILEGE"
  | "UNAPPROVED"
  | "PLAN_HASH_MISMATCH"
  | "DRIFT"
  | "RBAC"
  | "SAME_NAMESPACE"
  | "TIMEOUT"
  | "ADAPTER_FAILURE"
  | "BLOCKED"
  | "LEASE_CONTENDED"
  | "FENCE_RELEASE_BLOCKED"
  | "TARGET_DRIFTED_DURING_OPERATION"
  | "ORACLE_FAILED";

export const JOURNAL_EVENT_TYPES = [
  "IntentAccepted",
  "ApprovalConsumed",
  "FenceWriteAhead",
  "FenceSet",
  "BackupWriteAhead",
  "BackupCreated",
  "SetBWriteAhead",
  "SetBApplied",
  "RestoreWriteAhead",
  "RestoreClusterCreated",
  "RestoreCreated",
  "FenceReleaseWriteAhead",
  "EvidenceStoreWriteAhead",
  "EvidenceClosed",
  "FenceReleaseBlocked",
] as const;

export type JournalEventType = (typeof JOURNAL_EVENT_TYPES)[number];

export type JournalPhase =
  | "empty"
  | "intent"
  | "approved"
  | "fence_wa"
  | "fenced"
  | "backup_wa"
  | "backed_up"
  | "setb_wa"
  | "setb_applied"
  | "restore_wa"
  | "restore_cluster"
  | "restored"
  | "fence_rel_wa"
  | "evidence_wa"
  | "closed"
  | "fence_blocked"
  | "blocked";

export type JournalEvent = {
  schemaVersion: typeof SCHEMA_VERSION;
  operationId: string;
  sequence: number;
  type: JournalEventType;
  previousEventDigest: string | null;
  eventDigest: string;
  payload: Record<string, string>;
};

export type EffectIdentity = {
  kind: string;
  namespace: string;
  name: string;
  uid: string;
  generation: number;
};

export type EvidencePin = {
  id: string;
  admission: string;
  candidate: string;
  digest: string;
};

export type EvidenceManifest = {
  apiVersion: typeof API_VERSION;
  kind: typeof EVIDENCE_KIND;
  schemaVersion: typeof SCHEMA_VERSION;
  operationId: string;
  planHash: string;
  actor: string;
  clusterUid: string;
  sourceNamespace: string;
  restoreNamespace: string;
  targetPre: TargetRef;
  targetPost: TargetRef;
  approval: ApprovalEnvelope;
  journalRoot: string;
  journalHead: string;
  backupArtifactId: string;
  backupArtifactDigest: string;
  observedSchemaDigest: string;
  artifactDigest: string;
  artifactDestination: ArtifactDestination;
  oracle: {
    schemaDigest: string;
    count: number;
    primaryKeyMin: number;
    primaryKeyMax: number;
    orderedRowHash: string;
    setBAbsent: boolean;
  };
  intent: {
    operationId: string;
    planHash: string;
    factsSnapshotId: string;
    factsDigest: string;
    startedAtMs: number;
    deadlineMs: number;
  };
  facts: {
    snapshotId: string;
    digest: string;
    clusterUid: string;
    targetNamespaceUid: string;
    restoreNamespaceUid: string;
    target: TargetRef;
  };
  effects: {
    backup: EffectIdentity;
    restoreCluster: EffectIdentity;
    restore: EffectIdentity;
  };
  timeline: {
    startedAtMs: number;
    deadlineMs: number;
    closedAtMs: number;
  };
  pins: readonly EvidencePin[];
  trustIdentity: {
    approvalKeyId: string;
    executionKeyId: string;
    approvalPolicyVersion: string;
    approvalSubject: string;
    approvalRole: string;
  };
  factsSnapshotId: string;
  factsDigest: string;
  driftedDuring: boolean;
  verdict: DenialCode | "OK";
  pinsDigest: string;
  keyId: string;
  signature: string;
};

export type OperationRecord = {
  operationId: string;
  planHash: string;
  denial: DenialCode | null;
  evidence: EvidenceManifest | null;
  driftedDuring: boolean;
};

export class AdapterFailureError extends Error {
  readonly code = "ADAPTER_FAILURE";
}

export class AdapterTimeoutError extends Error {
  readonly code = "TIMEOUT";
}

export class AdapterConflictError extends Error {
  readonly code = "CONFLICT";
}

export class AdapterUnauthorizedError extends Error {
  readonly code = "RBAC";
}
