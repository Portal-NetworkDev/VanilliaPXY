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

test("rewrites srcset candidates without corrupting commas in data URLs", () => {
  assert.equal(rewriteSrcset("/a.png 1x, /b.png 2x", "https://example.com/"), "/vanillia?url=https%3A%2F%2Fexample.com%2Fa.png 1x, /vanillia?url=https%3A%2F%2Fexample.com%2Fb.png 2x");
  assert.equal(rewriteSrcset("data:image/png;base64,AAAA 1x, https://cdn.example.com/a.png 2x", "https://example.com/"), "data:image/png;base64,AAAA 1x, /vanillia?url=https%3A%2F%2Fcdn.example.com%2Fa.png 2x");
});

test("rewrites bare host and host-relative resource URLs through the proxy", () => {
  assert.equal(rewriteUrl("cdn.example.com", "https://example.com/"), "/vanillia?url=" + encodeURIComponent("https://cdn.example.com/"));
  assert.equal(rewriteUrl("cdn.example.com/images/a.png", "https://example.com/"), "/vanillia?url=" + encodeURIComponent("https://cdn.example.com/images/a.png"));
  assert.equal(rewriteUrl("cdn.example.com:8443/a.png", "https://example.com/"), "/vanillia?url=" + encodeURIComponent("https://cdn.example.com:8443/a.png"));
});

test("keeps Google CAPTCHA endpoints direct", () => {
  for (const url of [
    "https://www.google.com/recaptcha/api.js",
    "https://www.gstatic.com/recaptcha/releases/test/recaptcha__en.js",
    "https://www.recaptcha.net/recaptcha/api.js"
  ]) assert.equal(rewriteUrl(url, "https://example.com/"), url);
});

test("keeps CAPTCHA-related Google requests direct without exempting unrelated paths", () => {
  const urls = [
    "https://www.google.com/recaptcha/api2/anchor?k=site-key",
    "https://www.google.com/recaptcha/api2/reload?k=site-key",
    "https://www.google.com/recaptcha?k=site-key",
    "https://www.gstatic.com/recaptcha/releases/test/recaptcha__en.js",
    "https://www.recaptcha.net/recaptcha/api.js?render=site-key"
  ];
  for (const url of urls) assert.equal(rewriteUrl(url, "https://example.com/"), url);
  const ordinary = "https://www.google.com/images/logo.png";
  assert.equal(rewriteUrl(ordinary, "https://example.com/"), "/vanillia?url=" + encodeURIComponent(ordinary));
});

test("rewrites ordinary Google CDN resources through proxy", () => {
  assert.equal(rewriteUrl("https://www.gstatic.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png", "https://example.com/"), "/vanillia?url=" + encodeURIComponent("https://www.gstatic.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png"));
});

test("does not proxy a URL twice", () => {
  const proxied = "/vanillia?url=" + encodeURIComponent("https://cdn.example.com/image.png");
  assert.equal(rewriteUrl(proxied, "https://proxy.example/"), proxied);
});
