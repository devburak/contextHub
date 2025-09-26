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

  constructor({ src, altText = '', width = undefined, height = undefined, alignment = 'center', caption = '', showCaption = true }, key) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__width = width
    this.__height = height
    this.__alignment = alignment
    this.__caption = caption || altText // Default caption is altText
    this.__showCaption = showCaption
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
      },
      node.__key
    )
  }

  static importJSON(serializedNode) {
    const { src, altText, width, height, alignment, caption, showCaption } = serializedNode
    return $createImageNode({ src, altText, width, height, alignment, caption, showCaption })
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
    }
  }

  createDOM() {
    const span = document.createElement('span')
    span.className = 'editor-image-wrapper'
    return span
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

export function $createImageNode({ src, altText = '', width, height, alignment = 'center', caption = '', showCaption = true }) {
  return new ImageNode(
    {
      src,
      altText,
      width,
      height,
      alignment,
      caption: caption || altText, // Default caption is altText
      showCaption,
    }
  )
}

export function $isImageNode(node) {
  return node instanceof ImageNode
}

export { DEFAULT_IMAGE_DIMENSION }
