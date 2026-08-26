import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { scanCommentLines } from "../harness/src/scan-comments.ts";

const ROOT = process.argv[2] ? process.argv[2] : process.cwd();
const ROOTS = [join(ROOT, "harness", "src"), join(ROOT, "harness", "test"), join(ROOT, "scripts")];

function collect(dir: string, out: string[]): void {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    return;
  }
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collect(path, out);
    } else if (path.endsWith(".ts")) {
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
    for (const line of scanCommentLines(text)) {
      console.log(`${relative(ROOT, file)}:${line}: comment trivia`);
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
