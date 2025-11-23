import { DecoratorNode } from 'lexical'
import GalleryComponent from './GalleryComponent.jsx'

export function getGalleryLayoutForCount(count) {
    if (!count || count <= 1) {
        return '1-column'
    }
    if (count % 3 === 0) {
        return '3-columns'
    }
    if (count % 2 === 0) {
        return '2-columns'
    }
    return '1-column'
}

export class GalleryNode extends DecoratorNode {
    __images
    __layout // '2-columns', '3-columns', '1-column'

    constructor({ images, layout = '2-columns' }, key) {
        super(key)
        const safeImages = Array.isArray(images) ? images : []
        this.__images = safeImages
        this.__layout = layout || getGalleryLayoutForCount(safeImages.length)
    }

    static getType() {
        return 'gallery'
    }

    static clone(node) {
        return new GalleryNode(
            {
                images: node.__images,
                layout: node.__layout,
            },
            node.__key
        )
    }

    static importJSON(serializedNode) {
        const { images, layout } = serializedNode
        return $createGalleryNode({
            images,
            layout: layout || getGalleryLayoutForCount(Array.isArray(images) ? images.length : 0),
        })
    }

    static importDOM() {
        return {
            div: (domNode) => {
                if (!(domNode instanceof HTMLDivElement)) {
                    return null
                }

                if (!domNode.classList.contains('editor-gallery')) {
                    return null
                }

                return {
                    conversion: convertGalleryElement,
                    priority: 2,
                }
            },
        }
    }

    exportJSON() {
        return {
            type: 'gallery',
            version: 1,
            images: this.__images,
            layout: this.__layout,
        }
    }

    exportDOM() {
        const element = document.createElement('div')
        element.className = `editor-gallery grid gap-4 ${this.__layout === '3-columns'
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            : this.__layout === '2-columns'
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-1'
            }`
        element.setAttribute('data-lexical-gallery', 'true')
        element.setAttribute('data-layout', this.__layout || '')

        try {
            element.setAttribute('data-images', encodeURIComponent(JSON.stringify(this.__images || [])))
        } catch (error) {
            console.warn('[GalleryNode] Failed to encode images for export', error)
        }

        const images = Array.isArray(this.__images) ? this.__images : []
        images.forEach((image) => {
            const figure = document.createElement('figure')
            figure.className = 'editor-gallery__item flex items-center justify-center overflow-hidden rounded-lg bg-gray-100'

            const img = document.createElement('img')
            img.src = image.src
            img.alt = image.altText || ''
            if (image.width) img.width = image.width
            if (image.height) img.height = image.height
            img.loading = 'lazy'
            img.style.width = '100%'
            img.style.height = 'auto'
            img.style.objectFit = 'contain'
            img.style.display = 'block'

            figure.appendChild(img)
            element.appendChild(figure)
        })

        return { element }
    }

    setImages(nextImages) {
        const writable = this.getWritable()
        const safeImages = Array.isArray(nextImages) ? nextImages : []
        writable.__images = safeImages
        writable.__layout = getGalleryLayoutForCount(safeImages.length)
    }

    updateImageAt(index, nextImage) {
        if (typeof index !== 'number' || !nextImage) return
        const writable = this.getWritable()
        const cloned = Array.isArray(writable.__images) ? [...writable.__images] : []
        if (!cloned[index]) return
        cloned[index] = nextImage
        writable.__images = cloned
    }

    removeImageAt(index) {
        if (typeof index !== 'number') return
        const writable = this.getWritable()
        const cloned = Array.isArray(writable.__images) ? [...writable.__images] : []
        if (!cloned[index]) return
        cloned.splice(index, 1)
        if (!cloned.length) {
            this.remove()
            return
        }
        writable.__images = cloned
        writable.__layout = getGalleryLayoutForCount(cloned.length)
    }

    setLayout(layout) {
        const writable = this.getWritable()
        writable.__layout = layout || getGalleryLayoutForCount(Array.isArray(writable.__images) ? writable.__images.length : 0)
    }

    createDOM() {
        const div = document.createElement('div')
        div.className = 'editor-gallery-wrapper'
        return div
    }

    updateDOM() {
        return false
    }

    decorate() {
        return (
            <GalleryComponent
                images={this.__images}
                layout={this.__layout}
                nodeKey={this.getKey()}
            />
        )
    }
}

export function $createGalleryNode({ images, layout }) {
    return new GalleryNode({ images, layout })
}

export function $isGalleryNode(node) {
    return node instanceof GalleryNode
}

function convertGalleryElement(domNode) {
    const layoutFromClass = domNode.classList.contains('lg:grid-cols-3')
        ? '3-columns'
        : domNode.classList.contains('sm:grid-cols-2')
            ? '2-columns'
            : domNode.dataset.layout || '1-column'

    const imagesFromData = parseImagesFromDataAttribute(domNode.getAttribute('data-images'))

    const images = imagesFromData.length ? imagesFromData : extractImagesFromDom(domNode)
    if (!images.length) {
        return null
    }

    return {
        node: $createGalleryNode({
            images,
            layout: layoutFromClass || getGalleryLayoutForCount(images.length),
        }),
    }
}

function parseImagesFromDataAttribute(dataAttr) {
    if (!dataAttr) return []
    try {
        const decoded = decodeURIComponent(dataAttr)
        const parsed = JSON.parse(decoded)
        if (Array.isArray(parsed)) {
            return parsed.filter((img) => img && typeof img.src === 'string' && img.src.trim())
        }
    } catch (error) {
        console.warn('[GalleryNode] Failed to parse gallery data-images attribute', error)
    }
    return []
}

function extractImagesFromDom(domNode) {
    const images = []
    const imageElements = Array.from(domNode.querySelectorAll('img'))
    imageElements.forEach((img) => {
        const src = img.getAttribute('src') || ''
        if (!src) return
        const widthAttr = img.getAttribute('width') || img.style.width
        const heightAttr = img.getAttribute('height') || img.style.height
        const width = widthAttr ? parseInt(widthAttr, 10) || undefined : undefined
        const height = heightAttr ? parseInt(heightAttr, 10) || undefined : undefined
        images.push({
            src,
            altText: img.getAttribute('alt') || '',
            width,
            height,
        })
    })
    return images
}
