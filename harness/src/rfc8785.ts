import { createHash } from "node:crypto";

const ESCAPE: Record<string, string> = {
  "\u0008": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\u000c": "\\f",
  "\r": "\\r",
  '"': '\\"',
  "\\": "\\\\",
};

function encodeString(value: string): string {
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) {
      continue;
    }
    if (ESCAPE[char] !== undefined) {
      out += ESCAPE[char];
      continue;
    }
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    out += char;
  }
  return `${out}"`;
}

export function canonicalize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error("RFC8785_NUMBER");
    }
    return String(value);
  }
  if (typeof value === "string") {
    return encodeString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${keys.map((key) => `${encodeString(key)}:${canonicalize(record[key])}`).join(",")}}`;
  }
  throw new Error("RFC8785_TYPE");
}

export function sha256Canonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;
}
