import assert from "node:assert/strict";
import { test } from "node:test";
import { executeBackupProof } from "../src/execute.ts";
import { eventDigest } from "../src/journal.ts";
import { backupName } from "../src/names.ts";
import { artifactDigestOf, encodeBackupArtifact, evaluateOracle, FIXED_SCHEMA, SCHEMA_DIGEST, SCHEMA_LITERAL, setA } from "../src/oracle.ts";
import { sha256Utf8 } from "../src/rfc8785.ts";
import { STARTUP_PINS } from "../src/pins.ts";
import { actorMay } from "../src/rbac.ts";
import { sha256Canonical } from "../src/rfc8785.ts";
import { admitApproval, admitEvidence, admitJournalEvent, admitRequest } from "../src/schema.ts";
import { generateEd25519, signApproval, signCanonical } from "../src/signature.ts";
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
    startedAtMs?: number;
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
  if (extras.startedAtMs !== undefined) {
    input.startedAtMs = extras.startedAtMs;
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
    annotations: { operationId: "op-1", planHash: first.request.planHash, factsDigest: first.request.plan.factsDigest },
    specDigest: first.request.planHash,
    spec: {
      mysqlName: "source-db",
      destination: sha256Canonical(first.request.plan.artifactDestination),
      destinationBucket: first.request.plan.artifactDestination.bucket,
      destinationObjectKey: first.request.plan.artifactDestination.objectKey,
      destinationEndpoint: first.request.plan.artifactDestination.endpoint,
      factsDigest: first.request.plan.factsDigest,
    },
    rows: snapshot,
    observedSchema: { ...FIXED_SCHEMA },
    backupStatus: "Succeeded",
    artifactId: "attacker-artifact",
    artifactBytes: encodeBackupArtifact(first.request.plan.artifactDestination, snapshot),
    artifactDigest: artifactDigestOf(encodeBackupArtifact(first.request.plan.artifactDestination, snapshot)),
  });
  const again = run(1_000_000, { cluster, keys });
  assert.equal(again.result.denial, "BLOCKED");
});

function offlineInput(
  request: ReturnType<typeof makeRequest>["request"],
  evidence: NonNullable<ReturnType<typeof executeBackupProof>["record"]["evidence"]>,
  cluster: ReturnType<typeof liveCluster>,
  keys: ReturnType<typeof makeKeys>,
) {
  return {
    request,
    evidence,
    journal: cluster.listJournal(ACTOR),
    artifactRows: cluster.get(ACTOR, "PerconaServerMySQLBackup", "src", backupName("op-1"))?.rows ?? [],
    artifactBytes: cluster.get(ACTOR, "PerconaServerMySQLBackup", "src", backupName("op-1"))?.artifactBytes ?? "",
    keys: {
      approval: keys.trusted.approval,
      execution: { keyId: keys.execution.keyId, publicKeyPem: keys.execution.publicKeyPem },
    },
  };
}

function resignEvidence(
  evidence: NonNullable<ReturnType<typeof executeBackupProof>["record"]["evidence"]>,
  privateKeyPem: string,
) {
  const { signature: _ignored, ...unsigned } = evidence;
  return { ...unsigned, signature: signCanonical(privateKeyPem, unsigned) };
}

function rehash(events: ReturnType<ReturnType<typeof liveCluster>["listJournal"]>) {
  let previous: string | null = null;
  return events.map((event) => {
    const next = { ...event, previousEventDigest: previous };
    const { eventDigest: _ignored, ...unsigned } = next;
    const digest = eventDigest(unsigned);
    previous = digest;
    return { ...next, eventDigest: digest };
  });
}

function restoreReclose(
  journal: ReturnType<ReturnType<typeof liveCluster>["listJournal"]>,
  evidence: NonNullable<ReturnType<typeof executeBackupProof>["record"]["evidence"]>,
  privateKeyPem: string,
) {
  const first = rehash(journal);
  const store = first.find((event) => event.type === "EvidenceStoreWriteAhead");
  const resigned = resignEvidence(
    {
      ...evidence,
      journalRoot: first[0]!.eventDigest,
      journalHead: store?.previousEventDigest ?? evidence.journalHead,
    },
    privateKeyPem,
  );
  const digest = sha256Canonical(resigned);
  const second = rehash(
    first.map((event) => {
      if (event.type === "EvidenceStoreWriteAhead") {
        return {
          ...event,
          payload: {
            ...event.payload,
            evidenceDigest: digest,
            closedAtMs: String(resigned.timeline.closedAtMs),
            verdict: resigned.verdict,
            driftedDuring: resigned.driftedDuring ? "true" : "false",
          },
        };
      }
      if (event.type === "EvidenceClosed" || event.type === "FenceReleaseBlocked") {
        return {
          ...event,
          payload: {
            ...event.payload,
            evidenceDigest: digest,
            signature: resigned.signature,
            verdict: resigned.verdict,
            closedAtMs: String(resigned.timeline.closedAtMs),
          },
        };
      }
      return event;
    }),
  );
  return { evidence: resigned, journal: second };
}

test("offline verifier accepts closed evidence and rejects forged journal head", () => {
  const { result, request, keys, cluster } = run(1_000_000);
  assert.equal(result.ok, true);
  const evidence = result.record.evidence!;
  assert.equal(verifyOffline(offlineInput(request, evidence, cluster, keys)).ok, true);
  const forged = resignEvidence({ ...evidence, journalHead: "sha256:dead" }, keys.execution.privateKeyPem);
  assert.equal(verifyOffline(offlineInput(request, forged, cluster, keys)).ok, false);
});

test("offline verifier rejects six closure forgeries after resign", () => {
  const { result, request, keys, cluster } = run(1_000_000);
  const evidence = result.record.evidence!;
  const actorForged = resignEvidence({ ...evidence, actor: "forged-actor" }, keys.execution.privateKeyPem);
  assert.equal(verifyOffline(offlineInput(request, actorForged, cluster, keys)).ok, false);
  const uidForged = resignEvidence(
    { ...evidence, targetPre: { ...evidence.targetPre, uid: "forged-uid" } },
    keys.execution.privateKeyPem,
  );
  assert.equal(verifyOffline(offlineInput(request, uidForged, cluster, keys)).ok, false);
  const artifactForged = resignEvidence({ ...evidence, backupArtifactId: "forged-artifact" }, keys.execution.privateKeyPem);
  assert.equal(verifyOffline(offlineInput(request, artifactForged, cluster, keys)).ok, false);
  const oracleForged = resignEvidence(
    {
      ...evidence,
      oracle: { ...evidence.oracle, count: 999, orderedRowHash: "sha256:ffff", setBAbsent: false },
    },
    keys.execution.privateKeyPem,
  );
  assert.equal(verifyOffline(offlineInput(request, oracleForged, cluster, keys)).ok, false);
  const replacedApproval = {
    ...request,
    approval: signApproval(keys.approval, {
      approvalId: "apr-forged",
      planHash: request.planHash,
      approverSubject: "human-approver",
      issuedAt: 1_000_000,
      expiresAt: 1_000_000 + 15 * 60 * 1000,
      nonce: "nonce-forged",
    }),
  };
  assert.equal(verifyOffline(offlineInput(replacedApproval, evidence, cluster, keys)).ok, false);
  const rogue = generateEd25519("rogue-1");
  const rogueRequest = {
    ...request,
    approval: signApproval(rogue, {
      approvalId: request.approval.approvalId,
      planHash: request.planHash,
      approverSubject: "human-approver",
      issuedAt: request.approval.issuedAt,
      expiresAt: request.approval.expiresAt,
      nonce: request.approval.nonce,
    }),
  };
  const rogueEvidence = resignEvidence(
    {
      ...evidence,
      approval: rogueRequest.approval,
      trustIdentity: { ...evidence.trustIdentity, approvalKeyId: rogue.keyId, approvalRole: "observer" },
    },
    keys.execution.privateKeyPem,
  );
  const rogueVerify = verifyOffline({
    ...offlineInput(rogueRequest, rogueEvidence, cluster, keys),
    keys: {
      approval: {
        [rogue.keyId]: { publicKeyPem: rogue.publicKeyPem, subject: "human-approver", role: "observer" },
      },
      execution: { keyId: keys.execution.keyId, publicKeyPem: keys.execution.publicKeyPem },
    },
  });
  assert.equal(rogueVerify.ok, false);
  const alienJournal = cluster.listJournal(ACTOR).map((event) => ({ ...event, operationId: "op-other" }));
  assert.equal(
    verifyOffline({ ...offlineInput(request, evidence, cluster, keys), journal: alienJournal }).ok,
    false,
  );
  const closedTamper = cluster.listJournal(ACTOR).map((event) =>
    event.type === "EvidenceClosed" ? { ...event, payload: { ...event.payload, evidenceDigest: "sha256:dead" } } : event,
  );
  assert.equal(verifyOffline({ ...offlineInput(request, evidence, cluster, keys), journal: closedTamper }).ok, false);
});

test("offline verifier rejects resign-and-reclose field forgeries", () => {
  const { result, request, keys, cluster } = run(1_000_000);
  const evidence = result.record.evidence!;
  const journal = cluster.listJournal(ACTOR);
  const cases = [
    { ...evidence, facts: { ...evidence.facts, target: { ...evidence.facts.target, uid: "forged-uid" } } },
    { ...evidence, effects: { ...evidence.effects, backup: { ...evidence.effects.backup, uid: "forged-backup" } } },
    { ...evidence, timeline: { ...evidence.timeline, closedAtMs: evidence.timeline.deadlineMs + 1 } },
    { ...evidence, pins: evidence.pins.map((pin, index) => (index === 0 ? { ...pin, digest: "forged" } : pin)) },
    {
      ...evidence,
      trustIdentity: {
        ...evidence.trustIdentity,
        approvalKeyId: "forged-key",
        approvalSubject: "forged-subject",
        approvalPolicyVersion: "forged-policy",
      },
    },
    { ...evidence, observedSchemaDigest: "sha256:forged-schema" },
    { ...evidence, artifactDigest: "sha256:forged-artifact" },
    { ...evidence, targetPost: { ...evidence.targetPost, uid: "forged-post" } },
    { ...evidence, factsSnapshotId: "forged-facts" },
    { ...evidence, targetPost: { ...evidence.targetPost, generation: 99, specDigest: "sha256:forged" } },
    {
      ...evidence,
      effects: {
        backup: { ...evidence.effects.backup, kind: "Secret", namespace: "other", name: "x", generation: 9 },
        restoreCluster: { ...evidence.effects.restoreCluster, kind: "Secret", namespace: "other", name: "y", generation: 9 },
        restore: { ...evidence.effects.restore, kind: "Secret", namespace: "other", name: "z", generation: 9 },
      },
    },
    { ...evidence, oracle: { ...evidence.oracle, primaryKeyMin: 50 } },
    { ...evidence, intent: { ...evidence.intent, operationId: "op-x", planHash: "sha256:x", factsDigest: "sha256:y" } },
    {
      ...evidence,
      facts: { ...evidence.facts, targetNamespaceUid: "ns-forged", restoreNamespaceUid: "ns-forged" },
    },
    { ...evidence, verdict: "FORGED" as typeof evidence.verdict },
    { ...evidence, verdict: "FENCE_RELEASE_BLOCKED" as typeof evidence.verdict, driftedDuring: false },
  ];
  for (const forged of cases) {
    const closed = restoreReclose(journal, forged, keys.execution.privateKeyPem);
    assert.equal(
      verifyOffline({ ...offlineInput(request, closed.evidence, cluster, keys), journal: closed.journal }).ok,
      false,
    );
  }
});

test("first journal event rejects unknown fields and rewritten intent clock", () => {
  const { result, request, keys, cluster } = run(1_000_000);
  const events = cluster.listJournal(ACTOR);
  assert.throws(() => admitJournalEvent({ ...events[0], extra: true }), /SCHEMA/);
  const startedAtMs = Number(events[0]!.payload.startedAtMs);
  const forgedIntent = {
    ...events[0]!,
    payload: {
      ...events[0]!.payload,
      startedAtMs: String(startedAtMs),
      deadlineMs: String(startedAtMs + 3_600_000),
    },
  };
  let previous: string | null = null;
  const rewritten = [forgedIntent, ...events.slice(1)].map((event) => {
    const next = { ...event, previousEventDigest: previous };
    const { eventDigest: _ignored, ...unsigned } = next;
    const digest = eventDigest(unsigned);
    previous = digest;
    return { ...next, eventDigest: digest };
  });
  const evidence = result.record.evidence!;
  const closed = restoreReclose(
    rewritten,
    {
      ...evidence,
      intent: { ...evidence.intent, deadlineMs: startedAtMs + 3_600_000 },
      timeline: { ...evidence.timeline, deadlineMs: startedAtMs + 3_600_000 },
    },
    keys.execution.privateKeyPem,
  );
  assert.equal(
    verifyOffline({ ...offlineInput(request, closed.evidence, cluster, keys), journal: closed.journal }).ok,
    false,
  );
});

test("two hour approval TTL is BLOCKED", () => {
  const built = makeRequest(1_000_000);
  const long = {
    ...built.request,
    approval: signApproval(built.keys.approval, {
      approvalId: "apr-long",
      planHash: built.request.planHash,
      approverSubject: "human-approver",
      issuedAt: 1_000_000,
      expiresAt: 1_000_000 + 2 * 60 * 60 * 1000,
      nonce: "nonce-long",
    }),
  };
  const result = executeBackupProof({
    request: long,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster: liveCluster(),
    keys: built.keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(result.denial, "BLOCKED");
});

test("fence release blocked and drift emit signed failure evidence", () => {
  const blockedCluster = liveCluster();
  blockedCluster.failFenceRelease = true;
  const blockedKeys = makeKeys();
  const blocked = run(1_000_000, { cluster: blockedCluster, keys: blockedKeys });
  assert.equal(blocked.result.denial, "FENCE_RELEASE_BLOCKED");
  assert.equal(blocked.result.record.evidence?.verdict, "FENCE_RELEASE_BLOCKED");
  const blockedOffline = verifyOffline(
    offlineInput(blocked.request, blocked.result.record.evidence!, blockedCluster, blockedKeys),
  );
  assert.equal(blockedOffline.ok, true);
  assert.equal(blockedOffline.reason, "FENCE_RELEASE_BLOCKED");
  const driftCluster = liveCluster();
  driftCluster.forceDriftAfterBackup = true;
  const driftKeys = makeKeys();
  const drift = run(1_000_000, { cluster: driftCluster, keys: driftKeys });
  assert.equal(drift.result.denial, "TARGET_DRIFTED_DURING_OPERATION");
  assert.equal(drift.result.record.evidence?.verdict, "TARGET_DRIFTED_DURING_OPERATION");
  assert.equal(verifyOffline(offlineInput(drift.request, drift.result.record.evidence!, driftCluster, driftKeys)).ok, true);
});

test("XtraBackup SPDX pin is present and pins match frozen set", () => {
  assert.ok(STARTUP_PINS.some((pin) => pin.id === "percona-xtrabackup-spdx" && pin.admission === "PENDING"));
  const { result } = run(1_000_000);
  assert.equal(result.record.evidence?.pins.length, STARTUP_PINS.length);
  assert.equal(result.record.evidence?.pinsDigest, sha256Canonical(STARTUP_PINS));
});

test("journal payload forgeries fail after full rehash restore and reclose", () => {
  const { result, request, keys, cluster } = run(1_000_000);
  const evidence = result.record.evidence!;
  const journal = cluster.listJournal(ACTOR);
  const cases: Array<{ type: string; key: string; value: string }> = [
    { type: "FenceWriteAhead", key: "fence", value: "forged-fence" },
    { type: "FenceSet", key: "fence", value: "forged-fence" },
    { type: "BackupWriteAhead", key: "name", value: "forged-backup" },
    { type: "SetBWriteAhead", key: "name", value: "forged-setb" },
    { type: "SetBApplied", key: "digest", value: "sha256:forged-setb" },
    { type: "SetBApplied", key: "count", value: "1000" },
    { type: "RestoreWriteAhead", key: "name", value: "forged-restore" },
    { type: "RestoreClusterCreated", key: "name", value: "forged-cluster" },
    { type: "RestoreCreated", key: "name", value: "forged-restore" },
    { type: "FenceReleaseWriteAhead", key: "fence", value: "forged-fence" },
  ];
  for (const item of cases) {
    const patched = journal.map((event) =>
      event.type === item.type ? { ...event, payload: { ...event.payload, [item.key]: item.value } } : event,
    );
    const closed = restoreReclose(patched, evidence, keys.execution.privateKeyPem);
    assert.equal(
      verifyOffline({ ...offlineInput(request, closed.evidence, cluster, keys), journal: closed.journal }).ok,
      false,
    );
  }
});

test("caller cannot choose a future start and expired intent story is rejected", () => {
  const future = run(1_000_000, { startedAtMs: 1_000_000 + 3_600_000 });
  assert.equal(future.result.denial, "BLOCKED");
  const { result, request, keys, cluster } = run(1_000_000);
  const evidence = result.record.evidence!;
  const events = cluster.listJournal(ACTOR);
  const expiredAt = request.approval.expiresAt + 1;
  const forgedIntent = {
    ...events[0]!,
    payload: {
      ...events[0]!.payload,
      startedAtMs: String(expiredAt),
      deadlineMs: String(expiredAt + request.plan.timeoutMs),
    },
  };
  const closed = restoreReclose(
    [forgedIntent, ...events.slice(1)],
    {
      ...evidence,
      intent: { ...evidence.intent, startedAtMs: expiredAt, deadlineMs: expiredAt + request.plan.timeoutMs },
      timeline: { ...evidence.timeline, startedAtMs: expiredAt, deadlineMs: expiredAt + request.plan.timeoutMs, closedAtMs: expiredAt + 1 },
    },
    keys.execution.privateKeyPem,
  );
  assert.equal(
    verifyOffline({ ...offlineInput(request, closed.evidence, cluster, keys), journal: closed.journal }).ok,
    false,
  );
});

test("F1-F5 official bytes stay separate from backup artifact digest", () => {
  const { result, request, cluster } = run(1_000_000);
  const evidence = result.record.evidence!;
  const backup = cluster.get(ACTOR, "PerconaServerMySQLBackup", "src", backupName("op-1"));
  assert.equal(SCHEMA_DIGEST, sha256Utf8(SCHEMA_LITERAL));
  assert.equal(SCHEMA_DIGEST, "sha256:cb48a668ce687ec5a22a9f15e98643ffac61349e74b628e8702b5716c9e4a2a5");
  assert.equal(evidence.oracle.schemaDigest, SCHEMA_DIGEST);
  assert.equal(evidence.observedSchemaDigest, SCHEMA_DIGEST);
  assert.equal(evidence.oracle.primaryKeyMin, 1);
  assert.equal(evidence.oracle.primaryKeyMax, 1000);
  assert.notEqual(evidence.artifactDigest, sha256Canonical(setA()));
  assert.equal(evidence.artifactDigest, artifactDigestOf(backup?.artifactBytes ?? ""));
  assert.equal(evidence.backupArtifactDigest, artifactDigestOf(encodeBackupArtifact(request.plan.artifactDestination, setA())));
});

test("evidence schema requires intent facts effects timeline pins and trust", () => {
  const { result, cluster } = run(1_000_000);
  const evidence = result.record.evidence!;
  assert.ok(evidence.intent.factsDigest);
  assert.ok(evidence.facts.digest);
  assert.ok(evidence.effects.backup.uid);
  assert.ok(evidence.effects.restoreCluster.uid);
  assert.ok(evidence.effects.restore.uid);
  assert.ok(evidence.timeline.deadlineMs > evidence.timeline.startedAtMs);
  assert.ok(evidence.pins.length > 0);
  assert.ok(evidence.trustIdentity.executionKeyId);
  const closed = cluster.listJournal(ACTOR).find((event) => event.type === "EvidenceClosed");
  assert.equal(closed?.payload.evidence, undefined);
  assert.equal(closed?.payload.evidenceDigest, sha256Canonical(evidence));
  assert.equal(closed?.payload.signature, evidence.signature);
  assert.throws(() => admitEvidence({ ...evidence, extra: true }), /SCHEMA/);
  const { intent: _intent, ...missing } = evidence;
  assert.throws(() => admitEvidence(missing), /SCHEMA/);
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

test("silent no-op wrong-B and partial-B writes are ORACLE_FAILED", () => {
  for (const setBMode of ["noop", "wrong", "partial"] as const) {
    const cluster = liveCluster();
    cluster.setBMode = setBMode;
    const { result } = run(1_000_000, { cluster });
    assert.equal(result.ok, false);
    assert.equal(result.denial, "ORACLE_FAILED");
    const source = cluster.snapshotRows("src", "source-db") ?? [];
    if (setBMode === "noop") {
      assert.equal(source.length, 1000);
      assert.equal(source.every((row) => row.id <= 1000), true);
    }
    if (setBMode === "partial") {
      assert.ok(source.length < 1100);
    }
    if (setBMode === "wrong") {
      assert.equal(source.length, 1100);
      assert.equal(source.find((row) => row.id === 1001)?.payload, "0".repeat(64));
    }
  }
});

test("approval valid at entry but expired at consume is UNAPPROVED live and offline", () => {
  const keys = makeKeys();
  const built = makeRequest(1_000_000, keys);
  const request = {
    ...built.request,
    approval: signApproval(keys.approval, {
      approvalId: built.request.approval.approvalId,
      planHash: built.request.planHash,
      approverSubject: "human-approver",
      issuedAt: 1_000_000,
      expiresAt: 1_000_300,
      nonce: built.request.approval.nonce,
    }),
  };
  const cluster = liveCluster();
  cluster.apiElapsedMs = 100;
  const live = executeBackupProof({
    request,
    agent: SAFE_AGENT,
    actor: ACTOR,
    cluster,
    keys: keys.trusted,
    nowMs: 1_000_000,
  });
  assert.equal(live.ok, false);
  assert.equal(live.denial, "UNAPPROVED");
  assert.equal(
    cluster.listJournal(ACTOR).some((event) => event.type === "ApprovalConsumed"),
    false,
  );
  const good = run(1_000_000);
  const evidence = good.result.record.evidence!;
  const events = good.cluster.listJournal(ACTOR);
  const closed = restoreReclose(
    events.map((event) =>
      event.type === "ApprovalConsumed"
        ? { ...event, payload: { ...event.payload, consumedAt: String(good.request.approval.expiresAt + 200) } }
        : event,
    ),
    evidence,
    good.keys.execution.privateKeyPem,
  );
  const offline = verifyOffline({
    ...offlineInput(good.request, closed.evidence, good.cluster, good.keys),
    journal: closed.journal,
  });
  assert.equal(offline.ok, false);
  assert.equal(offline.reason, "UNAPPROVED");
});

test("store or terminal past deadline is TIMEOUT live and offline", () => {
  const cluster = liveCluster();
  cluster.apiElapsedMs = 1100;
  const keys = makeKeys();
  const first = run(1_000_000, { cluster, keys });
  assert.equal(first.result.ok, false);
  assert.equal(first.result.denial, "TIMEOUT");
  assert.equal(
    cluster.listJournal(ACTOR).some((event) => event.type === "EvidenceClosed" || event.type === "FenceReleaseBlocked"),
    false,
  );
  const second = run(1_000_000, { cluster, keys });
  assert.equal(second.result.ok, false);
  assert.equal(second.result.denial, "TIMEOUT");
  if (first.result.record.evidence) {
    assert.equal(verifyOffline(offlineInput(first.request, first.result.record.evidence, cluster, keys)).ok, false);
  }
  const good = run(1_000_000);
  const evidence = good.result.record.evidence!;
  const closed = restoreReclose(
    good.cluster.listJournal(ACTOR),
    { ...evidence, timeline: { ...evidence.timeline, closedAtMs: evidence.timeline.deadlineMs + 1 } },
    good.keys.execution.privateKeyPem,
  );
  const offline = verifyOffline({
    ...offlineInput(good.request, closed.evidence, good.cluster, good.keys),
    journal: closed.journal,
  });
  assert.equal(offline.ok, false);
});

test("lease renew failure is LEASE_CONTENDED", () => {
  const cluster = liveCluster();
  cluster.failRenew = true;
  const keys = makeKeys();
  const { result } = run(1_000_000, { cluster, keys });
  assert.equal(result.denial, "LEASE_CONTENDED");
});
