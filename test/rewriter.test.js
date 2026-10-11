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
  assert.equal(result, "<html><head><script>runtime()</script><base href=\"https://example.com/app/index.html\"></head><body></body></html>");
});

test("rewriteCss rewrites relative urls", () => {
  const result = rewriteCss("body{background:url('../img/bg.png')}", "https://example.com/css/main.css", endpoint);
  assert.match(result, /https%3A%2F%2Fexample\.com%2Fimg%2Fbg\.png/);
});

test("rewriteHtml rewrites unquoted and namespaced URL attributes", () => {
  const result = rewriteHtml('<img src=/img/a.png><svg><use xlink:href="/icons.svg#x"></use></svg>', base, endpoint);
  assert.match(result, /src=\/proxy\?url=/);
  assert.match(result, /xlink:href="\/proxy\?url=/);
});

test("rewriteHtml decodes HTML entities before proxying URLs", () => {
  const result = rewriteHtml('<a href="/search?a=1&amp;b=2">search</a>', base, endpoint);
  assert.match(result, /search%3Fa%3D1%26b%3D2/);
  assert.doesNotMatch(result, /%26amp%3B/);
});

test("rewriteHtml rewrites meta refresh URLs", () => {
  const result = rewriteHtml('<meta http-equiv="refresh" content="0;url=/login">', base, endpoint);
  assert.match(result, /url=\/proxy\?url=/);
  assert.match(result, /https%3A%2F%2Fexample\.com%2Flogin/);
});

test("rewriteHtml rewrites script src while preserving script contents", () => {
  const result = rewriteHtml('<script src="https://cdn.example.com/app.js">const url = "https://example.com/raw";</script>', base, endpoint);
  assert.match(result, /src="\/proxy\?url=/);
  assert.match(result, /https%3A%2F%2Fcdn\.example\.com%2Fapp\.js/);
  assert.match(result, /const url = "https:\/\/example\.com\/raw";/);
});

test("rewriteHtml rewrites absolute cross-origin CDN links through the proxy", () => {
  const result = rewriteHtml('<img src="https://cdn.example.com/photo.webp"><link rel="stylesheet" href="https://static.example.net/site.css">', base, endpoint);
  assert.match(result, /src="\/proxy\?url=https%3A%2F%2Fcdn\.example\.com%2Fphoto\.webp"/);
  assert.match(result, /href="\/proxy\?url=https%3A%2F%2Fstatic\.example\.net%2Fsite\.css"/);
});

test("rewriteHtml resolves resources against the upstream base tag", () => {
  const result = rewriteHtml('<html><head><base href="https://assets.example.net/static/"></head><body><img src="hero.png"></body></html>', base, endpoint);
  assert.match(result, /<base href="https:\/\/assets\.example\.net\/static\/">/);
  assert.match(result, /https%3A%2F%2Fassets\.example\.net%2Fstatic%2Fhero\.png/);
});

test("rewriteHtml resolves a bare CDN host and path through the proxy", () => {
  const result = rewriteHtml('<img src="cdn.example.com/images/photo.png">', base, endpoint);
  assert.ok(result.includes('src="/proxy?url=' + encodeURIComponent("https://cdn.example.com/images/photo.png") + '"'));
});

test("rewriteHtml creates a head for bare html input before injecting runtime", () => {
  const result = rewriteHtml('<html><body><img src="cdn.example.com/a.png"></body></html>', base, endpoint, "<script>runtime()</script>");
  assert.ok(result.includes('<head><script>runtime()</script><base href="https://example.com/app/index.html"></head>'));
});

test("rewriteHtml rewrites inline styles and preserves direct CAPTCHA endpoints", () => {
  const result = rewriteHtml('<div style="background-image:url(https://cdn.example.com/a.png)"></div><script src="https://www.google.com/recaptcha/api.js"></script>', base, endpoint);
  assert.match(result, /url\(\/proxy\?url=https%3A%2F%2Fcdn\.example\.com%2Fa\.png\)/);
  assert.match(result, /src="https:\/\/www\.google\.com\/recaptcha\/api\.js"/);
});
