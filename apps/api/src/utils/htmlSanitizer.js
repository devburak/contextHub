const URL_ATTRIBUTE_PATTERN = /[\s\n\r\t]+((?:href|src|xlink:href|formaction|action)\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi;
const EVENT_HANDLER_ATTRIBUTE_PATTERN = /[\s\n\r\t]+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi;
const STYLE_ATTRIBUTE_PATTERN = /[\s\n\r\t]+(style\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi;

const NAMED_ENTITIES = {
  amp: '&',
  apos: "'",
  colon: ':',
  gt: '>',
  lt: '<',
  quot: '"',
  tab: '\t',
  newline: '\n'
};

function decodeHtmlEntities(value = '') {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);?/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : match;
  });
}

function unwrapAttributeValue(value = '') {
  const text = String(value).trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function removeControlAndWhitespace(value = '') {
  return String(value)
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 32 && code !== 127;
    })
    .join('');
}

function normalizeProtocolValue(value = '') {
  return removeControlAndWhitespace(decodeHtmlEntities(value)).toLowerCase();
}

function isDangerousUrl(value = '') {
  const normalized = normalizeProtocolValue(value);
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html')
  );
}

function isDangerousStyle(value = '') {
  const decoded = decodeHtmlEntities(value).toLowerCase();
  const compact = removeControlAndWhitespace(decoded);

  if (
    compact.includes('expression(') ||
    compact.includes('javascript:') ||
    compact.includes('vbscript:') ||
    compact.includes('data:text/html') ||
    compact.includes('-moz-binding:') ||
    compact.includes('behavior:') ||
    compact.includes('@import')
  ) {
    return true;
  }

  return /url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi.test(decoded) && compact.includes('url(javascript:');
}

function sanitizeHtmlContent(html) {
  if (html === undefined || html === null || html === '') {
    return html;
  }

  return String(html)
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\/?\s*script\b[^>]*>/gi, '')
    .replace(EVENT_HANDLER_ATTRIBUTE_PATTERN, '')
    .replace(URL_ATTRIBUTE_PATTERN, (match, attributePrefix, rawValue) => {
      const value = unwrapAttributeValue(rawValue);
      return isDangerousUrl(value) ? '' : match;
    })
    .replace(STYLE_ATTRIBUTE_PATTERN, (match, attributePrefix, rawValue) => {
      const value = unwrapAttributeValue(rawValue);
      return isDangerousStyle(value) ? '' : match;
    });
}

module.exports = {
  sanitizeHtmlContent,
  isDangerousStyle,
  isDangerousUrl
};
