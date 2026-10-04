import assert from "node:assert/strict";
import { test } from "node:test";
import { rolldown } from "rolldown";
const bundle = await rolldown({ input: "src/protocol/gamepadAccess.ts" });
const { output } = await bundle.generate({
  format: "esm",
  codeSplitting: false,
});
const { gamepadAccess } = await import(
  `data:text/javascript;base64,${Buffer.from(output[0].code).toString("base64")}`
);
await bundle.close();
const ready = { capabilities: { gamepad: true }, driverAvailable: true };
test("Gamepad requires a live compatible service and explicit ViGEmBus confirmation", () => {
  assert.equal(gamepadAccess(null, false, false), "service");
  assert.equal(gamepadAccess(ready, true, true), "checking");
  assert.equal(gamepadAccess(ready, false, true), "ready");
  assert.equal(
    gamepadAccess({ ...ready, capabilities: { gamepad: false } }, false, true),
    "update",
  );
  for (const driverAvailable of [false, undefined]) {
    assert.equal(
      gamepadAccess({ ...ready, driverAvailable }, false, true),
      "driver",
    );
    assert.equal(
      gamepadAccess({ ...ready, driverAvailable, enabled: true }, false, true),
      "driver",
    );
  }
});
test("Stale status after a disconnect or pending recheck cannot unlock Gamepad", () => {
  assert.equal(gamepadAccess(ready, false, false), "service");
  assert.equal(gamepadAccess(ready, true, false), "checking");
  assert.equal(gamepadAccess(ready), "service");
});
