import { createHash } from "node:crypto";
import { sha256Canonical } from "./rfc8785.ts";
import { SPEC_P1_ORACLE_AB } from "./types.ts";

void SPEC_P1_ORACLE_AB;

export type OracleRow = { id: number; payload: string };

export function rowPayload(id: number): string {
  return createHash("sha256").update(`backup_proof_items:${id}`, "utf8").digest("hex");
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

export function schemaDigest(): string {
  return sha256Canonical({
    table: "backup_proof_items",
    columns: [
      { name: "id", type: "BIGINT", primaryKey: true },
      { name: "payload", type: "VARCHAR(64)", nullable: false },
    ],
  });
}

export function evaluateOracle(rows: OracleRow[]): {
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
  const pass =
    rows.length === 1000 &&
    ids[0] === 1 &&
    ids[999] === 1000 &&
    ids.every((id, index) => id === index + 1) &&
    orderedRowHash(rows) === orderedRowHash(expected) &&
    setBAbsent;
  return {
    schemaDigest: schemaDigest(),
    count: rows.length,
    primaryKeyMin: ids[0] ?? 0,
    primaryKeyMax: ids[ids.length - 1] ?? 0,
    orderedRowHash: orderedRowHash(rows),
    setBAbsent,
    pass,
  };
}
