export const API_VERSION = "upm.dev/v0" as const;
export const BACKUP_PROOF_KIND = "BackupProof" as const;
export const CLUSTER_TYPE = "group-replication" as const;

export const PERCONA_KINDS = [
  "PerconaServerMySQL",
  "PerconaServerMySQLBackup",
  "PerconaServerMySQLRestore",
] as const;

export type PerconaKind = (typeof PERCONA_KINDS)[number];

export type AgentCapabilities = {
  bash: boolean;
  kubectl: boolean;
  kubeconfig: boolean;
  dbAdmin: boolean;
};

export type Intent = {
  action: "backup-proof";
  clusterRef: string;
  sourceNamespace: string;
  restoreNamespace: string;
};

export type LiveFacts = {
  clusterRef: string;
  namespace: string;
  clusterType: typeof CLUSTER_TYPE;
  mysqlName: string;
  observedGeneration: number;
  resourceVersions: Record<string, string>;
  dataDigest: string;
};

export type Plan = {
  clusterType: typeof CLUSTER_TYPE;
  sourceNamespace: string;
  restoreNamespace: string;
  mysqlName: string;
  backupName: string;
  restoreName: string;
  restoreClusterName: string;
  factsFingerprint: string;
  kinds: typeof PERCONA_KINDS;
};

export type Approval = {
  planHash: string;
  decided: "approve" | "deny";
};

export type BackupProofDocument = {
  apiVersion: typeof API_VERSION;
  kind: typeof BACKUP_PROOF_KIND;
  operationId: string;
  intent: Intent;
  facts: LiveFacts;
  plan: Plan;
  planHash: string;
  approval?: Approval;
};

export type AdapterActor = {
  namespaces: readonly string[];
  kinds: readonly PerconaKind[];
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
  | "RESTORE_PROOF_MISMATCH"
  | "INTEGRATION_PINS_PENDING";

export type EvidenceBundle = {
  operationId: string;
  planHash: string;
  sourceNamespace: string;
  restoreNamespace: string;
  backupDataDigest: string;
  restoreDataDigest: string;
  postBackupWriteDigest: string | null;
  createdKinds: PerconaKind[];
};

export type OperationRecord = {
  operationId: string;
  planHash: string;
  backupCreated: boolean;
  restoreCreated: boolean;
  evidence: EvidenceBundle | null;
  denial: DenialCode | null;
};

export type ExecuteOk = {
  ok: true;
  replayed: boolean;
  record: OperationRecord;
};

export type ExecuteDenied = {
  ok: false;
  replayed: boolean;
  denial: DenialCode;
  record: OperationRecord | null;
};

export type ExecuteResult = ExecuteOk | ExecuteDenied;

export class AdapterFailureError extends Error {
  readonly code = "ADAPTER_FAILURE";
}

export class AdapterTimeoutError extends Error {
  readonly code = "TIMEOUT";
}

export class AdapterUnauthorizedError extends Error {
  readonly code = "RBAC";
}

export type K8sObject = {
  kind: PerconaKind;
  namespace: string;
  name: string;
  spec: Record<string, unknown>;
  dataDigest?: string;
};

export type K8sAdapter = {
  create(actor: AdapterActor, object: K8sObject): K8sObject;
  get(
    actor: AdapterActor,
    kind: PerconaKind,
    namespace: string,
    name: string,
  ): K8sObject | undefined;
};
