import { factsFingerprint, planHash } from "../src/plan-hash.ts";
import { PERCONA_KINDS, type AgentCapabilities, type BackupProofDocument, type LiveFacts, type Plan } from "../src/types.ts";

export const SAFE_AGENT: AgentCapabilities = {
  bash: false,
  kubectl: false,
  kubeconfig: false,
  dbAdmin: false,
};

export function privilegedAgent(flag: keyof AgentCapabilities): AgentCapabilities {
  return { ...SAFE_AGENT, [flag]: true };
}

export function sampleFacts(overrides: Partial<LiveFacts> = {}): LiveFacts {
  return {
    clusterRef: "mysql/source",
    namespace: "src",
    clusterType: "group-replication",
    mysqlName: "source-db",
    observedGeneration: 1,
    resourceVersions: { "PerconaServerMySQL/source-db": "1" },
    dataDigest: "digest-backup",
    ...overrides,
  };
}

export function samplePlan(facts: LiveFacts, overrides: Partial<Plan> = {}): Plan {
  return {
    clusterType: "group-replication",
    sourceNamespace: facts.namespace,
    restoreNamespace: "dst",
    mysqlName: facts.mysqlName,
    backupName: "source-db-backup",
    restoreName: "source-db-restore",
    restoreClusterName: "restored-db",
    factsFingerprint: factsFingerprint(facts),
    kinds: PERCONA_KINDS,
    ...overrides,
  };
}

export function approvedDocument(
  overrides: Partial<BackupProofDocument> = {},
): BackupProofDocument {
  const facts = overrides.facts ?? sampleFacts();
  const plan = overrides.plan ?? samplePlan(facts);
  const hash = overrides.planHash ?? planHash(plan);
  return {
    apiVersion: "upm.dev/v0",
    kind: "BackupProof",
    operationId: "op-1",
    intent: {
      action: "backup-proof",
      clusterRef: facts.clusterRef,
      sourceNamespace: plan.sourceNamespace,
      restoreNamespace: plan.restoreNamespace,
    },
    facts,
    plan,
    planHash: hash,
    approval: { planHash: hash, decided: "approve" },
    ...overrides,
  };
}
