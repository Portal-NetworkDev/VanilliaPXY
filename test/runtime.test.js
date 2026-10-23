import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

function submitRuntimeForm(method, target, entries, proxyEndpoint = "/vanillia?url=") {
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
  const script = runtimeScript(proxyEndpoint, "/service-worker.js", target)
    .replace(/^<script[^>]*>/, "")
    .replace("</script>", "");
  vm.runInNewContext(script, context);
  let prevented = false;
  submitListener({
    target: new HTMLFormElement(),
    preventDefault() { prevented = true; }
  });
  return { assigned, prevented };
}

function clickRuntimeLink(href, { target = "_self", button = 0, ctrlKey = false } = {}) {
  let clickListener;
  let assigned;
  let opened;
  function Location() {}
  Object.defineProperty(Location.prototype, "href", {
    configurable: true,
    get() { return "http://proxy.test/vanillia?url=https%3A%2F%2Fdiscord.com%2F"; },
    set(value) { assigned = value; }
  });
  Location.prototype.assign = function(value) { assigned = value; };
  Location.prototype.replace = function(value) { assigned = value; };
  Location.prototype.toString = function() { return this.href; };
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function() {};
  const location = Object.assign(Object.create(Location.prototype), { origin: "http://proxy.test" });
  class HTMLAnchorElement {}
  Object.defineProperty(HTMLAnchorElement.prototype, "href", {
    configurable: true,
    get() { return this._href; },
    set(value) { this._href = new URL(value, "https://discord.com/").href; }
  });
  const anchor = Object.assign(Object.create(HTMLAnchorElement.prototype), {
    href,
    target,
    rel: "",
    hasAttribute(name) { return name === "download" ? false : false; }
  });
  const context = {
    URL,
    Location,
    HTMLAnchorElement,
    XMLHttpRequest,
    document: {
      baseURI: "https://discord.com/",
      querySelector() { return null; },
      addEventListener(type, listener) {
        if (type === "click") clickListener = listener;
      }
    },
    location,
    navigator: {},
    open(value, ...args) { opened = [value, ...args]; }
  };
  const script = runtimeScript("http://proxy.test/vanillia?url=", "/service-worker.js", "https://discord.com/")
    .replace(/^<script[^>]*>/, "")
    .replace(/<\/script>$/, "");
  vm.runInNewContext(script, context);
  let prevented = false;
  clickListener({
    target: { closest() { return anchor; } },
    button,
    ctrlKey,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault() { prevented = true; }
  });
  return { assigned, opened, prevented };
}

function runWorkerRuntime(scriptUrl) {
  let requestedScript;
  let requestedOptions;
  class Worker {
    constructor(url, options) {
      requestedScript = url;
      requestedOptions = options;
    }
  }
  class HTMLAnchorElement {}
  Object.defineProperty(HTMLAnchorElement.prototype, "href", {
    configurable: true,
    get() { return this._href; },
    set(value) { this._href = new URL(value, "https://discord.com/").href; }
  });
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function() {};
  const document = {
    baseURI: "https://discord.com/login",
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const context = {
    URL,
    Worker,
    HTMLAnchorElement,
    XMLHttpRequest,
    document,
    location: { href: "http://proxy.test/vanillia?url=https%3A%2F%2Fdiscord.com%2Flogin", origin: "http://proxy.test" },
    navigator: {}
  };
  const script = runtimeScript("http://proxy.test/vanillia?url=", "/service-worker.js", "https://discord.com/login")
    .replace(/^<script[^>]*>/, "")
    .replace(/<\/script>$/, "");
  vm.runInNewContext(script, context);
  new context.Worker(scriptUrl, { type: "module" });
  return { requestedScript, requestedOptions };
}

function runBlobWorkerRuntime(source) {
  const createdBlobs = [];
  class Blob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options?.type || "";
      createdBlobs.push(this);
    }
  }
  class Worker {
    constructor(url) { this.url = url; }
  }
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function() {};
  const context = {
    URL,
    Blob,
    Worker,
    XMLHttpRequest,
    document: { baseURI: "https://discord.com/login", querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    location: { href: "http://proxy.test/vanillia?url=https%3A%2F%2Fdiscord.com%2Flogin", origin: "http://proxy.test" },
    navigator: {}
  };
  const script = runtimeScript("http://proxy.test/vanillia?url=", "/service-worker.js", "https://discord.com/login")
    .replace(/^<script[^>]*>/, "")
    .replace("</script>", "");
  vm.runInNewContext(script, context);
  const blob = new context.Blob([source], { type: "text/javascript" });
  const worker = new context.Worker("blob:test-worker");
  return { blob, worker, createdBlobs };
}

function runHistoryRuntime(method, url) {
  let requestedUrl;
  let requestedState;
  class History {
    [method](state, unused, nextUrl) {
      if (nextUrl != null && new URL(nextUrl, "http://proxy.test/").origin !== "http://proxy.test") {
        const error = new Error("History URL must remain on the proxy origin");
        error.name = "SecurityError";
        throw error;
      }
      requestedState = state;
      requestedUrl = nextUrl;
    }
  }
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function() {};
  const context = {
    URL,
    History,
    XMLHttpRequest,
    history: Object.create(History.prototype),
    document: {
      baseURI: "https://discord.com/login",
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    location: {
      href: "http://proxy.test/vanillia?url=https%3A%2F%2Fdiscord.com%2Flogin",
      origin: "http://proxy.test"
    },
    navigator: {}
  };
  const script = runtimeScript("http://proxy.test/vanillia?url=", "/service-worker.js", "https://discord.com/login")
    .replace(/^<script[^>]*>/, "")
    .replace("</script>", "");
  vm.runInNewContext(script, context);
  context.history[method]({ route: "login" }, "", url);
  return { requestedUrl, requestedState };
}

function runSameOriginHistoryRuntime() {
  let requestedUrl;
  class History {
    pushState(state, unused, url) { requestedUrl = url; }
  }
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function() {};
  const context = {
    URL,
    History,
    history: Object.create(History.prototype),
    XMLHttpRequest,
    document: { baseURI: "https://discord.com/login", querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    location: { href: "http://proxy.test/vanillia?url=https%3A%2F%2Fdiscord.com%2Flogin", origin: "http://proxy.test" },
    navigator: {}
  };
  const script = runtimeScript("http://proxy.test/vanillia?url=", "/service-worker.js", "https://discord.com/login")
    .replace(/^<script[^>]*>/, "")
    .replace("</script>", "");
  vm.runInNewContext(script, context);
  context.history.pushState({}, "", "http://proxy.test/vanillia?url=https%3A%2F%2Fdiscord.com%2Flogin");
  return requestedUrl;
}

function runStreamingRequestFetchRuntime() {
  let fetchedRequest;
  let fetchedInit;
  class XMLHttpRequest {
    open() {}
  }
  const context = {
    URL,
    Request,
    fetch(request, init) {
      fetchedRequest = request;
      fetchedInit = init;
      return Promise.resolve("ok");
    },
    XMLHttpRequest,
    document: { baseURI: "https://www.google.com/", querySelector() { return null; }, addEventListener() {} },
    location: { href: "http://proxy.test/vanillia?url=https%3A%2F%2Fwww.google.com%2F", origin: "http://proxy.test" },
    navigator: {}
  };
  const script = runtimeScript("http://proxy.test/vanillia?url=", "/service-worker.js", "https://www.google.com/")
    .replace(/^<script[^>]*>/, "")
    .replace("</script>", "");
  vm.runInNewContext(script, context);
  const request = new Request("https://www.google.com/rpc", {
    method: "POST",
    body: "payload",
    duplex: "half"
  });
  const result = context.fetch(request, { method: "POST" });
  return result.then(() => ({ fetchedRequest, fetchedInit }));
}

function runProxyOriginPostMessageRuntime() {
  let topArguments;
  let frameArguments;
  const frameWindow = {
    postMessage(...args) { frameArguments = args; }
  };
  function Window() {}
  Window.prototype.postMessage = function(...args) { topArguments = args; };
  function HTMLIFrameElement() {}
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
    configurable: true,
    get() { return frameWindow; }
  });
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function() {};
  const context = {
    URL,
    Window,
    HTMLIFrameElement,
    XMLHttpRequest,
    postMessage(...args) { topArguments = args; },
    document: { baseURI: "https://accounts.google.com/v3/signin/", querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    location: { href: "http://proxy.test/vanillia?url=https%3A%2F%2Faccounts.google.com%2Fv3%2Fsignin%2Fidentifier", origin: "http://proxy.test" },
    navigator: {}
  };
  const script = runtimeScript("http://proxy.test/vanillia?url=", "/service-worker.js", "https://accounts.google.com/v3/signin/")
    .replace(/^<script[^>]*>/, "")
    .replace("</script>", "");
  vm.runInNewContext(script, context);
  context.postMessage({ type: "ready" }, "https://accounts.google.com");
  const iframe = new context.HTMLIFrameElement();
  iframe.contentWindow.postMessage({ type: "ready" }, "https://accounts.google.com");
  return { topArguments, frameArguments };
}

function runCookieRuntime() {
  let storedCookie = "";
  function Document() {}
  Object.defineProperty(Document.prototype, "cookie", {
    configurable: true,
    get() { return storedCookie; },
    set(value) { storedCookie = value; }
  });
  function Location() {}
  Object.defineProperty(Location.prototype, "href", {
    configurable: true,
    get() { return "https://proxy.test/"; },
    set() {}
  });
  Location.prototype.assign = function() {};
  Location.prototype.replace = function() {};
  Location.prototype.toString = function() { return this.href; };
  Location.prototype.toString = function() { return this.href; };
  function Element() {}
  Element.prototype = {};
  function EventTarget() {}
  EventTarget.prototype = {};
  function XMLHttpRequest() {}
  const document = Object.assign(Object.create(Document.prototype), {
    baseURI: "https://accounts.google.com/",
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  });
  const context = {
    URL,
    Document,
    Location,
    Element,
    EventTarget,
    XMLHttpRequest,
    document,
    location: { href: "https://proxy.test/vanillia?url=https%3A%2F%2Faccounts.google.com%2F", origin: "https://proxy.test" },
    navigator: {}
  };
  const script = runtimeScript("/vanillia?url=", "/service-worker.js", "https://accounts.google.com/")
    .replace(/^<script[^>]*>/, "")
    .replace(/<\/script>$/, "");
  vm.runInNewContext(script, context);
  return { document, context, get storedCookie() { return storedCookie; } };
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

test("runtime captures the native Window message method before wrapping it", () => {
  const script = runtimeScript();
  assert.match(script, /nativeWindowPrototypePostMessage = globalThis\.Window\?\.prototype\?\.postMessage/);
  assert.doesNotMatch(script, /nativeWindowPostMessage/);
});

test("runtime proxies cross-origin Worker scripts to avoid browser origin SecurityErrors", () => {
  const target = "https://discord.com/assets/login-worker.js";
  const result = runWorkerRuntime(target);
  const workerUrl = new URL(result.requestedScript);
  assert.equal(workerUrl.origin, "http://proxy.test");
  assert.equal(workerUrl.pathname, "/vanillia");
  assert.equal(workerUrl.searchParams.get("url"), target);
  assert.equal(result.requestedOptions.type, "module");

});

test("runtime bootstraps importScripts in script Blobs used by blob Workers", () => {
  const source = 'importScripts("/assets/chunk.js")';
  const result = runBlobWorkerRuntime(source);
  assert.equal(result.blob.parts.length, 2);
  assert.match(result.blob.parts[0], /nativeImportScripts/);
  assert.match(result.blob.parts[0], /proxyEndpoint\.href \+ encodeURIComponent\(target\.href\)/);
  assert.equal(result.blob.parts[1], source);

  let imported;
  const worker = {
    URL,
    location: { origin: "http://proxy.test" },
    importScripts(...urls) { imported = urls; }
  };
  vm.runInNewContext(result.blob.parts[0], worker);
  worker.importScripts("/assets/chunk.js");
  const chunk = new URL(imported[0]);
  assert.equal(chunk.origin, "http://proxy.test");
  assert.equal(chunk.pathname, "/vanillia");
  assert.equal(chunk.searchParams.get("url"), "https://discord.com/assets/chunk.js");
});

test("runtime leaves non-worker and non-script Blobs untouched", () => {
  const result = runBlobWorkerRuntime("self.onmessage = () => {};");
  assert.equal(result.blob.parts.length, 1);
  assert.equal(result.blob.parts[0], "self.onmessage = () => {};");
});

test("runtime rewrites Discord History API URLs to the proxy origin", () => {
  for (const method of ["pushState", "replaceState"]) {
    const result = runHistoryRuntime(method, "https://discord.com/");
    const assigned = new URL(result.requestedUrl, "http://proxy.test");
    assert.equal(assigned.origin, "http://proxy.test");
    assert.equal(assigned.pathname, "/vanillia");
    assert.equal(assigned.searchParams.get("url"), "https://discord.com/");
    assert.ok(!result.requestedUrl.startsWith("http://"));
    assert.deepEqual(result.requestedState, { route: "login" });
  }
});

test("runtime keeps same-origin proxied History URLs relative so Chromium accepts them", () => {
  const requestedUrl = runSameOriginHistoryRuntime();
  assert.ok(requestedUrl.startsWith("/vanillia?url="));
  assert.equal(new URL(requestedUrl, "http://proxy.test").origin, "http://proxy.test");
});

test("runtime preserves proxied Discord URLs passed to History API", () => {
  const url = "http://proxy.test/vanillia?url=" + encodeURIComponent("https://discord.com/register");
  const result = runHistoryRuntime("replaceState", url);
  const assigned = new URL(result.requestedUrl, "http://proxy.test");
  assert.equal(assigned.origin, "http://proxy.test");
  assert.equal(assigned.searchParams.get("url"), "https://discord.com/register");
});

test("runtime keeps Discord login and register links on the proxy origin", () => {
  for (const path of ["/login", "/register"]) {
    const target = `https://discord.com${path}`;
    const result = clickRuntimeLink(target);
    assert.equal(result.prevented, true);
    const assignedUrl = new URL(result.assigned, "http://proxy.test");
    assert.equal(assignedUrl.searchParams.get("url"), target);
    assert.equal(assignedUrl.origin, "http://proxy.test");
    assert.equal(assignedUrl.pathname, "/vanillia");
  }
});

test("runtime opens proxied Discord login in a requested new tab", () => {
  const target = "https://discord.com/login";
  const result = clickRuntimeLink(target, { target: "_blank" });
  assert.equal(result.prevented, true);
  assert.equal(result.opened[1], "_blank");
  const openedUrl = new URL(result.opened[0], "http://proxy.test");
  assert.equal(openedUrl.searchParams.get("url"), target);
  assert.equal(openedUrl.origin, "http://proxy.test");
  assert.equal(openedUrl.pathname, "/vanillia");
});

test("runtime lets modified clicks keep the rewritten proxied login link", () => {
  const target = "https://discord.com/login";
  const result = clickRuntimeLink(target, { ctrlKey: true });
  assert.equal(result.prevented, false);
  assert.equal(result.assigned, undefined);
});

test("runtime preserves duplex for proxied streaming Request fetches", async () => {
  const { fetchedRequest, fetchedInit } = await runStreamingRequestFetchRuntime();
  assert.equal(fetchedRequest.url, "http://proxy.test/vanillia?url=" + encodeURIComponent("https://www.google.com/rpc"));
  assert.equal(fetchedRequest.method, "POST");
  assert.equal(fetchedInit.duplex, "half");
});

test("runtime wraps proxy-window postMessage without recursing into the wrapper", () => {
  const { topArguments, frameArguments } = runProxyOriginPostMessageRuntime();
  for (const args of [topArguments, frameArguments]) {
    assert.equal(args[1], "http://proxy.test");
    assert.equal(args[0].origin, "https://accounts.google.com");
    assert.deepEqual(args[0].data, { type: "ready" });
  }
});

test("runtime scopes document cookies by upstream domain and only exposes each site's cookies", () => {
  const runtime = runCookieRuntime();
  runtime.document.cookie = "SID=google-session; Domain=.google.com; Path=/; Secure";
  assert.equal(runtime.document.cookie, "SID=google-session");
  assert.ok(runtime.storedCookie.startsWith("SID__vanilliapxy_google.com=google-session;"));
  runtime.context.__VANILLIAPXY_TARGET__ = "https://discord.com/";
  runtime.document.baseURI = "https://discord.com/";
  assert.equal(runtime.document.cookie, "");
  runtime.document.cookie = "SID=discord-session; Domain=discord.com; Path=/; Secure";
  assert.equal(runtime.document.cookie, "SID=discord-session");
  assert.ok(runtime.storedCookie.includes("SID__vanilliapxy_discord.com=discord-session"));
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

test("runtime routes Google search form submissions to /vanillia?q=", () => {
  const target = "https://www.google.com/";
  const result = submitRuntimeForm("get", target, [["q", "example search"], ["source", "hp"]]);
  assert.equal(result.prevented, true);
  assert.equal(result.assigned, "/vanillia?q=example+search&source=hp");
});

test("runtime recognizes Google country-domain search forms", () => {
  const target = "https://www.google.co.uk/";
  const result = submitRuntimeForm("get", target, [["q", "example search"]]);
  assert.equal(result.prevented, true);
  assert.equal(result.assigned, "/vanillia?q=example+search");
});

