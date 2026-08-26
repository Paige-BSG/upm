import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkInvariantUsage } from "../harness/src/scan-invariants.ts";

const ROOT = process.argv[2] ? process.argv[2] : process.cwd();
const catalogPath = join(ROOT, "harness", "spec", "phase1-v0.2-invariants.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as { invariants: Record<string, string> };

function collect(dir: string, out: string[]): void {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    return;
  }
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collect(path, out);
    } else if (path.endsWith(".ts")) {
      out.push(path);
    }
  }
}

function main(): number {
  const files: string[] = [];
  collect(join(ROOT, "harness", "src"), files);
  collect(join(ROOT, "harness", "test"), files);
  collect(join(ROOT, "scripts"), files);
  const blob = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const { unused, dangling } = checkInvariantUsage(catalog.invariants, blob);
  let failures = 0;
  for (const id of unused) {
    console.log(`UNUSED_INVARIANT:${id}`);
    failures += 1;
  }
  for (const id of dangling) {
    console.log(`DANGLING_INVARIANT:${id}`);
    failures += 1;
  }
  if (failures > 0) {
    console.log(`FAIL ${failures}`);
    return 1;
  }
  console.log("PASS");
  return 0;
}

process.exit(main());
