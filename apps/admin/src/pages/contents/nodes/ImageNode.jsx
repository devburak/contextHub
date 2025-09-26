import { DecoratorNode } from 'lexical'
import ImageComponent, { DEFAULT_IMAGE_DIMENSION } from './ImageComponent.jsx'

export class ImageNode extends DecoratorNode {
  __src
  __altText
  __width
  __height

  constructor({ src, altText = '', width = undefined, height = undefined }, key) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__width = width
    this.__height = height
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
      },
      node.__key
    )
  }

  static importJSON(serializedNode) {
    const { src, altText, width, height } = serializedNode
    return $createImageNode({ src, altText, width, height })
  }

  exportJSON() {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
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

  getSrc() {
    return this.__src
  }

  getAltText() {
    return this.__altText
  }
}

export function $createImageNode({ src, altText = '', width, height }) {
  return new ImageNode(
    {
      src,
      altText,
      width,
      height,
    }
  )
}

export function $isImageNode(node) {
  return node instanceof ImageNode
}

export { DEFAULT_IMAGE_DIMENSION }
