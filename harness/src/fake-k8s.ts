import { setA, setB, type OracleRow } from "./oracle.ts";
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
  forceDriftAfterBackup = false;
  readonly objects = new Map<string, CrObject>();
  private versions = 1;

  private nextVersion(): string {
    this.versions += 1;
    return String(this.versions);
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
    };
    this.objects.set(key(target.namespace, object.kind, object.name), object);
    return object;
  }

  get(actor: Actor, kind: CrObject["kind"], namespace: string, name: string): CrObject | undefined {
    if (kind !== "ConfigMap" && kind !== "Lease" && !actorMay(actor, namespace, kind)) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    return this.objects.get(key(namespace, kind, name));
  }

  create(actor: Actor, object: CrObject): CrObject {
    this.guard();
    if (object.kind !== "ConfigMap" && object.kind !== "Lease" && !actorMay(actor, object.namespace, object.kind)) {
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
      rows: object.rows?.map((row) => ({ ...row })),
      resourceVersion: object.resourceVersion || this.nextVersion(),
    };
    this.objects.set(key(stored.namespace, stored.kind, stored.name), stored);
    return stored;
  }

  replace(object: CrObject): CrObject {
    this.guard();
    const current = this.objects.get(key(object.namespace, object.kind, object.name));
    if (!current) {
      throw new AdapterFailureError("MISSING");
    }
    if (current.immutable) {
      throw new AdapterConflictError("IMMUTABLE");
    }
    const stored: CrObject = {
      ...object,
      annotations: { ...object.annotations },
      spec: { ...object.spec },
      rows: object.rows?.map((row) => ({ ...row })),
      resourceVersion: this.nextVersion(),
    };
    this.objects.set(key(stored.namespace, stored.kind, stored.name), stored);
    return stored;
  }

  patchFence(actor: Actor, target: TargetRef, fence: string): CrObject {
    this.guard();
    if (!actorMay(actor, target.namespace, "PerconaServerMySQL")) {
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
    current.rows = [...current.rows, ...setB()];
    current.resourceVersion = this.nextVersion();
  }

  snapshotRows(namespace: string, name: string): OracleRow[] {
    const current = this.objects.get(key(namespace, "PerconaServerMySQL", name));
    return current?.rows?.map((row) => ({ ...row })) ?? [];
  }

  acquireLease(holder: string): boolean {
    void SPEC_P1_LEASE_NOT_SECURITY;
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

  listJournal(): JournalEvent[] {
    return [...this.objects.values()]
      .filter((object) => object.kind === "ConfigMap" && object.event)
      .map((object) => object.event as JournalEvent)
      .sort((left, right) => left.sequence - right.sequence);
  }

  private guard(): void {
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
