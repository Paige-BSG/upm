import { createHash } from "node:crypto";

export function operationHash(operationId: string): string {
  return createHash("sha256").update(operationId, "utf8").digest("hex").slice(0, 32);
}

export function journalName(operationId: string, sequence: number): string {
  return `upm-evt-${operationHash(operationId)}-${String(sequence).padStart(6, "0")}`;
}

export function backupName(operationId: string): string {
  return `upm-bp-${operationHash(operationId)}-backup`;
}

export function restoreName(operationId: string): string {
  return `upm-bp-${operationHash(operationId)}-restore`;
}

export function restoreClusterName(operationId: string): string {
  return `upm-bp-${operationHash(operationId)}-cluster`;
}
