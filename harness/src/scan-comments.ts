export function scanCommentLines(text: string): number[] {
  const bad: number[] = [];
  let i = 0;
  let line = 1;
  let inSq = false;
  let inDq = false;
  let inBt = false;
  let inLine = false;
  let inBlock = false;
  let expr = 0;
  let brace = 0;
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
    if (inSq || inDq || (inBt && expr === 0)) {
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
      if (inBt && ch === "$" && nxt === "{") {
        expr = 1;
        brace = 1;
        i += 2;
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
    if (expr > 0) {
      if (ch === "{") {
        brace += 1;
      } else if (ch === "}") {
        brace -= 1;
        if (brace === 0) {
          expr = 0;
          inBt = true;
        }
      } else if (ch === "/" && nxt === "/") {
        bad.push(line);
        inLine = true;
        i += 2;
        continue;
      } else if (ch === "/" && nxt === "*") {
        bad.push(line);
        inBlock = true;
        i += 2;
        continue;
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
    if (ch === "/" && nxt !== "*" && nxt !== "/") {
      const prev = previousCode(text, i);
      if (startsRegex(prev)) {
        i += 1;
        let reEscape = false;
        let inClass = false;
        while (i < text.length) {
          const rch = text[i]!;
          if (rch === "\n") {
            break;
          }
          if (reEscape) {
            reEscape = false;
            i += 1;
            continue;
          }
          if (rch === "\\") {
            reEscape = true;
            i += 1;
            continue;
          }
          if (rch === "[") {
            inClass = true;
          } else if (rch === "]" && inClass) {
            inClass = false;
          } else if (rch === "/" && !inClass) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
    }
    i += 1;
  }
  return bad;
}

function previousCode(text: string, index: number): string {
  let cursor = index - 1;
  while (cursor >= 0 && /[ \t]/.test(text[cursor]!)) {
    cursor -= 1;
  }
  return cursor < 0 ? "" : text[cursor]!;
}

function startsRegex(prev: string): boolean {
  return prev === "" || /[([{=,:;!&|?~^*%<>+\-]/.test(prev);
}
