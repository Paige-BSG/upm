import {
  API_VERSION,
  BACKUP_PROOF_KIND,
  CLUSTER_TYPE,
  PERCONA_KINDS,
  type BackupProofDocument,
} from "./types.ts";

export type SchemaIssue = {
  path: string;
  code: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(issues: SchemaIssue[], path: string, value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path, code: "STRING" });
  }
}

export function validateBackupProof(value: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!isRecord(value)) {
    return [{ path: "", code: "OBJECT" }];
  }
  if (value.apiVersion !== API_VERSION) {
    issues.push({ path: "apiVersion", code: "CONST" });
  }
  if (value.kind !== BACKUP_PROOF_KIND) {
    issues.push({ path: "kind", code: "CONST" });
  }
  expectString(issues, "operationId", value.operationId);
  if (!isRecord(value.intent)) {
    issues.push({ path: "intent", code: "OBJECT" });
  } else {
    if (value.intent.action !== "backup-proof") {
      issues.push({ path: "intent.action", code: "CONST" });
    }
    expectString(issues, "intent.clusterRef", value.intent.clusterRef);
    expectString(issues, "intent.sourceNamespace", value.intent.sourceNamespace);
    expectString(issues, "intent.restoreNamespace", value.intent.restoreNamespace);
  }
  if (!isRecord(value.facts)) {
    issues.push({ path: "facts", code: "OBJECT" });
  } else {
    expectString(issues, "facts.clusterRef", value.facts.clusterRef);
    expectString(issues, "facts.namespace", value.facts.namespace);
    if (value.facts.clusterType !== CLUSTER_TYPE) {
      issues.push({ path: "facts.clusterType", code: "CONST" });
    }
    expectString(issues, "facts.mysqlName", value.facts.mysqlName);
    if (typeof value.facts.observedGeneration !== "number") {
      issues.push({ path: "facts.observedGeneration", code: "NUMBER" });
    }
    if (!isRecord(value.facts.resourceVersions)) {
      issues.push({ path: "facts.resourceVersions", code: "OBJECT" });
    }
    expectString(issues, "facts.dataDigest", value.facts.dataDigest);
  }
  const plan = value.plan;
  if (!isRecord(plan)) {
    issues.push({ path: "plan", code: "OBJECT" });
  } else {
    if (plan.clusterType !== CLUSTER_TYPE) {
      issues.push({ path: "plan.clusterType", code: "CONST" });
    }
    expectString(issues, "plan.sourceNamespace", plan.sourceNamespace);
    expectString(issues, "plan.restoreNamespace", plan.restoreNamespace);
    expectString(issues, "plan.mysqlName", plan.mysqlName);
    expectString(issues, "plan.backupName", plan.backupName);
    expectString(issues, "plan.restoreName", plan.restoreName);
    expectString(issues, "plan.restoreClusterName", plan.restoreClusterName);
    expectString(issues, "plan.factsFingerprint", plan.factsFingerprint);
    const kinds = plan.kinds;
    if (
      !Array.isArray(kinds) ||
      kinds.length !== PERCONA_KINDS.length ||
      PERCONA_KINDS.some((kind, index) => kinds[index] !== kind)
    ) {
      issues.push({ path: "plan.kinds", code: "CONST" });
    }
  }
  if (typeof value.planHash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.planHash)) {
    issues.push({ path: "planHash", code: "PLAN_HASH" });
  }
  if (value.approval !== undefined) {
    if (!isRecord(value.approval)) {
      issues.push({ path: "approval", code: "OBJECT" });
    } else {
      if (typeof value.approval.planHash !== "string") {
        issues.push({ path: "approval.planHash", code: "STRING" });
      }
      if (value.approval.decided !== "approve" && value.approval.decided !== "deny") {
        issues.push({ path: "approval.decided", code: "ENUM" });
      }
    }
  }
  return issues;
}

export function asBackupProof(value: unknown): BackupProofDocument {
  const issues = validateBackupProof(value);
  if (issues.length > 0) {
    throw new Error(`BACKUP_PROOF_SCHEMA:${issues.map((issue) => `${issue.path}:${issue.code}`).join(",")}`);
  }
  return value as BackupProofDocument;
}
