import { $isTextNode } from 'lexical'

const SAFE_INLINE_STYLES = [
  'background-color',
  'color',
  'font-family',
  'font-size',
]

function parseStyleString(style = '') {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((styles, declaration) => {
      const separator = declaration.indexOf(':')
      if (separator === -1) return styles
      const property = declaration.slice(0, separator).trim().toLowerCase()
      const value = declaration.slice(separator + 1).trim()
      if (property && value) styles[property] = value
      return styles
    }, {})
}

function styleObjectToString(styles) {
  return Object.entries(styles)
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ')
}

function unwrapElement(element) {
  if (!element?.parentNode) return
  const parent = element.parentNode
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}

export function sanitizeEditorHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return ''
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser is not available in this environment.')
  }

  const document = new DOMParser().parseFromString(rawHtml, 'text/html')
  document.querySelectorAll('script, style, meta, link, object').forEach((element) => element.remove())

  document.body?.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name)
        return
      }
      if ((name === 'src' || name === 'href') && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name)
        return
      }
      if (name === 'style') {
        const styles = parseStyleString(attribute.value)
        delete styles['white-space']
        const cleanedStyle = styleObjectToString(styles)
        if (cleanedStyle) element.setAttribute('style', cleanedStyle)
        else element.removeAttribute('style')
      }
    })
  })

  document.body?.querySelectorAll('span').forEach((span) => {
    if (!span.getAttribute('style') && !span.getAttribute('dir') && !span.getAttribute('lang')) {
      unwrapElement(span)
    }
  })

  return document.body?.innerHTML?.trim() || ''
}

function convertStyledSpan(element) {
  const styles = parseStyleString(element.getAttribute('style') || '')
  const decoration = styles['text-decoration'] || ''
  const safeStyles = SAFE_INLINE_STYLES.reduce((result, property) => {
    if (styles[property]) result[property] = styles[property]
    return result
  }, {})

  return {
    node: null,
    forChild: (node) => {
      if (!$isTextNode(node)) return node

      const enableFormat = (format, enabled) => {
        if (enabled && !node.hasFormat(format)) node.toggleFormat(format)
      }

      enableFormat('bold', styles['font-weight'] === 'bold' || Number(styles['font-weight']) >= 600)
      enableFormat('italic', styles['font-style'] === 'italic')
      enableFormat('underline', decoration.includes('underline'))
      enableFormat('strikethrough', decoration.includes('line-through'))
      enableFormat('subscript', styles['vertical-align'] === 'sub')
      enableFormat('superscript', styles['vertical-align'] === 'super')

      const inlineStyle = styleObjectToString(safeStyles)
      if (inlineStyle) node.setStyle(inlineStyle)
      return node
    },
  }
}

export const editorHtmlImport = {
  span: (_element) => ({
    conversion: convertStyledSpan,
    priority: 4,
  }),
}
