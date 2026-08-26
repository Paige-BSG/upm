import assert from "node:assert/strict";
import { test } from "node:test";
import { executeBackupProof } from "../src/execute.ts";
import { FakeK8s } from "../src/fake-k8s.ts";
import { MemoryOperationStore } from "../src/operation-store.ts";
import { narrowPerconaActor } from "../src/rbac.ts";
import { approvedDocument, privilegedAgent, SAFE_AGENT, sampleFacts, samplePlan } from "./helpers.ts";

function run(document: unknown, extras: { adapter?: FakeK8s; store?: MemoryOperationStore; postBackupWriteDigest?: string; actor?: ReturnType<typeof narrowPerconaActor> } = {}) {
  const adapter = extras.adapter ?? new FakeK8s();
  if (!extras.adapter) {
    adapter.seedCluster("src", "source-db", "digest-backup");
  }
  return executeBackupProof({
    document,
    agent: SAFE_AGENT,
    actor: extras.actor ?? narrowPerconaActor(["src", "dst"]),
    adapter,
    store: extras.store ?? new MemoryOperationStore(),
    postBackupWriteDigest: extras.postBackupWriteDigest,
  });
}

test("approved backup restores isolated proof data", () => {
  const adapter = new FakeK8s();
  adapter.seedCluster("src", "source-db", "digest-backup");
  const result = run(approvedDocument(), { adapter, postBackupWriteDigest: "digest-after-write" });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.replayed, false);
  assert.equal(result.record.backupCreated, true);
  assert.equal(result.record.restoreCreated, true);
  assert.equal(result.record.evidence?.backupDataDigest, "digest-backup");
  assert.equal(result.record.evidence?.restoreDataDigest, "digest-backup");
  assert.equal(result.record.evidence?.postBackupWriteDigest, "digest-after-write");
  assert.equal(adapter.get(narrowPerconaActor(["src", "dst"]), "PerconaServerMySQL", "dst", "restored-db")?.dataDigest, "digest-backup");
});

test("unapproved requests do not create CRs", () => {
  const adapter = new FakeK8s();
  adapter.seedCluster("src", "source-db", "digest-backup");
  const document = approvedDocument();
  delete document.approval;
  const result = run(document, { adapter });
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "UNAPPROVED");
  assert.equal(adapter.get(narrowPerconaActor(["src"]), "PerconaServerMySQLBackup", "src", "source-db-backup"), undefined);
});

test("approval bound to a different planHash is unapproved", () => {
  const document = approvedDocument();
  document.approval = { planHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", decided: "approve" };
  const result = run(document);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "UNAPPROVED");
});

test("a mutated planHash fails closed", () => {
  const document = approvedDocument({
    planHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  document.approval = { planHash: document.planHash, decided: "approve" };
  const result = run(document);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "PLAN_HASH_MISMATCH");
});

test("fact drift fails closed", () => {
  const facts = sampleFacts({ dataDigest: "digest-backup" });
  const plan = samplePlan(sampleFacts({ dataDigest: "digest-old" }));
  const document = approvedDocument({ facts, plan });
  const result = run(document);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "DRIFT");
});

test("privileged agents are denied before any mutate", () => {
  const adapter = new FakeK8s();
  adapter.seedCluster("src", "source-db", "digest-backup");
  const result = executeBackupProof({
    document: approvedDocument(),
    agent: privilegedAgent("kubectl"),
    actor: narrowPerconaActor(["src", "dst"]),
    adapter,
    store: new MemoryOperationStore(),
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "AGENT_PRIVILEGE");
});

test("same-namespace restore is denied", () => {
  const facts = sampleFacts();
  const plan = samplePlan(facts, { restoreNamespace: facts.namespace });
  const result = run(approvedDocument({ facts, plan }));
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "SAME_NAMESPACE");
});

test("narrow SA cannot touch an extra namespace", () => {
  const result = run(approvedDocument(), { actor: narrowPerconaActor(["src"]) });
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "RBAC");
});

test("duplicate operationId does not create a second backup", () => {
  const adapter = new FakeK8s();
  adapter.seedCluster("src", "source-db", "digest-backup");
  const store = new MemoryOperationStore();
  const first = run(approvedDocument(), { adapter, store });
  adapter.writeClusterData("src", "source-db", "digest-after-write");
  const second = run(approvedDocument(), { adapter, store });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) {
    return;
  }
  assert.equal(second.replayed, true);
  assert.equal(second.record.evidence?.restoreDataDigest, "digest-backup");
  assert.equal(adapter.get(narrowPerconaActor(["src"]), "PerconaServerMySQLBackup", "src", "source-db-backup")?.dataDigest, "digest-backup");
});
