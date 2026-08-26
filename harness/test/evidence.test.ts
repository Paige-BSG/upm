import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenceDigest, restoreMatchesBackup, verifyEvidenceOffline } from "../src/evidence.ts";
import type { EvidenceBundle } from "../src/types.ts";

function bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    operationId: "op-1",
    planHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    sourceNamespace: "src",
    restoreNamespace: "dst",
    backupDataDigest: "digest-backup",
    restoreDataDigest: "digest-backup",
    postBackupWriteDigest: "digest-after-write",
    createdKinds: ["PerconaServerMySQLBackup", "PerconaServerMySQLRestore"],
    ...overrides,
  };
}

test("offline verify accepts an isolated backup-time digest", () => {
  const value = bundle();
  assert.equal(restoreMatchesBackup(value), true);
  assert.equal(verifyEvidenceOffline(value, evidenceDigest(value)), true);
});

test("post-backup writes must not appear in restore proof", () => {
  assert.equal(restoreMatchesBackup(bundle({ restoreDataDigest: "digest-after-write" })), false);
});

test("tampered evidence fails offline verify", () => {
  const value = bundle();
  const digest = evidenceDigest(value);
  assert.equal(verifyEvidenceOffline({ ...value, restoreDataDigest: "tamper" }, digest), false);
});
