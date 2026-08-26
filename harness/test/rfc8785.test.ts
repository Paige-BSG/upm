import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalize, sha256Canonical } from "../src/rfc8785.ts";

test("RFC8785 sorts keys and is stable", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.equal(sha256Canonical({ a: 1 }), sha256Canonical({ a: 1 }));
  assert.notEqual(sha256Canonical({ a: 1 }), sha256Canonical({ a: 2 }));
});

test("RFC8785 accepts ES numbers including fractions", () => {
  assert.equal(canonicalize({ fraction: 1.5 }), '{"fraction":1.5}');
  assert.equal(canonicalize(-0), "0");
});

test("RFC8785 encodes lone surrogates", () => {
  assert.equal(canonicalize("\uD800"), '"\\ud800"');
});

test("RFC8785 number vectors follow ES String", () => {
  assert.equal(canonicalize(0), "0");
  assert.equal(canonicalize(1e21), "1e+21");
  assert.equal(canonicalize(1.5), "1.5");
});
