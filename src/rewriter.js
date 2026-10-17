import { rewriteSrcset, rewriteUrl, isCaptchaResource } from "./url.js";

const urlAttributes = new Set([
  "href", "src", "action", "poster", "cite", "formaction", "manifest",
  "ping", "background", "data", "xlink:href"
]);
const attributePattern = /([\s<](?:[A-Za-z_:][\w:.-]*:)?[A-Za-z_:][\w:.-]*\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const stylesheetLinkPattern = /<link\b[^>]*>/gi;
const protectedBlockPattern = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi;
const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
const cssImportPattern = /(@import\s+(?:url\(\s*)?)(["'])([^"']+)(\2)(\s*\)?)/gi;
const baseHrefPattern = /<base\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/i;
const bareHostPattern = /^(?:(?:www|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.){2,}[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i;

function decodeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&#x([\da-f]+);/gi, (_, code) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    });
}

function rewriteUrlValue(value, base, endpoint) {
  const decoded = decodeHtmlAttribute(value);
  const normalized = bareHostPattern.test(decoded.trim()) ? `https://${decoded.trim()}` : decoded;
  return rewriteUrl(normalized, base, endpoint);
}

function rewriteCssValue(value, base, endpoint) {
  const input = String(value ?? "").trim();
  if (!input || /^(?:data:|blob:|about:|#)/i.test(input)) return value;
  const normalized = bareHostPattern.test(input) ? `https://${input}` : input;
  if (isCaptchaResource(normalized, base)) return value;
  return rewriteUrlValue(normalized, base, endpoint);
}

function cssPass(text, base, endpoint) {
  let output = text.replace(cssUrlPattern, (match, quote, value) => {
    const rewritten = rewriteCssValue(value, base, endpoint);
    return `url(${quote}${rewritten}${quote})`;
  });
  output = output.replace(cssImportPattern, (match, prefix, quote, value, closing) => {
    return `${prefix}${quote}${rewriteCssValue(value, base, endpoint)}${quote}${closing}`;
  });
  return output;
}

function rewriteStylesheetLinks(text, base, endpoint) {
  return text.replace(stylesheetLinkPattern, tag => {
    const relMatch = tag.match(/\brel\s*=\s*(["'])(.*?)\1/i);
    const asMatch = tag.match(/\bas\s*=\s*(["'])(.*?)\1/i);
    const isStylesheet = relMatch && /\bstylesheet\b/i.test(relMatch[2]);
    const isStylePreload = relMatch && /\bpreload\b/i.test(relMatch[2]) && asMatch?.[2].toLowerCase() === "style";
    if (!isStylesheet && !isStylePreload) return tag;

    let rewrittenHref = false;
    const rewrittenTag = tag.replace(/(\bhref\s*=\s*)(?:(["'])(.*?)\2|([^\s>]+))/i, (match, prefix, quote, quotedValue, unquotedValue) => {
      const value = quotedValue ?? unquotedValue;
      const rewritten = rewriteUrlValue(value, base, endpoint);
      rewrittenHref = rewritten !== value;
      return `${prefix}${quote ? `${quote}${rewritten}${quote}` : rewritten}`;
    });
    return rewrittenHref
      ? rewrittenTag.replace(/\s+integrity\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
      : rewrittenTag;
  });
}

function findBase(text, fallback) {
  const match = String(text ?? "").match(baseHrefPattern);
  if (!match) return fallback;
  try {
    const rawBase = decodeHtmlAttribute(match[2]);
    const baseValue = bareHostPattern.test(rawBase) ? `https://${rawBase}` : rawBase;
    const resolved = new URL(baseValue, fallback);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : fallback;
  } catch {
    return fallback;
  }
}

function directRedirectTargets(text, base) {
  const targets = new Set();
  const addTarget = value => {
    const target = decodeHtmlAttribute(String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2"));
    if (!target) return;
    try {
      const resolved = new URL(target, base);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") targets.add(resolved.href);
    } catch {}
  };

  for (const match of String(text ?? "").matchAll(/<meta\b[^>]*\bhttp-equiv\s*=\s*(["'])refresh\1[^>]*>/gi)) {
    const content = match[0].match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const value = content?.[1] ?? content?.[2] ?? content?.[3] ?? "";
    const redirect = value.match(/(?:^|;\s*)url\s*=\s*(.*)$/i);
    if (redirect) addTarget(redirect[1]);
  }

  for (const match of String(text ?? "").matchAll(/\b(?:window\s*\.\s*)?location(?:\s*\.\s*(?:href|assign|replace))?\s*(?:=\s*|\(\s*)(["'])(.*?)\1/gi)) {
    addTarget(match[2]);
  }
  return targets;
}

function isDiscordAuthTarget(value, base) {
  try {
    const target = new URL(decodeHtmlAttribute(value), base);
    return target.protocol === "https:" &&
      (target.hostname === "discord.com" || target.hostname === "www.discord.com") &&
      /^\/(?:login|register|verify|reset)(?:\/|$)/i.test(target.pathname);
  } catch {
    return false;
  }
}

function isDirectRedirectTarget(value, base, targets) {
  try {
    return targets.has(new URL(decodeHtmlAttribute(value), base).href);
  } catch {
    return false;
  }
}

export function proxyUrl(value, base, endpoint = "/vanillia?url=") {
  return rewriteUrlValue(value, base, endpoint);
}

export function rewriteCss(text, base, endpoint = "/vanillia?url=") {
  return cssPass(String(text ?? ""), base, endpoint);
}

export function rewriteWorkerScript(text, base, endpoint = "/vanillia?url=") {
  const workerOrigin = new URL(base).origin;
  const proxyBase = JSON.stringify(endpoint);
  const upstreamOrigin = JSON.stringify(workerOrigin);
  const bootstrap = `;(() => {
    const marker = Symbol.for("VanilliaPXY.worker-runtime");
    if (globalThis[marker] || globalThis[Symbol.for("VanilliaPXY.runtime")]) return;
    globalThis[marker] = true;
    const endpoint = ${proxyBase};
    const base = ${JSON.stringify(workerOrigin)};
    const proxy = value => {
      const input = String(value);
      try {
        const proxyEndpoint = new URL(endpoint, globalThis.location.href);
        const candidate = new URL(input, globalThis.location.href);
        if (candidate.origin === proxyEndpoint.origin && candidate.pathname === proxyEndpoint.pathname && candidate.searchParams.has("url")) return input;
        const target = /^(?:blob:|data:|about:)/i.test(input) ? new URL(input) : new URL(input, base);
        if (!/^https?:$/.test(target.protocol)) return input;
        const fragment = target.hash;
        target.hash = "";
        return endpoint + encodeURIComponent(target.href) + fragment;
      } catch { return input; }
    };
    const nativeImportScripts = globalThis.importScripts;
    if (nativeImportScripts) globalThis.importScripts = (...urls) => nativeImportScripts(...urls.map(proxy));
    if (globalThis.navigator?.serviceWorker && ${JSON.stringify(workerOrigin)} === new URL(base).origin) {
      const nativeRegister = globalThis.navigator.serviceWorker.register.bind(globalThis.navigator.serviceWorker);
      globalThis.navigator.serviceWorker.register = (scriptURL, options) => {
        const target = new URL(String(scriptURL), base);
        const proxyUrl = new URL(endpoint, globalThis.location.href);
        const registration = new URL("/service-worker.js", proxyUrl.origin);
        registration.searchParams.set("target", target.href);
        return nativeRegister(registration.href, options);
      };
    }
    const nativeFetch = globalThis.fetch;
    if (nativeFetch) globalThis.fetch = (input, init) => {
      if (typeof input === "string" || input instanceof URL) return nativeFetch(proxy(input), init);
      if (input instanceof Request) {
        const url = proxy(input.url);
        return nativeFetch(url === input.url ? input : new Request(url, input), init);
      }
      return nativeFetch(input, init);
    };
    const nativeOpen = globalThis.XMLHttpRequest?.prototype?.open;
    if (nativeOpen) globalThis.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      return nativeOpen.call(this, method, proxy(url), ...rest);
    };
    for (const name of ["Worker", "SharedWorker"]) {
      const Native = globalThis[name];
      if (!Native) continue;
      try { globalThis[name] = class extends Native { constructor(url, options) { super(proxy(url), options); } }; } catch {}
    }
  })();\n`;
  const source = String(text ?? "");
  const calls = /\bimportScripts\s*\(/g;
  let output = "";
  let cursor = 0;
  let match;

  while ((match = calls.exec(source))) {
    const open = calls.lastIndex - 1;
    let depth = 1;
    let quote = "";
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    let close = open + 1;

    for (; close < source.length; close++) {
      const char = source[close];
      const next = source[close + 1];
      if (lineComment) {
        if (char === "\\n" || char === "\\r") lineComment = false;
        continue;
      }
      if (blockComment) {
        if (char === "*" && next === "/") { blockComment = false; close++; }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === "/" && next === "/") { lineComment = true; close++; continue; }
      if (char === "/" && next === "*") { blockComment = true; close++; continue; }
      if (char === "\\\"" || char === "'" || char === "`") { quote = char; continue; }
      if (char === "(") depth++;
      else if (char === ")" && --depth === 0) break;
    }

    if (depth !== 0) break;
    const args = source.slice(open + 1, close);
    output += source.slice(cursor, match.index) + `importScripts(...[${args}].map(url => {
      const target = new URL(url, ${upstreamOrigin});
      if (target.origin !== ${upstreamOrigin}) return target.href;
      const fragment = target.hash;
      target.hash = "";
      return ${proxyBase} + encodeURIComponent(target.href) + fragment;
    }))`;
    cursor = close + 1;
    calls.lastIndex = cursor;
  }

  return bootstrap + output + source.slice(cursor);
}

export function rewriteHtml(text, base, endpoint = "/vanillia?url=", runtime = "", iconHref = "") {
  const effectiveBase = findBase(text, base);
  const directRedirects = directRedirectTargets(text, effectiveBase);
  const protectedBlocks = [];
  let output = String(text ?? "").replace(protectedBlockPattern, (match, open, tagName, content, close) => {
    const index = protectedBlocks.push({ tagName: tagName.toLowerCase(), content }) - 1;
    return `${open}__VANILLIAPXY_PROTECTED_${index}__${close}`;
  });

  output = rewriteStylesheetLinks(output, effectiveBase, endpoint);
  output = output.replace(attributePattern, (match, prefix, doubleQuoted, singleQuoted, unquoted) => {
    const attributeMatch = prefix.match(/(?:^|[\s<])((?:[A-Za-z_:][\w:.-]*:)?[A-Za-z_:][\w:.-]*)\s*=\s*$/);
    const name = attributeMatch?.[1]?.toLowerCase();
    if (name === "style") {
      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
      const rewritten = rewriteCss(decodeHtmlAttribute(value), effectiveBase, endpoint);
      if (doubleQuoted !== undefined) return `${prefix}"${rewritten}"`;
      if (singleQuoted !== undefined) return `${prefix}'${rewritten}'`;
      return `${prefix}${rewritten}`;
    }
    if (name === "srcset") {
      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
      const rewritten = rewriteSrcset(decodeHtmlAttribute(value), effectiveBase, endpoint);
      if (doubleQuoted !== undefined) return `${prefix}"${rewritten}"`;
      if (singleQuoted !== undefined) return `${prefix}'${rewritten}'`;
      return `${prefix}${rewritten}`;
    }
    if (!urlAttributes.has(name)) return match;
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
    if (name === "href" && !isDiscordAuthTarget(value, effectiveBase) && isDirectRedirectTarget(value, effectiveBase, directRedirects)) return match;
    const rewritten = rewriteUrlValue(value, effectiveBase, endpoint);
    if (doubleQuoted !== undefined) return `${prefix}"${rewritten}"`;
    if (singleQuoted !== undefined) return `${prefix}'${rewritten}'`;
    return `${prefix}${rewritten}`;
  });

  output = output.replace(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(["'])content-security-policy\1)[^>]*>/gi, "");
  output = output.replace(/__VANILLIAPXY_PROTECTED_(\d+)__/g, (match, index) => {
    const block = protectedBlocks[Number(index)];
    if (!block) return match;
    return block.tagName === "style" ? rewriteCss(block.content, effectiveBase, endpoint) : block.content;
  });

  if (/<base\b/i.test(output)) {
    output = output.replace(/<base\b[^>]*>/i, `<base href="${escapeAttribute(effectiveBase)}">`);
  } else if (/<head\b[^>]*>/i.test(output)) {
    output = output.replace(/<head\b[^>]*>/i, match => `${match}<base href="${escapeAttribute(effectiveBase)}">`);
  } else if (/<html\b[^>]*>/i.test(output)) {
    output = output.replace(/<html\b[^>]*>/i, match => `${match}<head><base href="${escapeAttribute(effectiveBase)}"></head>`);
  } else {
    output = `<base href="${escapeAttribute(effectiveBase)}">${output}`;
  }

  if (directRedirects.size) {
    const marker = '<meta data-vanillia-direct-redirect-page="true">';
    if (/<head\b[^>]*>/i.test(output)) output = output.replace(/<head\b[^>]*>/i, match => `${match}${marker}`);
    else output = `${marker}${output}`;
  }

  const redirectContext = directRedirects.size
    ? `<script>globalThis.__VANILLIAPXY_DIRECT_REDIRECTS__=${JSON.stringify([...directRedirects])};globalThis.__VANILLIAPXY_DIRECT_REDIRECT_PAGE__=true;</script>`
    : "";
  const iconInjection = iconHref ? `<link rel="icon" data-vanillia-icon="true" href="${iconHref}">` : "";
  const headInjection = `${redirectContext}${iconInjection}${runtime}`;
  if (headInjection && /<head\b[^>]*>/i.test(output)) {
    output = output.replace(/<head\b[^>]*>/i, match => `${match}${headInjection}`);
  } else if (iconInjection) {
    output = `${iconInjection}${redirectContext}${runtime}${output}`;
  } else if (runtime) {
    output = `${redirectContext}${runtime}${output}`;
  }

  return output;
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}
