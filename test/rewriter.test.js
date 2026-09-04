import test from "node:test";
import assert from "node:assert/strict";
import { proxyUrl, rewriteCss, rewriteHtml } from "../src/rewriter.js";

const base = "https://example.com/app/index.html";
const endpoint = "/proxy?url=";

test("proxyUrl resolves relative resources", () => {
  assert.equal(
    proxyUrl("../assets/app.js", base, endpoint),
    "/proxy?url=" + encodeURIComponent("https://example.com/assets/app.js")
  );
});

test("proxyUrl preserves non-http schemes", () => {
  assert.equal(proxyUrl("data:text/plain,ok", base, endpoint), "data:text/plain,ok");
  assert.equal(proxyUrl("javascript:void(0)", base, endpoint), "javascript:void(0)");
});

test("rewriteHtml rewrites resource attributes", () => {
  const result = rewriteHtml('<img src="/img/a.png"><a href="/next">next</a>', base, endpoint);
  assert.match(result, /\/proxy\?url=/);
  assert.match(result, /https%3A%2F%2Fexample\.com%2Fimg%2Fa\.png/);
  assert.match(result, /https%3A%2F%2Fexample\.com%2Fnext/);
});

test("rewriteHtml injects runtime before head close", () => {
  const result = rewriteHtml("<html><head></head><body></body></html>", base, endpoint, "<script>runtime()</script>");
  assert.equal(result, "<html><head><script>runtime()</script></head><body></body></html>");
});

test("rewriteCss rewrites relative urls", () => {
  const result = rewriteCss("body{background:url('../img/bg.png')}", "https://example.com/css/main.css", endpoint);
  assert.match(result, /https%3A%2F%2Fexample\.com%2Fimg%2Fbg\.png/);
});
