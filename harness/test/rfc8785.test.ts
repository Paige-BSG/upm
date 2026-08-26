import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalize, sha256Canonical } from "../src/rfc8785.ts";

function fromBits(hex: string): number {
  return Buffer.from(hex, "hex").readDoubleBE(0);
}

test("RFC8785 sorts keys and is stable", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.equal(sha256Canonical({ a: 1 }), sha256Canonical({ a: 1 }));
  assert.notEqual(sha256Canonical({ a: 1 }), sha256Canonical({ a: 2 }));
});

test("RFC8785 official string sort order", () => {
  const sample = {
    "\u20ac": "Euro Sign",
    "\r": "Carriage Return",
    "\ufb33": "Hebrew Letter Dalet With Dagesh",
    "1": "One",
    "\ud83d\ude00": "Emoji: Grinning Face",
    "\u0080": "Control",
    "\u00f6": "Latin Small Letter O With Diaeresis",
  };
  const canonical = canonicalize(sample);
  assert.ok(canonical.startsWith('{"\\r":"Carriage Return","1":"One"'));
  assert.ok(canonical.indexOf("Latin Small Letter O With Diaeresis") < canonical.indexOf("Euro Sign"));
  assert.ok(canonical.indexOf("Euro Sign") < canonical.indexOf("Emoji: Grinning Face"));
  assert.ok(canonical.indexOf("Emoji: Grinning Face") < canonical.indexOf("Hebrew Letter Dalet With Dagesh"));
});

test("RFC8785 Appendix B number vectors", () => {
  assert.equal(canonicalize(fromBits("0000000000000000")), "0");
  assert.equal(canonicalize(fromBits("8000000000000000")), "0");
  assert.equal(canonicalize(fromBits("0000000000000001")), "5e-324");
  assert.equal(canonicalize(fromBits("8000000000000001")), "-5e-324");
  assert.equal(canonicalize(fromBits("7fefffffffffffff")), "1.7976931348623157e+308");
  assert.equal(canonicalize(fromBits("ffefffffffffffff")), "-1.7976931348623157e+308");
  assert.equal(canonicalize(fromBits("4340000000000000")), "9007199254740992");
  assert.equal(canonicalize(fromBits("c340000000000000")), "-9007199254740992");
  assert.equal(canonicalize(fromBits("4430000000000000")), "295147905179352830000");
  assert.equal(canonicalize(fromBits("44b52d02c7e14af5")), "9.999999999999997e+22");
  assert.equal(canonicalize(fromBits("44b52d02c7e14af6")), "1e+23");
  assert.equal(canonicalize(fromBits("44b52d02c7e14af7")), "1.0000000000000001e+23");
  assert.equal(canonicalize(fromBits("444b1ae4d6e2ef4e")), "999999999999999700000");
  assert.equal(canonicalize(fromBits("444b1ae4d6e2ef4f")), "999999999999999900000");
  assert.equal(canonicalize(fromBits("444b1ae4d6e2ef50")), "1e+21");
  assert.equal(canonicalize(fromBits("3eb0c6f7a0b5ed8c")), "9.999999999999997e-7");
  assert.equal(canonicalize(fromBits("3eb0c6f7a0b5ed8d")), "0.000001");
  assert.equal(canonicalize(fromBits("41b3de4355555553")), "333333333.3333332");
  assert.equal(canonicalize(fromBits("41b3de4355555554")), "333333333.33333325");
  assert.equal(canonicalize(fromBits("41b3de4355555555")), "333333333.3333333");
  assert.equal(canonicalize(fromBits("41b3de4355555556")), "333333333.3333334");
  assert.equal(canonicalize(fromBits("41b3de4355555557")), "333333333.33333343");
  assert.equal(canonicalize(fromBits("becbf647612f3696")), "-0.0000033333333333333333");
  assert.equal(canonicalize(fromBits("43143ff3c1cb0959")), "1424953923781206.2");
  assert.throws(() => canonicalize(Number.NaN), /RFC8785_NUMBER/);
  assert.throws(() => canonicalize(Number.POSITIVE_INFINITY), /RFC8785_NUMBER/);
});

test("RFC8785 lone surrogates abort", () => {
  assert.throws(() => canonicalize("\uD800"), /RFC8785_STRING/);
  assert.throws(() => canonicalize("\uDEAD"), /RFC8785_STRING/);
});
