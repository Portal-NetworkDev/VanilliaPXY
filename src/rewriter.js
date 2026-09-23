import { rewriteSrcset, rewriteUrl } from "./url.js";

const urlAttributes = new Set([
  "href", "src", "action", "poster", "cite", "formaction", "manifest",
  "ping", "background", "data", "xlink:href"
]);
const attributePattern = /([\s<](?:[A-Za-z_:][\w:.-]*:)?[A-Za-z_:][\w:.-]*\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const srcsetPattern = /(\bsrcset\s*=\s*)(["'])(.*?)(\2)/gi;
const stylesheetLinkPattern = /<link\b[^>]*>/gi;
const protectedBlockPattern = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi;
const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
const cssImportPattern = /(@import\s+(?:url\(\s*)?)(["'])([^"']+)(\2)(\s*\)?)/gi;
const metaRefreshPattern = /(<meta\b[^>]*\bhttp-equiv\s*=\s*(["'])refresh\2[^>]*\bcontent\s*=\s*)(["'])(.*?)\3([^>]*>)/gi;

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
  return rewriteUrl(decodeHtmlAttribute(value), base, endpoint);
}

function rewriteCssValue(value, base, endpoint) {
  const input = String(value ?? "").trim();
  if (!input || /^(?:data:|blob:|about:|#)/i.test(input)) return value;
  return rewriteUrlValue(input, base, endpoint);
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

    return tag.replace(/(\bhref\s*=\s*)(["'])(.*?)(\2)/i, (match, prefix, quote, value, closing) => {
      return `${prefix}${quote}${rewriteUrlValue(value, base, endpoint)}${closing}`;
    }).replace(/(\bhref\s*=\s*)(?!["'])([^\s>]+)/i, (match, prefix, value) => {
      return `${prefix}${rewriteUrlValue(value, base, endpoint)}`;
    });
  });
}

function rewriteMetaRefresh(text, base, endpoint) {
  return text.replace(metaRefreshPattern, (match, prefix, quote, contentQuote, content, suffix) => {
    const rewritten = content.replace(/(^|;\s*)url\s*=\s*([^;]+)/i, (full, start, value) => {
      return `${start}url=${rewriteUrlValue(value.trim(), base, endpoint)}`;
    });
    return `${prefix}${contentQuote}${rewritten}${contentQuote}${suffix}`;
  });
}

export function proxyUrl(value, base, endpoint = "/vanillia?url=") {
  return rewriteUrlValue(value, base, endpoint);
}

export function rewriteCss(text, base, endpoint = "/vanillia?url=") {
  return cssPass(String(text ?? ""), base, endpoint);
}

export function rewriteHtml(text, base, endpoint = "/vanillia?url=", runtime = "", iconHref = "") {
  const protectedBlocks = [];
  let output = String(text ?? "").replace(protectedBlockPattern, (match, open, tagName, content, close) => {
    const index = protectedBlocks.push({ tagName: tagName.toLowerCase(), content }) - 1;
    return `${open}__VANILLIAPXY_PROTECTED_${index}__${close}`;
  });

  output = output.replace(attributePattern, (match, prefix, doubleQuoted, singleQuoted, unquoted) => {
    const attributeMatch = prefix.match(/(?:^|[\s<])((?:[A-Za-z_:][\w:.-]*:)?[A-Za-z_:][\w:.-]*)\s*=\s*$/);
    const name = attributeMatch?.[1]?.toLowerCase();
    if (!urlAttributes.has(name)) return match;

    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
    const rewritten = rewriteUrlValue(value, base, endpoint);

    if (doubleQuoted !== undefined) return `${prefix}"${rewritten}"`;
    if (singleQuoted !== undefined) return `${prefix}'${rewritten}'`;
    return `${prefix}${rewritten}`;
  });

  output = output.replace(srcsetPattern, (match, prefix, quote, value, closing) => {
    return `${prefix}${quote}${rewriteSrcset(value, base, endpoint)}${closing}`;
  });

  output = rewriteStylesheetLinks(output, base, endpoint);
  output = rewriteMetaRefresh(output, base, endpoint);

  output = output.replace(/__VANILLIAPXY_PROTECTED_(\d+)__/g, (match, index) => {
    const block = protectedBlocks[Number(index)];
    if (!block) return match;
    if (block.tagName === "style") return rewriteCss(block.content, base, endpoint);
    return block.content;
  });

  if (/<base\b/i.test(output)) {
    output = output.replace(/<base\b[^>]*>/i, `<base href="${escapeAttribute(base)}">`);
  } else if (/<head\b[^>]*>/i.test(output)) {
    output = output.replace(/<head\b[^>]*>/i, match => `${match}<base href="${escapeAttribute(base)}">`);
  } else {
    output = `<base href="${escapeAttribute(base)}">${output}`;
  }

  const headInjection = `${iconHref ? `<link rel="icon" data-vanillia-icon="true" href="${iconHref}">` : ""}${runtime}`;
  if (headInjection && /<head\b[^>]*>/i.test(output)) {
    output = output.replace(/<head\b[^>]*>/i, match => `${match}${headInjection}`);
  } else if (iconHref) {
    output = `${iconHref ? `<link rel="icon" data-vanillia-icon="true" href="${iconHref}">` : ""}${output}`;
    if (runtime) output = `${runtime}${output}`;
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
