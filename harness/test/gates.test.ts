import assert from "node:assert/strict";
import { test } from "node:test";
import { scanCommentLines } from "../src/scan-comments.ts";
import { checkInvariantUsage } from "../src/scan-invariants.ts";
import { SPEC_P1_NO_COMMENT } from "../src/types.ts";

void SPEC_P1_NO_COMMENT;

test("comment scanner ignores shebang strings and regex but flags line block and template expr", () => {
  assert.deepEqual(scanCommentLines("#!/usr/bin/env node\nconst x = 1;\n"), []);
  assert.deepEqual(scanCommentLines('const url = "https://example.com";\n'), []);
  assert.deepEqual(scanCommentLines("const re = /https://x/;\n"), []);
  assert.ok(scanCommentLines("const x = 1; // line\n").includes(1));
  assert.ok(scanCommentLines("const x = 1; /* block */\n").includes(1));
  assert.ok(scanCommentLines("/** jsdoc */\nconst x = 1;\n").includes(1));
  assert.ok(scanCommentLines("const t = `ok ${1 /* inner */}`;\n").length > 0);
  assert.ok(scanCommentLines("const x = 1; // eslint-disable-next-line\n").includes(1));
  assert.ok(scanCommentLines("/* v8 ignore next */\nconst x = 1;\n").includes(1));
});

test("invariant usage ignores the catalog and reports unused and dangling ids", () => {
  const prefix = "SPEC-P1-";
  const unusedId = `${prefix}UNUSED-FAKE`;
  const ghostId = `${prefix}GHOST`;
  const catalog = { "SPEC-P1-NO-COMMENT": "x", [unusedId]: "y" };
  const blob = `void SPEC_P1_NO_COMMENT; "SPEC-P1-NO-COMMENT"; "${ghostId}"`;
  const { unused, dangling } = checkInvariantUsage(catalog, blob);
  assert.deepEqual(unused, [unusedId]);
  assert.deepEqual(dangling, [ghostId]);
});
