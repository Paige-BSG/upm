import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

function scan(text: string): number[] {
  const bad: number[] = [];
  let i = 0;
  let line = 1;
  let inSq = false;
  let inDq = false;
  let inBt = false;
  let inLine = false;
  let inBlock = false;
  let escape = false;
  const first = text.split("\n")[0] ?? "";
  const shebangEnd = first.startsWith("#!") ? first.length + 1 : 0;
  while (i < text.length) {
    const ch = text[i]!;
    const nxt = text[i + 1] ?? "";
    if (i < shebangEnd) {
      if (ch === "\n") {
        line += 1;
      }
      i += 1;
      continue;
    }
    if (ch === "\n") {
      line += 1;
      inLine = false;
      escape = false;
      i += 1;
      continue;
    }
    if (inLine) {
      i += 1;
      continue;
    }
    if (inBlock) {
      if (ch === "*" && nxt === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSq || inDq || inBt) {
      const quote = inSq ? "'" : inDq ? '"' : "`";
      if (escape) {
        escape = false;
        i += 1;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        i += 1;
        continue;
      }
      if (ch === quote) {
        inSq = false;
        inDq = false;
        inBt = false;
      }
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSq = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDq = true;
      i += 1;
      continue;
    }
    if (ch === "`") {
      inBt = true;
      i += 1;
      continue;
    }
    if (ch === "/" && nxt === "/") {
      bad.push(line);
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === "/" && nxt === "*") {
      bad.push(line);
      inBlock = true;
      i += 2;
      continue;
    }
    i += 1;
  }
  return bad;
}

function main(): number {
  const files: string[] = [];
  for (const dir of ROOTS) {
    collect(dir, files);
  }
  let failures = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const line of scan(text)) {
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
