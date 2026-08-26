import { actorMay } from "./rbac.ts";
import {
  AdapterFailureError,
  AdapterTimeoutError,
  AdapterUnauthorizedError,
  type AdapterActor,
  type K8sAdapter,
  type K8sObject,
  type PerconaKind,
} from "./types.ts";

export type FakeK8sMode = "ok" | "fail" | "timeout" | "unauthorized";

function objectKey(kind: PerconaKind, namespace: string, name: string): string {
  return `${namespace}/${kind}/${name}`;
}

export class FakeK8s implements K8sAdapter {
  mode: FakeK8sMode = "ok";
  readonly objects = new Map<string, K8sObject>();

  seedCluster(namespace: string, name: string, dataDigest: string): void {
    this.objects.set(objectKey("PerconaServerMySQL", namespace, name), {
      kind: "PerconaServerMySQL",
      namespace,
      name,
      spec: { clusterType: "group-replication" },
      dataDigest,
    });
  }

  writeClusterData(namespace: string, name: string, dataDigest: string): void {
    const current = this.objects.get(objectKey("PerconaServerMySQL", namespace, name));
    if (!current) {
      throw new AdapterFailureError("CLUSTER_MISSING");
    }
    current.dataDigest = dataDigest;
  }

  create(actor: AdapterActor, object: K8sObject): K8sObject {
    if (this.mode === "unauthorized") {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    if (this.mode === "timeout") {
      throw new AdapterTimeoutError("TIMEOUT");
    }
    if (this.mode === "fail") {
      throw new AdapterFailureError("ADAPTER_FAILURE");
    }
    if (!actorMay(actor, object.namespace, object.kind)) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    const stored: K8sObject = {
      ...object,
      spec: { ...object.spec },
    };
    if (object.kind === "PerconaServerMySQLBackup") {
      const source = this.objects.get(
        objectKey("PerconaServerMySQL", object.namespace, String(object.spec.mysqlName)),
      );
      if (source?.dataDigest !== undefined) {
        stored.dataDigest = source.dataDigest;
      }
    }
    if (object.kind === "PerconaServerMySQLRestore") {
      const backupNs = String(object.spec.backupNamespace);
      const backupName = String(object.spec.backupName);
      const backup = this.objects.get(
        objectKey("PerconaServerMySQLBackup", backupNs, backupName),
      );
      if (backup?.dataDigest !== undefined) {
        stored.dataDigest = backup.dataDigest;
      }
      const restoreCluster: K8sObject = {
        kind: "PerconaServerMySQL",
        namespace: object.namespace,
        name: String(object.spec.restoreClusterName),
        spec: { clusterType: "group-replication", backupSource: backupName },
      };
      if (backup?.dataDigest !== undefined) {
        restoreCluster.dataDigest = backup.dataDigest;
      }
      this.objects.set(
        objectKey(restoreCluster.kind, restoreCluster.namespace, restoreCluster.name),
        restoreCluster,
      );
    }
    this.objects.set(objectKey(object.kind, object.namespace, object.name), stored);
    return stored;
  }

  get(
    actor: AdapterActor,
    kind: PerconaKind,
    namespace: string,
    name: string,
  ): K8sObject | undefined {
    if (!actorMay(actor, namespace, kind)) {
      throw new AdapterUnauthorizedError("UNAUTHORIZED");
    }
    return this.objects.get(objectKey(kind, namespace, name));
  }
}
