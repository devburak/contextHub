import { DecoratorNode } from 'lexical'
import { detectVideoProvider } from '../../../utils/externalMedia.js'
import { $createVideoNode } from './VideoNode.jsx'
import EmbedComponent from './EmbedComponent.jsx'

const ALLOWED_IFRAME_ATTRIBUTES = new Set([
  'src',
  'title',
  'width',
  'height',
  'allow',
  'allowfullscreen',
  'referrerpolicy',
  'loading',
  'frameborder',
  'style',
  'class',
  'name',
  'id',
  'sandbox',
  'aria-label',
  'aria-hidden',
  'tabindex',
])

const BOOLEAN_ATTRIBUTES = new Set(['allowfullscreen'])

export class EmbedNode extends DecoratorNode {
  __src
  __attributes

  constructor({ src, attributes } = {}, key) {
    super(key)
    const sanitized = sanitizeAttributes({ ...(attributes || {}), src })
    this.__attributes = sanitized
    this.__src = sanitized.src || ''
  }

  static getType() {
    return 'iframe-embed'
  }

  static clone(node) {
    return new EmbedNode(
      {
        src: node.__src,
        attributes: node.__attributes,
      },
      node.__key
    )
  }

  static importJSON(serializedNode) {
    const { src, attributes } = serializedNode
    return $createEmbedNode({ src, attributes })
  }

  exportJSON() {
    return {
      type: 'iframe-embed',
      version: 1,
      src: this.__src,
      attributes: { ...(this.__attributes || {}) },
    }
  }

  static importDOM() {
    return {
      iframe: () => ({
        conversion: convertEmbedElement,
        priority: 3,
      }),
    }
  }

  exportDOM() {
    const iframe = document.createElement('iframe')
    const attributes = this.__attributes || {}
    const src = this.__src

    if (src) {
      iframe.setAttribute('src', src)
    }

    Object.entries(attributes).forEach(([name, value]) => {
      if (!value && !BOOLEAN_ATTRIBUTES.has(name)) {
        return
      }
      iframe.setAttribute(name, value)
    })

    if (!iframe.hasAttribute('loading')) {
      iframe.setAttribute('loading', 'lazy')
    }

    return { element: iframe }
  }

  createDOM() {
    const span = document.createElement('span')
    span.className = 'editor-embed-wrapper'
    return span
  }

  updateDOM() {
    return false
  }

  decorate() {
    return <EmbedComponent nodeKey={this.getKey()} src={this.__src} attributes={this.__attributes} />
  }

  getSrc() {
    return this.__src
  }

  getAttributes() {
    return this.__attributes
  }
}

export function $createEmbedNode(payload) {
  return new EmbedNode(payload || {})
}

export function $isEmbedNode(node) {
  return node instanceof EmbedNode
}

function convertEmbedElement(domNode) {
  if (!(domNode instanceof HTMLIFrameElement)) {
    return null
  }

  const src = domNode.getAttribute('src')?.trim()
  if (!src) {
    return null
  }

  const dataset = domNode.dataset || {}
  const { provider, providerId } = detectVideoProvider(src)

  if (provider) {
    const payload = {
      url: dataset.url || src,
      externalUrl: dataset.externalUrl || src,
      provider: dataset.provider || provider,
      providerId: dataset.providerId || providerId,
      thumbnailUrl: dataset.thumbnail || null,
      title: domNode.getAttribute('title') || dataset.title || '',
      caption: dataset.caption || '',
      mimeType: dataset.mimeType || null,
    }

    if (typeof dataset.duration === 'string' && dataset.duration.trim() !== '') {
      const parsedDuration = Number(dataset.duration)
      if (!Number.isNaN(parsedDuration)) {
        payload.duration = parsedDuration
      }
    }

    return {
      node: $createVideoNode(payload),
    }
  }

  const attributes = {}
  Array.from(domNode.attributes).forEach(({ name, value }) => {
    attributes[name.toLowerCase()] = value
  })

  return {
    node: $createEmbedNode({ src, attributes }),
  }
}

function sanitizeAttributes(rawAttributes = {}) {
  const cleaned = {}
  Object.entries(rawAttributes).forEach(([rawName, rawValue]) => {
    if (!rawName) return
    const name = rawName.toLowerCase()
    if (name.startsWith('on')) {
      return
    }

    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue
    const isAllowed =
      ALLOWED_IFRAME_ATTRIBUTES.has(name) ||
      name.startsWith('data-') ||
      name.startsWith('aria-')

    if (!isAllowed) {
      return
    }

    if ((value === '' || value === null || typeof value === 'undefined') && !BOOLEAN_ATTRIBUTES.has(name)) {
      return
    }

    cleaned[name] = value === undefined || value === null ? '' : String(value)
  })

  if (!cleaned.src && typeof rawAttributes.src === 'string') {
    cleaned.src = rawAttributes.src.trim()
  }

  return cleaned
}
