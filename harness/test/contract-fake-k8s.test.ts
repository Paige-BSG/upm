import assert from "node:assert/strict";
import { test } from "node:test";
import { executeBackupProof } from "../src/execute.ts";
import { FakeK8s } from "../src/fake-k8s.ts";
import { MemoryOperationStore } from "../src/operation-store.ts";
import { narrowPerconaActor } from "../src/rbac.ts";
import { approvedDocument, SAFE_AGENT } from "./helpers.ts";

function executeWith(adapter: FakeK8s, store = new MemoryOperationStore()) {
  adapter.seedCluster("src", "source-db", "digest-backup");
  return executeBackupProof({
    document: approvedDocument(),
    agent: SAFE_AGENT,
    actor: narrowPerconaActor(["src", "dst"]),
    adapter,
    store,
  });
}

test("adapter failure fails closed and stores the denial", () => {
  const adapter = new FakeK8s();
  adapter.mode = "fail";
  const store = new MemoryOperationStore();
  const result = executeWith(adapter, store);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "ADAPTER_FAILURE");
  assert.equal(store.get("op-1")?.denial, "ADAPTER_FAILURE");
});

test("adapter timeout fails closed", () => {
  const adapter = new FakeK8s();
  adapter.mode = "timeout";
  const result = executeWith(adapter);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "TIMEOUT");
});

test("adapter unauthorized fails closed", () => {
  const adapter = new FakeK8s();
  adapter.mode = "unauthorized";
  const result = executeWith(adapter);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.denial, "RBAC");
});

test("restart replay after success does not create another restore object name", () => {
  const adapter = new FakeK8s();
  const store = new MemoryOperationStore();
  const first = executeWith(adapter, store);
  const namesBefore = [...adapter.objects.keys()].sort();
  const second = executeWith(adapter, store);
  const namesAfter = [...adapter.objects.keys()].sort();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!second.ok) {
    return;
  }
  assert.equal(second.replayed, true);
  assert.deepEqual(namesAfter, namesBefore);
});
