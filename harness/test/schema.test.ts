import assert from "node:assert/strict";
import { test } from "node:test";
import { validateBackupProof } from "../src/schema.ts";
import { approvedDocument } from "./helpers.ts";

test("accepts a complete BackupProof document", () => {
  assert.deepEqual(validateBackupProof(approvedDocument()), []);
});

test("rejects the wrong kind", () => {
  const issues = validateBackupProof({ ...approvedDocument(), kind: "Other" });
  assert.ok(issues.some((issue) => issue.path === "kind" && issue.code === "CONST"));
});

test("rejects async replication as clusterType", () => {
  const document = approvedDocument();
  const issues = validateBackupProof({
    ...document,
    facts: { ...document.facts, clusterType: "async" },
  });
  assert.ok(issues.some((issue) => issue.path === "facts.clusterType"));
});

test("rejects a malformed planHash", () => {
  const issues = validateBackupProof({ ...approvedDocument(), planHash: "not-a-sha" });
  assert.ok(issues.some((issue) => issue.path === "planHash"));
});
