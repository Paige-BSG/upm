import assert from "node:assert/strict";
import { test } from "node:test";
import { STARTUP_PINS, assertIntegrationPins, pinsAdmitted } from "../src/pins.ts";

test("startup pins stay PENDING without guessed digests", () => {
  assert.equal(pinsAdmitted(), false);
  assert.ok(STARTUP_PINS.every((pin) => pin.admission === "PENDING"));
  assert.ok(STARTUP_PINS.every((pin) => pin.digest === null));
});

test("integration gate fails closed while pins are PENDING", () => {
  assert.throws(() => assertIntegrationPins(), { name: "INTEGRATION_PINS_PENDING" });
});
