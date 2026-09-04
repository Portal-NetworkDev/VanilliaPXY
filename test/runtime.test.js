import test from "node:test";
import assert from "node:assert/strict";
import { runtimeScript } from "../src/runtime.js";

test("runtimeScript emits a self-contained runtime", () => {
  const script = runtimeScript("/vanillia?url=");
  assert.match(script, /__VANILLIAPXY_ENDPOINT__/);
  assert.match(script, /XMLHttpRequest\.prototype\.open/);
  assert.match(script, /globalThis\.fetch/);
  assert.doesNotMatch(script, /undefinedundefined/);
});

test("runtimeScript uses the proxy endpoint", () => {
  assert.match(runtimeScript(), /\/vanillia\?url=/);
  assert.doesNotMatch(runtimeScript(), /\/proxy\?url=/);
});
