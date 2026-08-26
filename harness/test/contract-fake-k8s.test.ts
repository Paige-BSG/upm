import assert from "node:assert/strict";
import { test } from "node:test";
import { executeBackupProof } from "../src/execute.ts";
import { ACTOR, liveCluster, makeRequest, SAFE_AGENT } from "./helpers.ts";

test("adapter timeout fails closed", () => {
  const cluster = liveCluster();
  cluster.mode = "timeout";
  const built = makeRequest(1_000_000);
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "TIMEOUT");
});

test("adapter failure fails closed", () => {
  const cluster = liveCluster();
  cluster.mode = "fail";
  const built = makeRequest(1_000_000);
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "ADAPTER_FAILURE");
});

test("adapter unauthorized fails closed", () => {
  const cluster = liveCluster();
  cluster.mode = "unauthorized";
  const built = makeRequest(1_000_000);
  const result = executeBackupProof({
    request: built.request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "RBAC");
});
