export { canonicalize, sha256Canonical } from "./canonical.ts";
export { factsFingerprint, planHash } from "./plan-hash.ts";
export { STARTUP_PINS, assertIntegrationPins, pinsAdmitted } from "./pins.ts";
export type { StartupPin } from "./pins.ts";
export { agentHasPrivilege, actorMay, narrowPerconaActor } from "./rbac.ts";
export { asBackupProof, validateBackupProof } from "./schema.ts";
export { MemoryOperationStore } from "./operation-store.ts";
export { evidenceDigest, restoreMatchesBackup, verifyEvidenceOffline } from "./evidence.ts";
export { FakeK8s } from "./fake-k8s.ts";
export { executeBackupProof } from "./execute.ts";
export {
  API_VERSION,
  BACKUP_PROOF_KIND,
  CLUSTER_TYPE,
  PERCONA_KINDS,
  AdapterFailureError,
  AdapterTimeoutError,
  AdapterUnauthorizedError,
} from "./types.ts";
export type {
  AdapterActor,
  AgentCapabilities,
  Approval,
  BackupProofDocument,
  DenialCode,
  EvidenceBundle,
  ExecuteResult,
  Intent,
  K8sAdapter,
  LiveFacts,
  OperationRecord,
  PerconaKind,
  Plan,
} from "./types.ts";
