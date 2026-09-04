import test from "node:test";
import assert from "node:assert/strict";
import { rewriteUrl, rewriteSrcset } from "../src/url.js";

test("rewrites relative URLs", () => {
  assert.equal(rewriteUrl("/app.js", "https://example.com/a/", "/vanillia?url="), "/vanillia?url=https%3A%2F%2Fexample.com%2Fapp.js");
});

test("keeps non-http resources", () => {
  assert.equal(rewriteUrl("data:text/plain,ok", "https://example.com/"), "data:text/plain,ok");
  assert.equal(rewriteUrl("#section", "https://example.com/"), "#section");
});

test("rewrites srcset candidates", () => {
  assert.equal(rewriteSrcset("/a.png 1x, /b.png 2x", "https://example.com/"), "/vanillia?url=https%3A%2F%2Fexample.com%2Fa.png 1x, /vanillia?url=https%3A%2F%2Fexample.com%2Fb.png 2x");
});
