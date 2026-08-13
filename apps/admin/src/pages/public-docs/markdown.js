import { marked } from 'marked'

const DANGEROUS_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'META',
  'LINK',
  'BASE',
  'SVG',
  'MATH',
])

const ALLOWED_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'P', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE',
  'PRE', 'CODE', 'STRONG', 'EM', 'DEL', 'HR', 'BR',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
])

export function slugifyHeading(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

function isSafeUrl(value) {
  const href = String(value || '').trim()
  if (!href) return false
  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
    return true
  }
  try {
    const url = new URL(href)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
  } catch {
    return false
  }
}

function rewriteDocumentationLink(href) {
  const match = /^(?:\.\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md(#[a-z0-9-]+)?$/i.exec(href)
  return match ? `/docs/${match[1]}${match[2] || ''}` : href
}

function unwrapElement(element) {
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}

export function renderDocumentationMarkdown(markdown, { locale = 'en' } = {}) {
  const unsafeHtml = marked.parse(String(markdown || ''), {
    gfm: true,
    breaks: false,
  })
  const parser = new DOMParser()
  const document = parser.parseFromString(`<main>${unsafeHtml}</main>`, 'text/html')
  const root = document.body.firstElementChild

  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (DANGEROUS_TAGS.has(element.tagName)) element.remove()
  }

  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      unwrapElement(element)
      continue
    }

    const originalHref = element.tagName === 'A' ? element.getAttribute('href') || '' : ''

    for (const attribute of Array.from(element.attributes)) {
      const keepCodeClass =
        element.tagName === 'CODE' &&
        attribute.name === 'class' &&
        /^language-[a-z0-9_-]+$/i.test(attribute.value)
      if (!keepCodeClass) element.removeAttribute(attribute.name)
    }

    if (element.tagName === 'A') {
      if (!isSafeUrl(originalHref)) {
        element.removeAttribute('href')
        continue
      }
      const href = rewriteDocumentationLink(originalHref)
      element.setAttribute('href', href)
      if (/^https?:\/\//i.test(href)) {
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noreferrer noopener')
      }
    }
  }

  const headings = []
  const headingOccurrences = new Map()
  for (const heading of root.querySelectorAll('h1, h2, h3')) {
    const title = heading.textContent.trim()
    const baseId = slugifyHeading(title)
    const count = headingOccurrences.get(baseId) || 0
    headingOccurrences.set(baseId, count + 1)
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`
    heading.setAttribute('id', id)
    headings.push({ id, title, depth: Number(heading.tagName.slice(1)) })
  }

  let codeIndex = 0
  for (const code of root.querySelectorAll('pre > code')) {
    const language = Array.from(code.classList)
      .find((className) => className.startsWith('language-'))
      ?.slice('language-'.length)
    const isPrompt = language === 'prompt'
    const pre = code.parentElement
    const card = document.createElement('div')
    const toolbar = document.createElement('div')
    const toolbarLabel = document.createElement('span')
    const button = document.createElement('button')

    card.className = `docs-code-card${isPrompt ? ' is-prompt' : ''}`
    card.setAttribute('data-code-index', String(codeIndex))
    toolbar.className = 'docs-code-toolbar'
    toolbarLabel.className = 'docs-code-label'
    toolbarLabel.textContent = isPrompt
      ? 'AGENT PROMPT · ENGLISH'
      : (language ? language.toUpperCase() : 'SOURCE')
    button.setAttribute('type', 'button')
    button.setAttribute('data-docs-copy', String(codeIndex))
    button.setAttribute('data-copy-kind', isPrompt ? 'prompt' : 'code')
    button.setAttribute(
      'aria-label',
      locale === 'tr'
        ? (isPrompt ? 'Promptu kopyala' : 'Kodu kopyala')
        : (isPrompt ? 'Copy prompt' : 'Copy code'),
    )
    button.className = 'docs-copy-button'
    button.textContent = locale === 'tr'
      ? (isPrompt ? 'PROMPTU KOPYALA' : 'KOPYALA')
      : (isPrompt ? 'COPY PROMPT' : 'COPY')

    pre.parentElement.insertBefore(card, pre)
    toolbar.append(toolbarLabel, button)
    card.append(toolbar, pre)
    codeIndex += 1
  }

  return { html: root.innerHTML, headings }
}
