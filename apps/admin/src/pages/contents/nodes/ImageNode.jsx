import { DecoratorNode } from 'lexical'
import ImageComponent from './ImageComponent.jsx'
import { DEFAULT_IMAGE_DIMENSION, normalizeImageLink } from './imageSettings.js'

export class ImageNode extends DecoratorNode {
  __src
  __altText
  __width
  __height
  __alignment
  __caption
  __showCaption
  __linkUrl
  __linkTarget
  __mediaId

  constructor({ src, altText = '', width = undefined, height = undefined, alignment = 'center', caption = '', showCaption = true, linkUrl = '', linkTarget = '_blank', mediaId = '' }, key) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__width = width
    this.__height = height
    this.__alignment = ['left', 'center', 'right'].includes(alignment) ? alignment : 'center'
    // Alt text is accessibility metadata; captions are optional editorial copy.
    this.__caption = caption || ''
    this.__showCaption = showCaption
    this.__linkUrl = normalizeImageLink(linkUrl || '') || ''
    this.__linkTarget = linkTarget === '_self' ? '_self' : '_blank'
    this.__mediaId = mediaId || ''
  }

  static getType() {
    return 'image'
  }

  static clone(node) {
    return new ImageNode(
      {
        src: node.__src,
        altText: node.__altText,
        width: node.__width,
        height: node.__height,
        alignment: node.__alignment,
        caption: node.__caption,
        showCaption: node.__showCaption,
        linkUrl: node.__linkUrl,
        linkTarget: node.__linkTarget,
        mediaId: node.__mediaId,
      },
      node.__key
    )
  }

  static importDOM() {
    return {
      figure: (domNode) => {
        if (!(domNode instanceof HTMLElement) || !domNode.querySelector('img')) {
          return null
        }
        return {
          conversion: convertImageFigureElement,
          priority: 3,
        }
      },
      img: (domNode) => {
        if (domNode instanceof HTMLImageElement) {
          return {
            conversion: convertImageElement,
            priority: 2,
          }
        }
        return null
      },
    }
  }

  static importJSON(serializedNode) {
    const { src, altText, width, height, alignment, caption, showCaption, linkUrl, linkTarget, mediaId, data } = serializedNode
    return $createImageNode({ src, altText, width, height, alignment, caption, showCaption, linkUrl, linkTarget, mediaId: mediaId || data?.contexthubMediaId || '' })
  }

  exportJSON() {
    const json = {
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
      alignment: this.__alignment,
      caption: this.__caption,
      showCaption: this.__showCaption,
      linkUrl: this.__linkUrl,
      linkTarget: this.__linkTarget,
    }
    if (this.__mediaId) {
      json.mediaId = this.__mediaId
    }
    return json
  }

  createDOM() {
    const span = document.createElement('span')
    span.className = 'editor-image-wrapper'
    return span
  }

  exportDOM() {
    const element = document.createElement('figure')
    element.className = `editor-image-container flex ${this.getAlignmentClassName()}`
    element.dataset.alignment = this.__alignment

    const wrapper = document.createElement('div')
    wrapper.className = 'relative inline-block max-w-full'

    const img = document.createElement('img')
    img.src = this.__src
    img.alt = this.__altText
    img.className = 'editor-image'
    img.loading = 'lazy'
    img.decoding = 'async'

    if (this.__width) {
      img.width = this.__width
      img.style.width = `${this.__width}px`
    }
    if (this.__height) {
      img.height = this.__height
      img.style.height = `${this.__height}px`
    }
    if (this.__mediaId) {
      img.dataset.contexthubMediaId = this.__mediaId
    }

    let content = img

    if (this.__linkUrl) {
      const anchor = document.createElement('a')
      anchor.href = this.__linkUrl
      anchor.target = this.__linkTarget || '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.appendChild(img)
      content = anchor
    }

    wrapper.appendChild(content)

    if (this.__showCaption && this.__caption) {
      const caption = document.createElement('figcaption')
      caption.className = 'editor-image-caption mt-2 whitespace-pre-line text-sm text-gray-600 text-center italic'
      caption.textContent = this.__caption
      wrapper.appendChild(caption)
    }

    element.appendChild(wrapper)
    return { element }
  }

  getAlignmentClassName() {
    switch (this.__alignment) {
      case 'left':
        return 'justify-start'
      case 'right':
        return 'justify-end'
      case 'center':
      default:
        return 'justify-center'
    }
  }

  updateDOM() {
    return false
  }

  decorate() {
    const element = (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        alignment={this.__alignment}
        caption={this.__caption}
        showCaption={this.__showCaption}
        linkUrl={this.__linkUrl}
        linkTarget={this.__linkTarget}
        nodeKey={this.getKey()}
        resizable={true}
      />
    )

    return element
  }

  setDimensions({ width, height }) {
    const writable = this.getWritable()
    writable.__width = typeof width === 'number' ? width : undefined
    writable.__height = typeof height === 'number' ? height : undefined
  }

  setSrc(src) {
    const writable = this.getWritable()
    writable.__src = src
  }

  setAltText(altText) {
    const writable = this.getWritable()
    writable.__altText = altText
  }

  setAlignment(alignment) {
    const writable = this.getWritable()
    writable.__alignment = ['left', 'center', 'right'].includes(alignment) ? alignment : 'center'
  }

  setCaption(caption) {
    const writable = this.getWritable()
    writable.__caption = caption
  }

  setShowCaption(showCaption) {
    const writable = this.getWritable()
    writable.__showCaption = showCaption
  }

  setLink({ url = '', target = '_blank' } = {}) {
    const writable = this.getWritable()
    writable.__linkUrl = normalizeImageLink(url || '') || ''
    writable.__linkTarget = target === '_self' ? '_self' : '_blank'
  }

  getLinkUrl() {
    return this.__linkUrl
  }

  getLinkTarget() {
    return this.__linkTarget
  }

  getSrc() {
    return this.__src
  }

  getAltText() {
    return this.__altText
  }

  getWidth() {
    return this.__width
  }

  getHeight() {
    return this.__height
  }

  getAlignment() {
    return this.__alignment
  }

  getCaption() {
    return this.__caption
  }

  getShowCaption() {
    return this.__showCaption
  }
}

export function $createImageNode({ src, altText = '', width, height, alignment = 'center', caption = '', showCaption = true, linkUrl = '', linkTarget = '_blank', mediaId = '' }) {
  return new ImageNode(
    {
      src,
      altText,
      width,
      height,
      alignment,
      caption,
      showCaption,
      linkUrl,
      linkTarget,
      mediaId,
    }
  )
}

export function $isImageNode(node) {
  return node instanceof ImageNode
}

export { DEFAULT_IMAGE_DIMENSION }

function convertImageFigureElement(domNode) {
  const image = domNode.querySelector('img')
  if (!(image instanceof HTMLImageElement)) {
    return null
  }

  const conversion = convertImageElement(image)
  if (!conversion) {
    return null
  }

  return {
    ...conversion,
    // The caption is already stored on ImageNode. Consuming the figure's
    // descendants prevents figcaption from becoming a second text block.
    forChild: () => null,
  }
}

function convertImageElement(domNode) {
  if (!(domNode instanceof HTMLImageElement)) {
    return null
  }

  const src = domNode.getAttribute('src') || ''
  if (!src) return null

  const altText = domNode.getAttribute('alt') || ''
  const widthAttr = domNode.getAttribute('width') || domNode.style.width
  const heightAttr = domNode.getAttribute('height') || domNode.style.height
  const width = widthAttr ? parseInt(widthAttr, 10) || undefined : undefined
  const height = heightAttr ? parseInt(heightAttr, 10) || undefined : undefined

  let alignment = 'center'
  const container = domNode.closest('figure, .editor-image-container')
  if (container?.dataset.alignment === 'left' || container?.classList.contains('justify-start')) {
    alignment = 'left'
  } else if (container?.dataset.alignment === 'right' || container?.classList.contains('justify-end')) {
    alignment = 'right'
  }

  const captionElement = container?.querySelector('figcaption, .editor-image-caption')
  const caption = captionElement?.textContent?.trim() || ''
  const showCaption = Boolean(caption)
  const anchor = domNode.closest('a')
  const linkUrl = anchor?.getAttribute('href') || ''
  const linkTarget = anchor?.getAttribute('target') || '_self'
  const mediaId = domNode.dataset.contexthubMediaId || ''

  return {
    node: $createImageNode({
      src,
      altText,
      width,
      height,
      alignment,
      caption,
      showCaption,
      linkUrl,
      linkTarget,
      mediaId,
    }),
  }
}
