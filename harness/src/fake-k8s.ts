import { setA, setB, FIXED_SCHEMA, type OracleRow } from "./oracle.ts";
import { actorMay } from "./rbac.ts";
import { sha256Canonical } from "./rfc8785.ts";
import {
  AdapterConflictError,
  AdapterFailureError,
  AdapterTimeoutError,
  AdapterUnauthorizedError,
  CONTROL_NAMESPACE,
  FENCE_ANNOTATION,
  LEASE_DURATION_MS,
  SPEC_P1_JOURNAL_APPEND_ONLY,
  SPEC_P1_JOURNAL_CHAIN,
  SPEC_P1_LEASE_NOT_SECURITY,
  WRITER_LEASE_NAME,
  type Actor,
  type EvidenceManifest,
  type JournalEvent,
  type PerconaKind,
  type TargetRef,
} from "./types.ts";

void SPEC_P1_JOURNAL_CHAIN;
void SPEC_P1_JOURNAL_APPEND_ONLY;
void SPEC_P1_LEASE_NOT_SECURITY;

export type FakeMode = "ok" | "fail" | "timeout" | "unauthorized";

export type CrObject = {
  kind: PerconaKind | "ConfigMap" | "Lease";
  namespace: string;
  name: string;
  uid: string;
  generation: number;
  resourceVersion: string;
  immutable?: boolean;
  annotations: Record<string, string>;
  specDigest: string;
  spec: Record<string, string>;
  rows?: OracleRow[];
  observedSchema?: Record<string, string>;
  backupStatus?: string;
  artifactId?: string;
  artifactDigest?: string;
  event?: JournalEvent;
  leaseHolder?: string;
  leaseUntil?: number;
};

function key(namespace: string, kind: string, name: string): string {
  return `${namespace}/${kind}/${name}`;
}

export class FakeK8s {
  mode: FakeMode = "ok";
  nowMs = 0;
  apiElapsedMs = 0;
  forceDriftAfterBackup = false;
  failFenceRelease = false;
  failRenew = false;
  clusterUid = "cluster-uid-1";
  namespaceUids: Record<string, string> = { src: "ns-src", dst: "ns-dst", "upm-system": "ns-upm" };
  readonly objects = new Map<string, CrObject>();
  readonly evidence = new Map<string, EvidenceManifest>();
  private versions = 1;

  private nextVersion(): string {
    this.versions += 1;
    return String(this.versions);
  }

  private guard(): void {
    this.nowMs += this.apiElapsedMs;
    if (this.mode === "fail") {
      throw new AdapterFailureError("ADAPTER_FAILURE");
    }
    if (this.mode === "timeout") {
      throw new AdapterTimeoutError("TIMEOUT");
    }
    if (this.mode === "unauthorized") {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
  }

  seedMysql(target: TargetRef, rows: OracleRow[] = setA()): CrObject {
    const object: CrObject = {
      kind: "PerconaServerMySQL",
      namespace: target.namespace,
      name: target.name,
      uid: target.uid,
      generation: target.generation,
      resourceVersion: target.resourceVersion,
      annotations: {},
      specDigest: target.specDigest,
      spec: { clusterType: "group-replication" },
      rows: rows.map((row) => ({ ...row })),
      observedSchema: { ...FIXED_SCHEMA },
    };
    this.objects.set(key(target.namespace, object.kind, object.name), object);
    return object;
  }

  get(actor: Actor, kind: CrObject["kind"], namespace: string, name: string): CrObject | undefined {
    if (!actorMay(actor, namespace, kind, "get")) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    return this.objects.get(key(namespace, kind, name));
  }

  create(actor: Actor, object: CrObject): CrObject {
    this.guard();
    if (!actorMay(actor, object.namespace, object.kind, "create")) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    const existing = this.objects.get(key(object.namespace, object.kind, object.name));
    if (existing) {
      throw new AdapterConflictError("AlreadyExists");
    }
    const stored: CrObject = {
      ...object,
      annotations: { ...object.annotations },
      spec: { ...object.spec },
      resourceVersion: object.resourceVersion || this.nextVersion(),
    };
    if (object.rows) {
      stored.rows = object.rows.map((row) => ({ ...row }));
    }
    if (object.observedSchema) {
      stored.observedSchema = { ...object.observedSchema };
    }
    this.objects.set(key(stored.namespace, stored.kind, stored.name), stored);
    return stored;
  }

  patchFence(actor: Actor, target: TargetRef, fence: string): CrObject {
    this.guard();
    if (!actorMay(actor, target.namespace, "PerconaServerMySQL", "patch")) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    const current = this.objects.get(key(target.namespace, "PerconaServerMySQL", target.name));
    if (!current) {
      throw new AdapterFailureError("MISSING");
    }
    if (current.resourceVersion !== target.resourceVersion) {
      throw new AdapterConflictError("RESOURCE_VERSION");
    }
    if (current.annotations[FENCE_ANNOTATION] !== undefined) {
      throw new AdapterConflictError("FENCE_PRESENT");
    }
    current.annotations[FENCE_ANNOTATION] = fence;
    current.resourceVersion = this.nextVersion();
    return current;
  }

  releaseFence(actor: Actor, target: TargetRef, fence: string): CrObject {
    this.guard();
    if (!actorMay(actor, target.namespace, "PerconaServerMySQL", "patch")) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    if (this.failFenceRelease) {
      throw new AdapterConflictError("FENCE_RELEASE_BLOCKED");
    }
    const current = this.objects.get(key(target.namespace, "PerconaServerMySQL", target.name));
    if (!current) {
      throw new AdapterFailureError("MISSING");
    }
    if (current.annotations[FENCE_ANNOTATION] !== fence) {
      throw new AdapterConflictError("FENCE_RELEASE_BLOCKED");
    }
    delete current.annotations[FENCE_ANNOTATION];
    current.resourceVersion = this.nextVersion();
    return current;
  }

  mutateTarget(target: TargetRef): void {
    const current = this.objects.get(key(target.namespace, "PerconaServerMySQL", target.name));
    if (!current) {
      throw new AdapterFailureError("MISSING");
    }
    current.generation += 1;
    current.specDigest = sha256Canonical({ drifted: true, generation: current.generation });
    current.resourceVersion = this.nextVersion();
  }

  writeSetB(target: TargetRef): void {
    const current = this.objects.get(key(target.namespace, "PerconaServerMySQL", target.name));
    if (!current || !current.rows) {
      throw new AdapterFailureError("MISSING");
    }
    const byId = new Map(current.rows.map((row) => [row.id, { ...row }]));
    for (const row of setB()) {
      byId.set(row.id, { ...row });
    }
    current.rows = [...byId.values()].sort((left, right) => left.id - right.id);
    current.resourceVersion = this.nextVersion();
  }

  putEvidence(digest: string, manifest: EvidenceManifest): void {
    this.evidence.set(digest, manifest);
  }

  getEvidence(digest: string): EvidenceManifest | undefined {
    return this.evidence.get(digest);
  }

  snapshotRows(namespace: string, name: string): OracleRow[] | undefined {
    const current = this.objects.get(key(namespace, "PerconaServerMySQL", name));
    if (!current?.rows) {
      return undefined;
    }
    return current.rows.map((row) => ({ ...row }));
  }

  renewLease(actor: Actor, holder: string): void {
    this.guard();
    if (!actorMay(actor, CONTROL_NAMESPACE, "Lease", "update")) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    if (this.failRenew) {
      throw new Error("LEASE_CONTENDED");
    }
    const existing = this.objects.get(key(CONTROL_NAMESPACE, "Lease", WRITER_LEASE_NAME));
    if (!existing || existing.leaseHolder !== holder) {
      throw new Error("LEASE_CONTENDED");
    }
    existing.leaseUntil = this.nowMs + LEASE_DURATION_MS;
  }

  acquireLease(actor: Actor, holder: string): boolean {
    void SPEC_P1_LEASE_NOT_SECURITY;
    this.guard();
    if (!actorMay(actor, CONTROL_NAMESPACE, "Lease", "create") && !actorMay(actor, CONTROL_NAMESPACE, "Lease", "update")) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    const existing = this.objects.get(key(CONTROL_NAMESPACE, "Lease", WRITER_LEASE_NAME));
    if (existing && existing.leaseHolder && existing.leaseHolder !== holder && (existing.leaseUntil ?? 0) > this.nowMs) {
      return false;
    }
    const lease: CrObject = {
      kind: "Lease",
      namespace: CONTROL_NAMESPACE,
      name: WRITER_LEASE_NAME,
      uid: "lease-1",
      generation: 1,
      resourceVersion: this.nextVersion(),
      annotations: {},
      specDigest: "lease",
      spec: { holder },
      leaseHolder: holder,
      leaseUntil: this.nowMs + LEASE_DURATION_MS,
    };
    this.objects.set(key(CONTROL_NAMESPACE, "Lease", WRITER_LEASE_NAME), lease);
    return true;
  }

  leaseLive(holder: string): boolean {
    const existing = this.objects.get(key(CONTROL_NAMESPACE, "Lease", WRITER_LEASE_NAME));
    return existing?.leaseHolder === holder && (existing.leaseUntil ?? 0) > this.nowMs;
  }

  expireLease(): void {
    const existing = this.objects.get(key(CONTROL_NAMESPACE, "Lease", WRITER_LEASE_NAME));
    if (existing) {
      existing.leaseUntil = this.nowMs;
    }
  }

  listJournal(actor: Actor): JournalEvent[] {
    this.guard();
    if (!actorMay(actor, CONTROL_NAMESPACE, "ConfigMap", "list")) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    return [...this.objects.values()]
      .filter((object) => object.kind === "ConfigMap" && object.event)
      .map((object) => object.event as JournalEvent)
      .sort((left, right) => left.sequence - right.sequence);
  }
}

export function readTarget(object: CrObject): TargetRef {
  return {
    namespace: object.namespace,
    name: object.name,
    uid: object.uid,
    generation: object.generation,
    resourceVersion: object.resourceVersion,
    specDigest: object.specDigest,
  };
}
