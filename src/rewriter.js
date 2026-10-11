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
const metaRefreshPattern = /(<meta\b[^>]*\bhttp-equiv\s*=\s*(["'])refresh\2[^>]*\bcontent\s*=\s*)(["'])(.*?)\3([^>]*>)/gi;
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
    if (!relMatch || !/\bstylesheet\b/i.test(relMatch[2])) return tag;
    return tag.replace(/(\bhref\s*=\s*)(["'])(.*?)(\2)/i, (match, prefix, quote, value) => {
      return `${prefix}${quote}${rewriteUrlValue(value, base, endpoint)}${quote}`;
    }).replace(/(\bhref\s*=\s*)(?!["'])([^\s>]+)/i, (match, prefix, value) => {
      return `${prefix}${rewriteUrlValue(value, base, endpoint)}`;
    });
  });
}

function rewriteMetaRefresh(text, base, endpoint) {
  return text.replace(metaRefreshPattern, (match, prefix, quote, contentQuote, content, suffix) => {
    const rewritten = content.replace(/(^|;\s*)url\s*=\s*([^;]+)/i, (full, start, value) => {
      const rawUrl = value.trim();
      const proxied = rewriteUrlValue(rawUrl, base, endpoint);
      return `${start}url=${proxied}`;
    });
    return `${prefix}${contentQuote}${rewritten}${contentQuote}${suffix}`;
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

export function proxyUrl(value, base, endpoint = "/vanillia?url=") {
  return rewriteUrlValue(value, base, endpoint);
}

export function rewriteCss(text, base, endpoint = "/vanillia?url=") {
  return cssPass(String(text ?? ""), base, endpoint);
}

export function rewriteHtml(text, base, endpoint = "/vanillia?url=", runtime = "", iconHref = "") {
  const effectiveBase = findBase(text, base);
  const protectedBlocks = [];
  let output = String(text ?? "").replace(protectedBlockPattern, (match, open, tagName, content, close) => {
    const index = protectedBlocks.push({ tagName: tagName.toLowerCase(), content }) - 1;
    return `${open}__VANILLIAPXY_PROTECTED_${index}__${close}`;
  });

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
    const rewritten = rewriteUrlValue(value, effectiveBase, endpoint);
    if (doubleQuoted !== undefined) return `${prefix}"${rewritten}"`;
    if (singleQuoted !== undefined) return `${prefix}'${rewritten}'`;
    return `${prefix}${rewritten}`;
  });

  output = rewriteStylesheetLinks(output, effectiveBase, endpoint);
  output = rewriteMetaRefresh(output, effectiveBase, endpoint);
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

  const headInjection = `${iconHref ? `<link rel="icon" data-vanillia-icon="true" href="${iconHref}">` : ""}${runtime}`;
  if (headInjection && /<head\b[^>]*>/i.test(output)) {
    output = output.replace(/<head\b[^>]*>/i, match => `${match}${headInjection}`);
  } else if (iconHref) {
    output = `<link rel="icon" data-vanillia-icon="true" href="${iconHref}">${runtime}${output}`;
  } else if (runtime) {
    output = `${runtime}${output}`;
  }

  return output;
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}
