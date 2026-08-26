import assert from "node:assert/strict";
import { test } from "node:test";
import { executeBackupProof } from "../src/execute.ts";
import { backupName } from "../src/names.ts";
import { evaluateOracle, FIXED_SCHEMA, setA } from "../src/oracle.ts";
import { actorMay } from "../src/rbac.ts";
import { sha256Canonical } from "../src/rfc8785.ts";
import { admitApproval, admitEvidence, admitRequest } from "../src/schema.ts";
import { verifyOffline } from "../src/verify.ts";
import {
  CONTROL_NAMESPACE,
  SPEC_P1_APPROVAL_ED25519,
  SPEC_P1_ORACLE_AB,
  SPEC_P1_RESUME_OR_BLOCKED,
} from "../src/types.ts";
import { ACTOR, liveCluster, makeKeys, makePlan, makeRequest, SAFE_AGENT } from "./helpers.ts";

function run(
  nowMs: number,
  extras: {
    cluster?: ReturnType<typeof liveCluster>;
    keys?: ReturnType<typeof makeKeys>;
    crashAfter?: Parameters<typeof executeBackupProof>[0]["crashAfter"];
  } = {},
) {
  const keys = extras.keys ?? makeKeys();
  const cluster = extras.cluster ?? liveCluster();
  const built = makeRequest(nowMs, keys);
  const input: Parameters<typeof executeBackupProof>[0] = {
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs,
  };
  if (extras.crashAfter !== undefined) {
    input.crashAfter = extras.crashAfter;
  }
  return { result: executeBackupProof(input), cluster, request: built.request, keys: built.keys };
}

test(`${SPEC_P1_RESUME_OR_BLOCKED} API success without FenceSet event resumes`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  run(1_000_000, { cluster, keys, crashAfter: "afterFenceApi" });
  assert.equal(run(1_000_000, { cluster, keys }).result.ok, true);
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} API success without EvidenceClosed resumes`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  run(1_000_000, { cluster, keys, crashAfter: "afterReleaseApi" });
  assert.equal(run(1_000_000, { cluster, keys }).result.ok, true);
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} partial restore cluster create resumes`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  run(1_000_000, { cluster, keys, crashAfter: "afterRestoreClusterApi" });
  assert.equal(run(1_000_000, { cluster, keys }).result.ok, true);
});

test(`${SPEC_P1_APPROVAL_ED25519} substituted approval after consume is BLOCKED`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  const first = run(1_000_000, { cluster, keys, crashAfter: "ApprovalConsumed" });
  const result = executeBackupProof({
    request: {
      ...first.request,
      approval: { ...first.request.approval, approvalId: "forged", nonce: "forged", signature: "AA==" },
    },
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: first.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "BLOCKED");
  assert.equal(result.ok, false);
});

test("missing required plan.risk is BLOCKED", () => {
  const built = makeRequest(1_000_000);
  const plan = { ...built.request.plan };
  delete (plan as { risk?: string }).risk;
  const result = executeBackupProof({
    request: { ...built.request, plan },
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "BLOCKED");
});

test("empty budget is BLOCKED", () => {
  const keys = makeKeys();
  const built = makeRequest(1_000_000, keys, makePlan({ budget: "" }));
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "BLOCKED");
});

test("approval missing signature is BLOCKED not thrown", () => {
  const built = makeRequest(1_000_000);
  const { signature: _ignored, ...unsigned } = built.request.approval;
  const result = executeBackupProof({
    request: { ...built.request, approval: unsigned },
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "BLOCKED");
});

test("admitEvidence and admitApproval reject incomplete objects", () => {
  assert.throws(() => admitEvidence({ operationId: "x", signature: "x" }), /SCHEMA/);
  assert.throws(() => admitApproval({ approvalId: "x" }), /SCHEMA/);
  assert.throws(() => admitRequest({ apiVersion: "upm.dev/v0" }), /SCHEMA/);
});

test(`${SPEC_P1_ORACLE_AB} wrong observed schema cannot pass`, () => {
  assert.equal(evaluateOracle(setA(), { table: "wrong", columns: "wrong" }).pass, false);
  assert.equal(evaluateOracle(setA(), undefined).pass, false);
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} attacker artifact identity after write-ahead is BLOCKED`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  const first = run(1_000_000, { cluster, keys, crashAfter: "BackupWriteAhead" });
  const snapshot = cluster.snapshotRows("src", "source-db") ?? [];
  const name = backupName("op-1");
  cluster.objects.set(`src/PerconaServerMySQLBackup/${name}`, {
    kind: "PerconaServerMySQLBackup",
    namespace: "src",
    name,
    uid: "op-1-backup",
    generation: 1,
    resourceVersion: "1",
    annotations: { operationId: "op-1", planHash: first.request.planHash },
    specDigest: first.request.planHash,
    spec: { mysqlName: "source-db" },
    rows: snapshot,
    observedSchema: { ...FIXED_SCHEMA },
    backupStatus: "Succeeded",
    artifactId: "attacker-artifact",
    artifactDigest: sha256Canonical(snapshot),
  });
  const again = run(1_000_000, { cluster, keys });
  assert.equal(again.result.denial, "BLOCKED");
});

test("offline verifier accepts closed evidence and rejects forged journal head", () => {
  const { result, request, keys, cluster } = run(1_000_000);
  assert.equal(result.ok, true);
  const ok = verifyOffline({
    request,
    evidence: result.record.evidence,
    journal: cluster.listJournal(ACTOR),
    executionPublicKeyPem: keys.execution.publicKeyPem,
    approvalPublicKeyPem: keys.approval.publicKeyPem,
  });
  assert.equal(ok.ok, true);
  const forged = verifyOffline({
    request,
    evidence: { ...result.record.evidence, journalHead: "sha256:dead" },
    journal: cluster.listJournal(ACTOR),
    executionPublicKeyPem: keys.execution.publicKeyPem,
    approvalPublicKeyPem: keys.approval.publicKeyPem,
  });
  assert.equal(forged.ok, false);
});

test("writer cannot create ConfigMap in src or Percona kind in control namespace", () => {
  assert.equal(actorMay(ACTOR, "src", "ConfigMap", "create"), false);
  assert.equal(actorMay(ACTOR, CONTROL_NAMESPACE, "PerconaServerMySQL", "create"), false);
  assert.equal(actorMay(ACTOR, CONTROL_NAMESPACE, "ConfigMap", "list"), true);
});

test("journal list without list verb is RBAC", () => {
  const cluster = liveCluster();
  const stripped = { actorId: "writer-1", rules: ACTOR.rules.filter((rule) => rule.kind !== "ConfigMap") };
  assert.throws(() => cluster.listJournal(stripped), /UNAUTHORIZED/);
});

test("execution deadline consumes elapsed API time", () => {
  const cluster = liveCluster();
  cluster.apiElapsedMs = 70_000;
  const keys = makeKeys();
  const { result } = run(1_000_000, { cluster, keys });
  assert.equal(result.denial, "TIMEOUT");
});

test("lease renew failure is LEASE_CONTENDED", () => {
  const cluster = liveCluster();
  cluster.failRenew = true;
  const keys = makeKeys();
  const { result } = run(1_000_000, { cluster, keys });
  assert.equal(result.denial, "LEASE_CONTENDED");
});
