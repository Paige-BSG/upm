import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type InvariantCatalog = {
  schemaVersion: string;
  sourceMessages: string[];
  invariants: Record<string, string>;
};

const CATALOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "../spec/phase1-v0.2-invariants.json");

export function loadInvariantCatalog(): InvariantCatalog {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as InvariantCatalog;
}

export function requireInvariant(id: keyof InvariantCatalog["invariants"] | string): string {
  const catalog = loadInvariantCatalog();
  const text = catalog.invariants[id];
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`DANGLING_INVARIANT:${id}`);
  }
  return id;
}
