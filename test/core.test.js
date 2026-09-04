import test from "node:test";
import assert from "node:assert/strict";
import { parseTarget, resolveRedirect } from "../src/target.js";
import { proxyUrl, rewriteCss, rewriteHtml } from "../src/rewriter.js";

const endpoint = "/proxy?url=";

 test("parseTarget accepts http and https URLs", () => {
  assert.equal(parseTarget("https://example.com/path").href, "https://example.com/path");
  assert.equal(parseTarget("http://example.com").protocol, "http:");
});

test("parseTarget rejects unsafe URL forms", () => {
  assert.equal(parseTarget("javascript:alert(1)"), null);
  assert.equal(parseTarget("https://user:pass@example.com"), null);
  assert.equal(parseTarget("not a url"), null);
});

test("resolveRedirect resolves relative redirects", () => {
  const next = resolveRedirect("../next", "https://example.com/a/b/");
  assert.equal(next.href, "https://example.com/a/next");
});

test("proxyUrl preserves browser-local references", () => {
  assert.equal(proxyUrl("#section", "https://example.com/page", endpoint), "#section");
  assert.equal(proxyUrl("data:text/plain,hello", "https://example.com/page", endpoint), "data:text/plain,hello");
});

test("proxyUrl resolves relative URLs", () => {
  const result = proxyUrl("../asset.js", "https://example.com/app/index.html", endpoint);
  assert.equal(result, "/proxy?url=" + encodeURIComponent("https://example.com/asset.js"));
});

test("rewriteHtml rewrites common resource attributes", () => {
  const input = '<a href="/docs">Docs</a><img src="images/a.png"><form action="/login">';
  const output = rewriteHtml(input, "https://example.com/app/", endpoint);
  assert.match(output, /href="\/proxy\?url=https%3A%2F%2Fexample.com%2Fdocs"/);
  assert.match(output, /src="\/proxy\?url=https%3A%2F%2Fexample.com%2Fapp%2Fimages%2Fa.png"/);
  assert.match(output, /action="\/proxy\?url=https%3A%2F%2Fexample.com%2Flogin"/);
});

test("rewriteCss rewrites relative assets", () => {
  const output = rewriteCss("body{background:url('../img/bg.png')}", "https://example.com/css/main.css", endpoint);
  assert.match(output, /\/proxy\?url=https%3A%2F%2Fexample.com%2Fimg%2Fbg.png/);
});
