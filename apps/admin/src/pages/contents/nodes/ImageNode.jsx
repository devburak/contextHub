import { DecoratorNode } from 'lexical'
import ImageComponent, { DEFAULT_IMAGE_DIMENSION } from './ImageComponent.jsx'

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

  constructor({ src, altText = '', width = undefined, height = undefined, alignment = 'center', caption = '', showCaption = true, linkUrl = '', linkTarget = '_blank' }, key) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__width = width
    this.__height = height
    this.__alignment = alignment
    this.__caption = caption || altText // Default caption is altText
    this.__showCaption = showCaption
    this.__linkUrl = linkUrl || ''
    this.__linkTarget = linkTarget || '_blank'
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
      },
      node.__key
    )
  }

  static importDOM() {
    return {
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
    const { src, altText, width, height, alignment, caption, showCaption, linkUrl, linkTarget } = serializedNode
    return $createImageNode({ src, altText, width, height, alignment, caption, showCaption, linkUrl, linkTarget })
  }

  exportJSON() {
    return {
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
  }

  createDOM() {
    const span = document.createElement('span')
    span.className = 'editor-image-wrapper'
    return span
  }

  exportDOM() {
    const element = document.createElement('div')
    element.className = `editor-image-container flex ${this.getAlignmentClassName()}`

    const wrapper = document.createElement('div')
    wrapper.className = 'relative inline-block max-w-full'

    const img = document.createElement('img')
    img.src = this.__src
    img.alt = this.__altText
    img.className = 'editor-image'

    if (this.__width) {
      img.style.width = `${this.__width}px`
    }
    if (this.__height) {
      img.style.height = `${this.__height}px`
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
      const caption = document.createElement('div')
      caption.className = 'mt-2 text-sm text-gray-600 text-center italic'
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
    writable.__width = typeof width === 'number' ? width : writable.__width
    writable.__height = typeof height === 'number' ? height : writable.__height
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
    writable.__alignment = alignment
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
    writable.__linkUrl = url || ''
    writable.__linkTarget = target || '_blank'
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

export function $createImageNode({ src, altText = '', width, height, alignment = 'center', caption = '', showCaption = true, linkUrl = '', linkTarget = '_blank' }) {
  return new ImageNode(
    {
      src,
      altText,
      width,
      height,
      alignment,
      caption: caption || altText, // Default caption is altText
      showCaption,
      linkUrl,
      linkTarget,
    }
  )
}

export function $isImageNode(node) {
  return node instanceof ImageNode
}

export { DEFAULT_IMAGE_DIMENSION }

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
  const container = domNode.closest('.editor-image-container')
  if (container?.classList.contains('justify-start')) {
    alignment = 'left'
  } else if (container?.classList.contains('justify-end')) {
    alignment = 'right'
  }

  const captionElement = domNode.parentElement?.querySelector('.mt-2, figcaption')
  const caption = captionElement?.textContent?.trim() || ''
  const showCaption = Boolean(caption)

  return {
    node: $createImageNode({ src, altText, width, height, alignment, caption, showCaption }),
  }
}
