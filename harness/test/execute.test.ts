import assert from "node:assert/strict";
import { test } from "node:test";
import { executeBackupProof } from "../src/execute.ts";
import { replayJournal } from "../src/journal.ts";
import { evaluateOracle, setA, setB } from "../src/oracle.ts";
import { integrationPinsReady } from "../src/pins.ts";
import { planHash } from "../src/plan-hash.ts";
import { verifyCanonical } from "../src/signature.ts";
import { SPEC_P1_AGENT_NO_PRIVILEGE, SPEC_P1_APPROVAL_ED25519, SPEC_P1_DRIFT_DURING, SPEC_P1_JOURNAL_CHAIN, SPEC_P1_LEASE_NOT_SECURITY, SPEC_P1_ORACLE_AB, SPEC_P1_PLANHASH_BINDINGS, SPEC_P1_RESUME_OR_BLOCKED, SPEC_P1_SCOPE_NONDESTRUCTIVE, SPEC_P1_TARGET_FENCE } from "../src/types.ts";
import { ACTOR, liveCluster, makeKeys, makeRequest, SAFE_AGENT } from "./helpers.ts";

function run(nowMs = 1_000_000, extras: { cluster?: ReturnType<typeof liveCluster>; keys?: ReturnType<typeof makeKeys> } = {}) {
  const keys = extras.keys ?? makeKeys();
  const cluster = extras.cluster ?? liveCluster();
  const built = makeRequest(nowMs, keys);
  return {
    result: executeBackupProof({
      request: built.request,
      agent: SAFE_AGENT,
      actor: ACTOR,
      cluster,
      keys: built.keys.trusted,
      nowMs,
    }),
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
  assert.equal(evaluateOracle(cluster.snapshotRows("src", "source-db")).pass, false);
  assert.ok(cluster.snapshotRows("src", "source-db").length > 1000);
});

test(`${SPEC_P1_ORACLE_AB} ordered-row hash matches set A and excludes set B`, () => {
  const { result } = run();
  assert.equal(result.record.evidence?.oracle.orderedRowHash, evaluateOracle(setA()).orderedRowHash);
  assert.notEqual(evaluateOracle([...setA(), ...setB()]).pass, true);
});

test(`${SPEC_P1_PLANHASH_BINDINGS} mutated planHash is denied`, () => {
  const keys = makeKeys();
  const cluster = liveCluster();
  const built = makeRequest(1_000_000, keys);
  built.request.planHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  built.request.approval.planHash = built.request.planHash;
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "PLAN_HASH_MISMATCH");
});

test(`${SPEC_P1_APPROVAL_ED25519} expired approval is unapproved`, () => {
  const keys = makeKeys();
  const cluster = liveCluster();
  const built = makeRequest(1_000_000, keys);
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs: 1_000_000 + 16 * 60 * 1000,
  });
  assert.equal(result.denial, "UNAPPROVED");
});

test(`${SPEC_P1_APPROVAL_ED25519} consumed approval cannot start a second operation`, () => {
  const { result, cluster, request, keys } = run();
  assert.equal(result.ok, true);
  const second = structuredClone(request);
  second.operationId = "op-2";
  second.plan.operationId = "op-2";
  second.planHash = planHash(second.plan);
  second.approval.planHash = request.approval.planHash;
  const replay = executeBackupProof({
    request: second,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: keys.trusted,
    nowMs: 1_000_000,
  });
  assert.ok(replay.denial === "UNAPPROVED" || replay.denial === "PLAN_HASH_MISMATCH" || replay.denial === "BLOCKED");
});

test(`${SPEC_P1_AGENT_NO_PRIVILEGE} kubectl agent is denied`, () => {
  const keys = makeKeys();
  const cluster = liveCluster();
  const built = makeRequest(1_000_000, keys);
  const result = executeBackupProof({
    request: built.request,
    agent: { ...SAFE_AGENT, kubectl: true },
    actor: ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "AGENT_PRIVILEGE");
});

test(`${SPEC_P1_TARGET_FENCE} same-namespace restore is denied`, () => {
  const keys = makeKeys();
  const cluster = liveCluster();
  const built = makeRequest(1_000_000, keys);
  built.request.restoreNamespace = built.request.plan.target.namespace;
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "SAME_NAMESPACE");
});

test(`${SPEC_P1_DRIFT_DURING} external target mutation is marked drifted`, () => {
  const cluster = liveCluster();
  cluster.forceDriftAfterBackup = true;
  const { result } = run(1_000_000, { cluster });
  assert.equal(result.record.driftedDuring, true);
  assert.equal(result.denial, "TARGET_DRIFTED_DURING_OPERATION");
  assert.equal(result.record.evidence?.driftedDuring, true);
});

test(`${SPEC_P1_JOURNAL_CHAIN} replayed evidence is idempotent`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  const first = run(1_000_000, { cluster, keys });
  const second = run(1_000_000, { cluster, keys });
  assert.equal(first.result.ok, true);
  assert.equal(second.result.replayed, true);
  assert.deepEqual(second.result.record.evidence, first.result.record.evidence);
  replayJournal(cluster.listJournal());
});

test(`${SPEC_P1_RESUME_OR_BLOCKED} tampered journal is BLOCKED`, () => {
  const cluster = liveCluster();
  const keys = makeKeys();
  run(1_000_000, { cluster, keys });
  const events = cluster.listJournal();
  events[0]!.eventDigest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const again = run(1_000_000, { cluster, keys });
  assert.equal(again.result.denial, "BLOCKED");
});

test(`${SPEC_P1_LEASE_NOT_SECURITY} a live foreign lease only contends`, () => {
  const cluster = liveCluster();
  cluster.nowMs = 1_000_000;
  assert.equal(cluster.acquireLease("other-writer"), true);
  const { result } = run(1_000_000, { cluster });
  assert.equal(result.denial, "LEASE_CONTENDED");
});

test("SPEC-P1-EVIDENCE-SIGN execution key verifies and approver key does not", () => {
  const { result, keys } = run();
  const evidence = result.record.evidence!;
  const { signature, ...unsigned } = evidence;
  assert.equal(verifyCanonical(keys.execution.publicKeyPem, unsigned, signature), true);
  assert.equal(verifyCanonical(keys.approval.publicKeyPem, unsigned, signature), false);
});

test("integration pins stay closed until MinIO and SPDX admit", () => {
  assert.equal(integrationPinsReady(), false);
});
