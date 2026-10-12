import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

function submitRuntimeForm(method, target, entries) {
  let submitListener;
  let assigned;
  class HTMLFormElement {
    constructor() {
      this.method = method;
      this.target = "_self";
    }
    getAttribute(name) {
      return name === "action"
        ? `http://proxy.test/vanillia?url=${encodeURIComponent(target)}`
        : null;
    }
  }
  class FormData {
    entries() {
      return entries;
    }
  }
  class XMLHttpRequest {
    open() {}
  }
  const context = {
    URL,
    XMLHttpRequest,
    HTMLFormElement,
    FormData,
    document: {
      baseURI: target,
      addEventListener(type, listener) {
        if (type === "submit") submitListener = listener;
      }
    },
    location: {
      href: `http://proxy.test/vanillia?url=${encodeURIComponent(target)}`,
      origin: "http://proxy.test",
      assign(value) { assigned = value; }
    },
    navigator: {}
  };
  const script = runtimeScript("/vanillia?url=", "/service-worker.js", target)
    .replace(/^<script[^>]*>/, "")
    .replace(/<\/script>$/, "");
  vm.runInNewContext(script, context);
  let prevented = false;
  submitListener({
    target: new HTMLFormElement(),
    preventDefault() { prevented = true; }
  });
  return { assigned, prevented };
}

function decodeProxiedLocation(location) {
  const proxyUrl = new URL(location, "http://proxy.test");
  return new URL(proxyUrl.searchParams.get("url"));
}

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

test("runtime wraps window message posting only when the Window method is available", () => {
  const script = runtimeScript();
  assert.match(script, /if \(nativeWindowPrototypePostMessage && globalThis\.Window\?\.prototype\)/);
  assert.doesNotMatch(script, /nativeWindowPostMessage/);
});

test("runtime routes DuckDuckGo HTML POST search forms through supported GET search URLs", () => {
  const target = "https://html.duckduckgo.com/html/";
  const result = submitRuntimeForm("post", target, [["q", "test search"], ["kl", "us-en"]]);
  assert.equal(result.prevented, true);
  assert.equal(decodeProxiedLocation(result.assigned).href, `${target}?q=test+search&kl=us-en`);
});

test("runtime leaves non-DuckDuckGo POST forms as POST submissions", () => {
  const result = submitRuntimeForm("post", "https://example.com/search", [["q", "test"]]);
  assert.equal(result.prevented, false);
  assert.equal(result.assigned, undefined);
});

