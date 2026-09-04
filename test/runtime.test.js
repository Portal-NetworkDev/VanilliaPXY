import test from "node:test";
import assert from "node:assert/strict";
import { runtimeScript } from "../src/runtime.js";

test("runtimeScript emits a self-contained runtime", () => {
  const script = runtimeScript("/proxy?url=");
  assert.match(script, /__VANILLIAPXY_ENDPOINT__/);
  assert.match(script, /XMLHttpRequest\.prototype\.open/);
  assert.match(script, /globalThis\.fetch/);
  assert.doesNotMatch(script, /undefinedundefined/);
});
