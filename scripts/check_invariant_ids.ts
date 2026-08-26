import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] ? process.argv[2] : process.cwd();
const catalog = JSON.parse(
  readFileSync(join(ROOT, "harness", "spec", "phase1-v0.2-invariants.json"), "utf8"),
) as { invariants: Record<string, string> };
const ids = Object.keys(catalog.invariants);

function collect(dir: string, out: string[]): void {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    return;
  }
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collect(path, out);
    } else if (path.endsWith(".ts") || path.endsWith(".json")) {
      out.push(path);
    }
  }
}

function main(): number {
  const files: string[] = [];
  collect(join(ROOT, "harness"), files);
  collect(join(ROOT, "scripts"), files);
  const blob = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const used = new Set<string>(blob.match(/SPEC-P1-[A-Z0-9-]+/g) ?? []);
  let failures = 0;
  for (const id of ids) {
    if (!used.has(id)) {
      console.log(`UNUSED_INVARIANT:${id}`);
      failures += 1;
    }
  }
  for (const id of used) {
    if (catalog.invariants[id] === undefined) {
      console.log(`DANGLING_INVARIANT:${id}`);
      failures += 1;
    }
  }
  if (failures > 0) {
    console.log(`FAIL ${failures}`);
    return 1;
  }
  console.log("PASS");
  return 0;
}

process.exit(main());
