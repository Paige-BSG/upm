import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalize, sha256Canonical } from "../src/rfc8785.ts";

test("RFC8785 sorts keys and is stable", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.equal(sha256Canonical({ a: 1 }), sha256Canonical({ a: 1 }));
  assert.notEqual(sha256Canonical({ a: 1 }), sha256Canonical({ a: 2 }));
});
