import assert from "node:assert/strict";
import { test } from "node:test";
import { planHash } from "../src/plan-hash.ts";
import { sampleFacts, samplePlan } from "./helpers.ts";

test("planHash is stable across key order", () => {
  const facts = sampleFacts();
  const left = samplePlan(facts);
  const right = {
    kinds: left.kinds,
    factsFingerprint: left.factsFingerprint,
    restoreClusterName: left.restoreClusterName,
    restoreName: left.restoreName,
    backupName: left.backupName,
    mysqlName: left.mysqlName,
    restoreNamespace: left.restoreNamespace,
    sourceNamespace: left.sourceNamespace,
    clusterType: left.clusterType,
  };
  assert.equal(planHash(left), planHash(right));
});

test("planHash changes when the restore namespace changes", () => {
  const facts = sampleFacts();
  const base = samplePlan(facts);
  const moved = samplePlan(facts, { restoreNamespace: "other" });
  assert.notEqual(planHash(base), planHash(moved));
});
