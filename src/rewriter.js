import { rewriteSrcset, rewriteUrl } from "./url.js";

const attributePattern = /(\b(?:href|src|action|poster|cite|formaction|manifest|ping|background)\s*=\s*)(["'])(.*?)(\2)/gi;
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

export function proxyUrl(value, base, endpoint = "/vanillia?url=") {
  return rewriteUrl(value, base, endpoint);
}

export function rewriteCss(text, base, endpoint = "/vanillia?url=") {
  let output = cssPass(String(text ?? ""), base, endpoint);
  output = cssPass(output, base, endpoint);
  return output;
}

export function rewriteHtml(text, base, endpoint = "/vanillia?url=", runtime = "", iconHref = "") {
  let output = text.replace(attributePattern, (match, prefix, quote, value, closing) => {
    return `${prefix}${quote}${rewriteUrl(value, base, endpoint)}${closing}`;
  });

  output = output.replace(/(\bsrcset\s*=\s*)(["'])(.*?)(\2)/gi, (match, prefix, quote, value, closing) => {
    return `${prefix}${quote}${rewriteSrcset(value, base, endpoint)}${closing}`;
  });

  if (iconHref) {
    const iconTag = `<link rel="icon" data-vanillia-icon="true" href="${iconHref}">`;
    if (/<\/head\s*>/i.test(output)) output = output.replace(/<\/head\s*>/i, `${iconTag}</head>`);
    else output = `${iconTag}${output}`;
  }

  if (runtime && /<\/head\s*>/i.test(output)) output = output.replace(/<\/head\s*>/i, `${runtime}</head>`);
  else if (runtime) output = `${runtime}${output}`;
  return output;
}
