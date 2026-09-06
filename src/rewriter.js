import { rewriteSrcset, rewriteUrl } from "./url.js";

const attributePattern = /(\b(?:href|src|action|poster|cite|formaction|manifest|ping|background)\s*=\s*)(["'])(.*?)(\2)/gi;
const srcsetPattern = /(\bsrcset\s*=\s*)(["'])(.*?)(\2)/gi;
const stylesheetLinkPattern = /<link\b[^>]*>/gi;
const protectedBlockPattern = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
const cssImportPattern = /(@import\s+(?:url\(\s*)?)(["'])([^"']+)(\2)(\s*\)?)/gi;

function rewriteCssValue(value, base, endpoint) {
  const input = String(value ?? "").trim();
  if (!input || /^(?:data:|blob:|about:|#)/i.test(input)) return value;
  return rewriteUrl(input, base, endpoint);
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
      return `${prefix}${quote}${rewriteUrl(value, base, endpoint)}${closing}`;
    }).replace(/(\bhref\s*=\s*)(?!["'])([^\s>]+)/i, (match, prefix, value) => {
      return `${prefix}${rewriteUrl(value, base, endpoint)}`;
    });
  });
}

export function proxyUrl(value, base, endpoint = "/vanillia?url=") {
  return rewriteUrl(value, base, endpoint);
}

export function rewriteCss(text, base, endpoint = "/vanillia?url=") {
  let output = cssPass(String(text ?? ""), base, endpoint);
  output = cssPass(output, base, endpoint);
  return output;
}

export function rewriteHtml(text, base, endpoint = "/vanillia?url=", runtime = "", iconHref = "") {
  const protectedBlocks = [];
  let output = String(text ?? "").replace(protectedBlockPattern, match => {
    const index = protectedBlocks.push(match) - 1;
    return `__VANILLIAPXY_PROTECTED_${index}__`;
  });

  output = output.replace(attributePattern, (match, prefix, quote, value, closing) => {
    return `${prefix}${quote}${rewriteUrl(value, base, endpoint)}${closing}`;
  });

  output = output.replace(srcsetPattern, (match, prefix, quote, value, closing) => {
    return `${prefix}${quote}${rewriteSrcset(value, base, endpoint)}${closing}`;
  });

  output = rewriteStylesheetLinks(output, base, endpoint);

  output = output.replace(/__VANILLIAPXY_PROTECTED_(\d+)__/g, (match, index) => {
    const block = protectedBlocks[Number(index)];
    if (!block) return match;
    if (/^<style\b/i.test(block)) {
      return block.replace(/^(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)$/i, (full, open, css, close) => {
        return `${open}${rewriteCss(css, base, endpoint)}${close}`;
      });
    }
    return block;
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
