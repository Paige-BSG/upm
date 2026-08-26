import { createHash } from "node:crypto";
import { sha256Canonical, sha256Utf8 } from "./rfc8785.ts";
import { SPEC_P1_ORACLE_AB, type ArtifactDestination } from "./types.ts";

void SPEC_P1_ORACLE_AB;

export type OracleRow = { id: number; payload: string };

export const SCHEMA_LITERAL =
  "CREATE TABLE backup_proof_items (id BIGINT PRIMARY KEY, payload VARCHAR(64) NOT NULL);";

export const SCHEMA_DIGEST = sha256Utf8(SCHEMA_LITERAL);

export const FIXED_SCHEMA = {
  table: "backup_proof_items",
  columns: "id BIGINT PRIMARY KEY,payload VARCHAR(64) NOT NULL",
} as const;

export function rowPayload(id: number): string {
  return createHash("sha256").update(String(id), "utf8").digest("hex");
}

export function setA(): OracleRow[] {
  return Array.from({ length: 1000 }, (_, index) => {
    const id = index + 1;
    return { id, payload: rowPayload(id) };
  });
}

export function setB(): OracleRow[] {
  return Array.from({ length: 100 }, (_, index) => {
    const id = 1001 + index;
    return { id, payload: rowPayload(id) };
  });
}

export function orderedRowHash(rows: OracleRow[]): string {
  return sha256Canonical([...rows].sort((left, right) => left.id - right.id));
}

export function encodeBackupArtifact(destination: ArtifactDestination, rows: OracleRow[]): string {
  return [
    "xtrabackup-backup-v1",
    sha256Canonical(destination),
    ...[...rows].sort((left, right) => left.id - right.id).map((row) => `${row.id}=${row.payload}`),
  ].join("\n");
}

export function artifactDigestOf(bytes: string): string {
  return sha256Utf8(bytes);
}

export function schemaMatchesFixed(observedSchema: Record<string, string> | undefined): boolean {
  if (!observedSchema) {
    return false;
  }
  return sha256Canonical(observedSchema) === sha256Canonical(FIXED_SCHEMA);
}

export function evaluateOracle(
  rows: OracleRow[],
  observedSchema: Record<string, string> | undefined,
): {
  schemaDigest: string;
  count: number;
  primaryKeyMin: number;
  primaryKeyMax: number;
  orderedRowHash: string;
  setBAbsent: boolean;
  pass: boolean;
} {
  const ids = rows.map((row) => row.id).sort((left, right) => left - right);
  const expected = setA();
  const setBAbsent = rows.every((row) => row.id <= 1000);
  const schemaOk = schemaMatchesFixed(observedSchema);
  const pass =
    schemaOk &&
    rows.length === 1000 &&
    ids[0] === 1 &&
    ids[999] === 1000 &&
    ids.every((id, index) => id === index + 1) &&
    orderedRowHash(rows) === orderedRowHash(expected) &&
    setBAbsent;
  return {
    schemaDigest: schemaOk ? SCHEMA_DIGEST : "",
    count: rows.length,
    primaryKeyMin: ids[0] ?? 0,
    primaryKeyMax: ids[ids.length - 1] ?? 0,
    orderedRowHash: orderedRowHash(rows),
    setBAbsent,
    pass,
  };
}
