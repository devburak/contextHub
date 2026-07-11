// WordPress'ten migrate edilen içeriklerin lexical alanı bozuk şekiller içerebiliyor:
// - root.children içinde node yerine diziye sarılı node'lar (ör. image node'ları `[ {...} ]`)
// - image node'larında string yerine Playground tarzı `{ editorState: { root: ... } }` caption objesi
// - blok seviyesine sızmış inline node'lar (text/linebreak/link)
// Bu modül, editöre verilmeden önce state'i Lexical'ın parse edebileceği hale getirir.

const ROOT_INLINE_TYPES = new Set(['text', 'linebreak', 'link', 'autolink'])

const createEmptyParagraph = (children = []) => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  textFormat: 0,
  direction: 'ltr',
  children,
})

const extractCaptionText = (caption) => {
  if (typeof caption === 'string') return caption
  if (!caption || typeof caption !== 'object') return ''
  const texts = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.text === 'string') texts.push(node.text)
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  walk(caption.editorState?.root || caption.root)
  return texts.join(' ').trim()
}

const normalizeNode = (node) => {
  if (Array.isArray(node)) {
    return node.flatMap(normalizeNode)
  }
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
    return []
  }

  const normalized = { ...node }

  if (Array.isArray(node.children)) {
    normalized.children = node.children.flatMap(normalizeNode)
  }

  if (node.type === 'image') {
    const caption = extractCaptionText(node.caption)
    normalized.caption = caption
    normalized.showCaption = Boolean(node.showCaption && caption)
    if (!normalized.width) delete normalized.width
    if (!normalized.height) delete normalized.height
  }

  return [normalized]
}

const wrapRootLevelInlines = (children) => {
  const result = []
  let inlineBuffer = []
  const flush = () => {
    if (inlineBuffer.length) {
      result.push(createEmptyParagraph(inlineBuffer))
      inlineBuffer = []
    }
  }
  children.forEach((child) => {
    if (ROOT_INLINE_TYPES.has(child.type)) {
      inlineBuffer.push(child)
    } else {
      flush()
      result.push(child)
    }
  })
  flush()
  return result
}

/**
 * Lexical state'i (string veya obje) normalize edip JSON string olarak döndürür.
 * Kullanılamaz durumdaysa `fallback` döner.
 */
export const normalizeLexicalStateString = (lexical, fallback) => {
  let parsed = lexical
  if (typeof lexical === 'string') {
    try {
      parsed = JSON.parse(lexical)
    } catch (error) {
      return fallback
    }
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.root || typeof parsed.root !== 'object') {
    return fallback
  }

  const flattened = Array.isArray(parsed.root.children)
    ? parsed.root.children.flatMap(normalizeNode)
    : []
  const children = wrapRootLevelInlines(flattened)

  return JSON.stringify({
    ...parsed,
    root: {
      ...parsed.root,
      children: children.length ? children : [createEmptyParagraph()],
    },
  })
}
