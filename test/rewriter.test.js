import test from "node:test";
import assert from "node:assert/strict";
import { proxyUrl, rewriteCss, rewriteHtml, rewriteWorkerScript } from "../src/rewriter.js";

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

test("rewriteWorkerScript rewrites Rspack dynamic chunk imports against the worker's upstream base", () => {
  const source = 'const chunk = import("./"+__webpack_require__.u(id));';
  const result = rewriteWorkerScript(source, "https://github.githubassets.com/assets/wp-runtime-821e53a8825beeb4.js", endpoint);
  const expected = "https://github.githubassets.com/assets/";
  assert.ok(result.includes(`import(${JSON.stringify(endpoint)} + encodeURIComponent(new URL(__webpack_require__.u(id), ${JSON.stringify(expected)}).href))`));
});

test("rewriteWorkerScript rewrites import.meta.url to the upstream module URL", () => {
  const result = rewriteWorkerScript('const base = import.meta.url;', "https://github.githubassets.com/assets/wp-runtime.js", endpoint);
  assert.ok(result.endsWith('const base = "https://github.githubassets.com/assets/wp-runtime.js";'));
});

test("rewriteWorkerScript rewrites static relative module imports through the proxy", () => {
  const source = 'import { __webpack_require__ } from "./wp-runtime-821e53a8825beeb4.js";';
  const result = rewriteWorkerScript(source, "https://github.githubassets.com/assets/environment.js", endpoint);
  assert.ok(result.includes('from "' + endpoint + encodeURIComponent("https://github.githubassets.com/assets/wp-runtime-821e53a8825beeb4.js") + '"'));
});

test("rewriteWorkerScript proxies importScripts chunk URLs through the proxy endpoint", () => {
  const source = 'importScripts(i.p + i.u(e))';
  const result = rewriteWorkerScript(source, "https://discord.com/assets/worker.js", endpoint);
  assert.match(result, /importScripts\(\.\.\.\[i\.p \+ i\.u\(e\)\]\.map\(url =>/);
  assert.match(result, /\/proxy\?url=/);
  assert.match(result, /https:\/\/discord\.com/);
  assert.match(result, /globalThis\.importScripts = \(\.\.\.urls\) => nativeImportScripts\(\.\.\.urls\.map\(proxy\)\)/);
  assert.match(result, /globalThis\.XMLHttpRequest\.prototype\.open = function\(method, url, \.\.\.rest\)/);
  assert.match(result, /globalThis\.fetch = \(input, init\) =>/);
  assert.match(result, /navigator\.serviceWorker\.register = \(scriptURL, options\)/);
  assert.match(result, /registration\.searchParams\.set\("target", target\.href\)/);
});

test("rewriteWorkerScript leaves blob importScripts chunks untouched", () => {
  const source = 'importScripts(URL.createObjectURL(new Blob(["chunk"], { type: "text/javascript" })))';
  const result = rewriteWorkerScript(source, "https://discord.com/assets/worker.js", endpoint);
  assert.ok(result.includes('new URL(url, "https://discord.com")'));
  assert.ok(result.includes('new URL(input, base)'));
  assert.match(result, /target\.hash = ""/);
  assert.match(result, /encodeURIComponent\(target\.href\) \+ fragment/);
});

test("rewriteWorkerScript balances nested call parentheses in importScripts arguments", () => {
  const result = rewriteWorkerScript('importScripts(i.p + i.u(e))', "https://discord.com/assets/worker.js", endpoint);
  assert.match(result, /importScripts\(\.\.\.\[i\.p \+ i\.u\(e\)\]\.map\(url =>/);
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

test("rewriteHtml preserves direct meta-refresh and JavaScript redirect destinations", () => {
  const input = '<!-- wp:html --><meta charset="UTF-8"><title>Redirecting...</title>' +
    '<meta http-equiv="refresh" content="0;url=https://example.com/new-page">' +
    '<script>window.location.replace("https://www.portal-network.com/");</script>' +
    '<p><a href="https://www.portal-network.com/">Continue</a></p><!-- /wp:html -->';
  const result = rewriteHtml(input, base, endpoint, "<script>runtime()</script>");
  assert.match(result, /content="0;url=https:\/\/example\.com\/new-page"/);
  assert.match(result, /window\.location\.replace\("https:\/\/www\.portal-network\.com\/"\)/);
  assert.match(result, /<a href="https:\/\/www\.portal-network\.com\/"[^>]*>Continue<\/a>/);
  assert.doesNotMatch(result, /content="0;url=\/proxy/);
  assert.doesNotMatch(result, /window\.location\.replace\("\/proxy/);
});

test("rewriteHtml still proxies unrelated links on a page with a redirect", () => {
  const result = rewriteHtml('<meta http-equiv="refresh" content="0;url=https://example.com/new-page"><a href="https://example.org/other">Other</a>', base, endpoint);
  assert.match(result, /href="\/proxy\?url=https%3A%2F%2Fexample\.org%2Fother"/);
  assert.match(result, /content="0;url=https:\/\/example\.com\/new-page"/);
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
  assert.ok(result.includes('href="/proxy?url=' + encodeURIComponent("https://static.example.net/site.css") + '"'));
});

test("rewriteHtml removes stale integrity hashes from proxied stylesheet links and preloads", () => {
  const html = '<link rel="stylesheet" href="https://cdn.example.com/site.css" integrity="sha384-stale" crossorigin="anonymous">' +
    '<link rel="preload" as="style" href="https://cdn.example.com/next.css" integrity="sha384-old">';
  const result = rewriteHtml(html, base, endpoint);
  assert.match(result, /href="\/proxy\?url=https%3A%2F%2Fcdn\.example\.com%2Fsite\.css"/);
  assert.match(result, /href="\/proxy\?url=https%3A%2F%2Fcdn\.example\.com%2Fnext\.css"/);
  assert.doesNotMatch(result, /integrity=/i);
  assert.match(result, /crossorigin="anonymous"/);
});

test("rewriteHtml retains integrity hashes when stylesheet URLs stay direct", () => {
  const html = '<link rel="stylesheet" href="https://www.google.com/recaptcha/styles.css" integrity="sha384-valid">';
  const result = rewriteHtml(html, base, endpoint);
  assert.match(result, /href="https:\/\/www\.google\.com\/recaptcha\/styles\.css"/);
  assert.match(result, /integrity="sha384-valid"/);
});

test("rewriteHtml proxies Discord login links instead of sending users to discord.com directly", () => {
  const result = rewriteHtml('<a href="https://discord.com/login">Log In</a><a href="https://discord.com/register">Register</a>', "https://discord.com/", endpoint);
  assert.ok(result.includes('href="' + endpoint + encodeURIComponent("https://discord.com/login") + '"'));
  assert.ok(result.includes('href="' + endpoint + encodeURIComponent("https://discord.com/register") + '"'));
  assert.doesNotMatch(result, /href="https:\/\/discord\.com\/(?:login|register)"/);
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
