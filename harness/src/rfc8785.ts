import { createHash } from "node:crypto";

const ESCAPE: Record<number, string> = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
  0x22: '\\"',
  0x5c: "\\\\",
};

function encodeString(value: string): string {
  let out = '"';
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    const mapped = ESCAPE[unit];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    if (unit < 0x20) {
      out += `\\u${unit.toString(16).padStart(4, "0")}`;
      continue;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value[index];
        out += value[index + 1];
        index += 1;
        continue;
      }
      out += `\\u${unit.toString(16).padStart(4, "0")}`;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      out += `\\u${unit.toString(16).padStart(4, "0")}`;
      continue;
    }
    out += value[index];
  }
  return `${out}"`;
}

function encodeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("RFC8785_NUMBER");
  }
  if (Object.is(value, -0)) {
    return "0";
  }
  return String(value);
}

export function canonicalize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return encodeNumber(value);
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
