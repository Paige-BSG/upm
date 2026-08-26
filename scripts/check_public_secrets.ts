import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.argv[2] ? process.argv[2] : process.cwd();
const ROOTS = [join(ROOT, "harness"), join(ROOT, "scripts")];
const FORBIDDEN = [/BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{20,}/, /password\s*=\s*['\"][^'\"]+['\"]/i];

function collect(dir: string, out: string[]): void {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    return;
  }
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collect(path, out);
    } else {
      out.push(path);
    }
  }
}

function main(): number {
  const files: string[] = [];
  for (const dir of ROOTS) {
    collect(dir, files);
  }
  let failures = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) {
        console.log(`${relative(ROOT, file)}: secret pattern`);
        failures += 1;
      }
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
