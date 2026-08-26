import assert from "node:assert/strict";
import { test } from "node:test";
import { executeBackupProof } from "../src/execute.ts";
import { replayJournal } from "../src/journal.ts";
import { evaluateOracle, FIXED_SCHEMA, setA, setB } from "../src/oracle.ts";
import { integrationPinsReady } from "../src/pins.ts";
import { verifyCanonical } from "../src/signature.ts";
import {
  SPEC_P1_AGENT_NO_PRIVILEGE,
  SPEC_P1_APPROVAL_ED25519,
  SPEC_P1_DRIFT_DURING,
  SPEC_P1_JOURNAL_CHAIN,
  SPEC_P1_LEASE_NOT_SECURITY,
  SPEC_P1_ORACLE_AB,
  SPEC_P1_PLANHASH_BINDINGS,
  SPEC_P1_RESUME_OR_BLOCKED,
  SPEC_P1_SCOPE_NONDESTRUCTIVE,
  SPEC_P1_TARGET_FENCE,
} from "../src/types.ts";
import { ACTOR, liveCluster, makeKeys, makePlan, makeRequest, SAFE_AGENT } from "./helpers.ts";

function run(
  nowMs = 1_000_000,
  extras: {
    cluster?: ReturnType<typeof liveCluster>;
    keys?: ReturnType<typeof makeKeys>;
    request?: ReturnType<typeof makeRequest>["request"];
    crashAfter?: Parameters<typeof executeBackupProof>[0]["crashAfter"];
    startedAtMs?: number;
    actor?: typeof ACTOR;
  } = {},
) {
  const keys = extras.keys ?? makeKeys();
  const cluster = extras.cluster ?? liveCluster();
  const built = extras.request ? { request: extras.request, keys } : makeRequest(nowMs, keys);
  const input: Parameters<typeof executeBackupProof>[0] = {
    request: built.request,
    agent: SAFE_AGENT,
    actor: extras.actor ?? ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs,
  };
  if (extras.startedAtMs !== undefined) {
    input.startedAtMs = extras.startedAtMs;
  }
  if (extras.crashAfter !== undefined) {
    input.crashAfter = extras.crashAfter;
  }
  return {
    result: executeBackupProof(input),
    cluster,
    request: built.request,
    keys: built.keys,
  };
}

test(`${SPEC_P1_SCOPE_NONDESTRUCTIVE} isolated restore keeps set A only`, () => {
  const { result, cluster } = run();
  assert.equal(result.ok, true);
  assert.equal(result.record.evidence?.oracle.count, 1000);
  assert.equal(result.record.evidence?.oracle.setBAbsent, true);
  assert.equal(evaluateOracle(cluster.snapshotRows("src", "source-db") ?? [], { ...FIXED_SCHEMA }).pass, false);
});

test(`${SPEC_P1_ORACLE_AB} ordered-row hash matches set A and excludes set B`, () => {
  const { result } = run();
  assert.equal(result.record.evidence?.oracle.orderedRowHash, evaluateOracle(setA(), { ...FIXED_SCHEMA }).orderedRowHash);
  assert.equal(evaluateOracle([...setA(), ...setB()], { ...FIXED_SCHEMA }).pass, false);
});

test(`${SPEC_P1_PLANHASH_BINDINGS} outer operationId mismatch is denied`, () => {
  const built = makeRequest(1_000_000);
  const raw = { ...built.request, operationId: "op-other" };
  const result = executeBackupProof({
    request: raw,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.ok(result.denial === "DRIFT" || result.denial === "BLOCKED");
});

test(`${SPEC_P1_PLANHASH_BINDINGS} another writer cannot use the approved actor`, () => {
  const { result } = run(1_000_000, { actor: { ...ACTOR, actorId: "writer-2" } });
  assert.equal(result.denial, "DRIFT");
});

test(`${SPEC_P1_PLANHASH_BINDINGS} restore namespace swap changes planHash`, () => {
  const keys = makeKeys();
  const plan = makePlan({ restoreNamespace: "other", restoreNamespaceUid: "ns-other" });
  const built = makeRequest(1_000_000, keys, plan);
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "DRIFT");
});

test(`${SPEC_P1_APPROVAL_ED25519} expired approval is unapproved before consume`, () => {
  const built = makeRequest(1_000_000);
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000 + 16 * 60 * 1000,
  });
  assert.equal(result.denial, "UNAPPROVED");
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} consumed approval resumes after expiry`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  const first = run(1_000_000, { cluster, keys, crashAfter: "ApprovalConsumed" });
  assert.equal(first.result.ok, false);
  const second = executeBackupProof({
    request: first.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: first.keys.trusted,
    nowMs: 1_000_000 + 16 * 60 * 1000,
  });
  assert.equal(second.ok, true);
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} FenceSet crash resumes instead of DRIFT`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  run(1_000_000, { cluster, keys, crashAfter: "FenceSet" });
  const resumed = run(1_000_000, { cluster, keys });
  assert.equal(resumed.result.ok, true);
  assert.equal(resumed.result.replayed, false);
});

test(`${SPEC_P1_AGENT_NO_PRIVILEGE} kubectl agent is denied`, () => {
  const keys = makeKeys();
  const built = makeRequest(1_000_000, keys);
  const result = executeBackupProof({
    request: built.request,
    agent: { ...SAFE_AGENT, kubectl: true },
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "AGENT_PRIVILEGE");
});

test(`${SPEC_P1_TARGET_FENCE} same-namespace restore is denied`, () => {
  const keys = makeKeys();
  const plan = makePlan({ restoreNamespace: "src", restoreNamespaceUid: "ns-src" });
  const built = makeRequest(1_000_000, keys, plan);
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "SAME_NAMESPACE");
});

test(`${SPEC_P1_DRIFT_DURING} external mutation is replay-stable`, () => {
  const cluster = liveCluster();
  cluster.forceDriftAfterBackup = true;
  const keys = makeKeys();
  const first = run(1_000_000, { cluster, keys });
  assert.equal(first.result.denial, "TARGET_DRIFTED_DURING_OPERATION");
  const second = run(1_000_000, { cluster, keys });
  assert.equal(second.result.replayed, true);
  assert.equal(second.result.denial, "TARGET_DRIFTED_DURING_OPERATION");
});

test("fence release failure is replay-stable and never closes success", () => {
  const cluster = liveCluster();
  cluster.failFenceRelease = true;
  const keys = makeKeys();
  const first = run(1_000_000, { cluster, keys });
  assert.equal(first.result.denial, "FENCE_RELEASE_BLOCKED");
  const second = run(1_000_000, { cluster, keys });
  assert.equal(second.result.replayed, true);
  assert.equal(second.result.denial, "FENCE_RELEASE_BLOCKED");
});

test(`${SPEC_P1_JOURNAL_CHAIN} replayed evidence is idempotent`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  const first = run(1_000_000, { cluster, keys });
  const second = run(1_000_000, { cluster, keys });
  assert.equal(first.result.ok, true);
  assert.equal(second.result.replayed, true);
  assert.deepEqual(second.result.record.evidence, first.result.record.evidence);
  replayJournal(cluster.listJournal(ACTOR));
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} tampered journal is BLOCKED`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  run(1_000_000, { cluster, keys });
  cluster.listJournal(ACTOR)[0]!.eventDigest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const again = run(1_000_000, { cluster, keys });
  assert.equal(again.result.denial, "BLOCKED");
});

test(`${SPEC_P1_LEASE_NOT_SECURITY} a live foreign lease only contends`, () => {
  const cluster = liveCluster();
  cluster.nowMs = 1_000_000;
  assert.equal(cluster.acquireLease(ACTOR, "other-writer"), true);
  const { result } = run(1_000_000, { cluster });
  assert.equal(result.denial, "LEASE_CONTENDED");
});

test("SPEC-P1-EVIDENCE-SIGN execution key verifies and approver key does not", () => {
  const { result, keys } = run();
  const evidence = result.record.evidence!;
  const { signature, ...unsigned } = evidence;
  assert.equal(verifyCanonical(keys.execution.publicKeyPem, unsigned, signature), true);
  assert.equal(verifyCanonical(keys.approval.publicKeyPem, unsigned, signature), false);
  assert.equal(evidence.backupArtifactDigest, evidence.artifactDigest);
  assert.ok(evidence.journalRoot.length > 0);
});

test("integration pins stay closed until MinIO SPDX and client compat admit", () => {
  assert.equal(integrationPinsReady(), false);
});

test("timeout budget is enforced", () => {
  const { result } = run(1_000_000, { startedAtMs: 1_000_000 - 120_000 });
  assert.equal(result.denial, "TIMEOUT");
});

test("unknown request field is rejected", () => {
  const built = makeRequest(1_000_000);
  const result = executeBackupProof({
    request: { ...built.request, extra: true },
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "BLOCKED");
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} crash at each write-ahead and create boundary resumes`, () => {
  for (const crashAfter of [
    "IntentAccepted",
    "BackupWriteAhead",
    "BackupCreated",
    "FenceWriteAhead",
    "RestoreWriteAhead",
    "RestoreClusterCreated",
    "RestoreCreated",
    "FenceReleaseWriteAhead",
  ] as const) {
    const cluster = liveCluster();
    const keys = makeKeys();
    const first = run(1_000_000, { cluster, keys, crashAfter });
    assert.equal(first.result.ok, false);
    const second = run(1_000_000, { cluster, keys });
    assert.equal(second.result.ok, true);
  }
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} missing backup after create is BLOCKED`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  run(1_000_000, { cluster, keys, crashAfter: "BackupCreated" });
  for (const [storeKey, object] of [...cluster.objects.entries()]) {
    if (object.kind === "PerconaServerMySQLBackup") {
      cluster.objects.delete(storeKey);
    }
  }
  const again = run(1_000_000, { cluster, keys });
  assert.equal(again.result.denial, "BLOCKED");
});

