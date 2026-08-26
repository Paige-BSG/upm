import { FakeK8s } from "../src/fake-k8s.ts";
export { FakeK8s };
import { planHash } from "../src/plan-hash.ts";
import { sha256Canonical } from "../src/rfc8785.ts";
import { generateEd25519, signApproval } from "../src/signature.ts";
import {
  CLUSTER_TYPE,
  PERCONA_KINDS,
  SCHEMA_VERSION,
  type Actor,
  type AgentCapabilities,
  type BackupProofRequest,
  type PlanDocument,
  type TargetRef,
} from "../src/types.ts";

export const SAFE_AGENT: AgentCapabilities = {
  bash: false,
  kubectl: false,
  kubeconfig: false,
  dbAdmin: false,
};

export const ACTOR: Actor = {
  actorId: "writer-1",
  namespaces: ["src", "dst", "upm-system"],
  kinds: PERCONA_KINDS,
};

export const TARGET: TargetRef = {
  namespace: "src",
  name: "source-db",
  uid: "mysql-uid-1",
  generation: 1,
  resourceVersion: "10",
  specDigest: sha256Canonical({ clusterType: CLUSTER_TYPE }),
};

export function makeKeys() {
  const approval = generateEd25519("approve-1");
  const execution = generateEd25519("exec-1");
  return {
    approval,
    execution,
    trusted: {
      approval: { [approval.keyId]: approval.publicKeyPem },
      execution,
    },
  };
}

export function makePlan(overrides: Partial<PlanDocument> = {}): PlanDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    operationId: "op-1",
    actor: ACTOR.actorId,
    clusterUid: "cluster-uid-1",
    targetNamespace: TARGET.namespace,
    targetNamespaceUid: "ns-src",
    target: TARGET,
    factsSnapshotId: "facts-1",
    factsDigest: sha256Canonical(TARGET),
    actions: ["backup", "isolated-restore"],
    parameters: { clusterType: CLUSTER_TYPE },
    artifactDestination: "s3://test-bucket/op-1",
    risk: "non-destructive",
    timeoutMs: 60000,
    budget: "size=1",
    stopConditions: ["unapproved", "drift", "lease-loss"],
    approvalPolicyVersion: "v0.2",
    ...overrides,
  };
}

export function makeRequest(nowMs: number, keys = makeKeys()): { request: BackupProofRequest; keys: ReturnType<typeof makeKeys> } {
  const plan = makePlan();
  const hash = planHash(plan);
  const request: BackupProofRequest = {
    apiVersion: "upm.dev/v0",
    kind: "BackupProof",
    operationId: plan.operationId,
    plan,
    planHash: hash,
    restoreNamespace: "dst",
    approval: signApproval(keys.approval, {
      approvalId: "apr-1",
      planHash: hash,
      approverSubject: "human-approver",
      issuedAt: nowMs,
      expiresAt: nowMs + 15 * 60 * 1000,
      nonce: "nonce-1",
    }),
  };
  return { request, keys };
}

export function liveCluster(): FakeK8s {
  const cluster = new FakeK8s();
  cluster.seedMysql(TARGET);
  return cluster;
}
