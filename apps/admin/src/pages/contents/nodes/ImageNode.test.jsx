import { $getRoot, createEditor } from 'lexical'
import { $generateNodesFromDOM } from '@lexical/html'
import { describe, expect, it } from 'vitest'
import { $createImageNode, ImageNode } from './ImageNode.jsx'
import {
  clampImageDimension,
  getDisplayDimensions,
  normalizeImageLink,
} from './imageSettings.js'

function readImageNode(payload) {
  const editor = createEditor({
    nodes: [ImageNode],
    onError(error) {
      throw error
    },
  })
  let result

  editor.update(() => {
    const node = $createImageNode(payload)
    $getRoot().append(node)
    result = {
      altText: node.getAltText(),
      caption: node.getCaption(),
      showCaption: node.getShowCaption(),
      width: node.getWidth(),
      height: node.getHeight(),
    }
  }, { discrete: true })

  return result
}

describe('ImageNode caption defaults', () => {
  it('does not copy alt text into a new image caption', () => {
    expect(readImageNode({ src: '/image.jpg', altText: 'Erişilebilir görsel açıklaması' })).toEqual({
      altText: 'Erişilebilir görsel açıklaması',
      caption: '',
      showCaption: true,
      width: undefined,
      height: undefined,
    })
  })

  it('preserves an explicitly supplied caption', () => {
    expect(readImageNode({
      src: '/image.jpg',
      altText: 'Erişilebilir görsel açıklaması',
      caption: 'Editoryal caption',
    }).caption).toBe('Editoryal caption')
  })
})

describe('ImageNode editable attributes', () => {
  it('preserves dimensions in JSON and emits semantic, escaped HTML', () => {
    const editor = createEditor({ nodes: [ImageNode], onError: (error) => { throw error } })
    let json
    let html

    editor.update(() => {
      const node = $createImageNode({
        src: '/image.jpg',
        altText: 'Ekip fotoğrafı',
        width: 720,
        height: 480,
        alignment: 'right',
        caption: '<script>alert(1)</script>',
        linkUrl: '/hakkimizda',
        linkTarget: '_self',
      })
      $getRoot().append(node)
      json = node.exportJSON()
      html = node.exportDOM().element.outerHTML
    }, { discrete: true })

    expect(json).toMatchObject({
      width: 720,
      height: 480,
      alignment: 'right',
      linkUrl: '/hakkimizda',
    })
    expect(html).toContain('<figure')
    expect(html).toContain('<figcaption')
    expect(html).toContain('width="720"')
    expect(html).toContain('height="480"')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('can return dimensions to automatic sizing', () => {
    const editor = createEditor({ nodes: [ImageNode], onError: (error) => { throw error } })
    let dimensions

    editor.update(() => {
      const node = $createImageNode({ src: '/image.jpg', width: 640, height: 360 })
      $getRoot().append(node)
      node.setDimensions({ width: undefined, height: undefined })
      dimensions = [node.getWidth(), node.getHeight()]
    }, { discrete: true })

    expect(dimensions).toEqual([undefined, undefined])
  })

  it('normalizes unsupported alignment and executable links at the node boundary', () => {
    const editor = createEditor({ nodes: [ImageNode], onError: (error) => { throw error } })
    let attributes

    editor.update(() => {
      const node = $createImageNode({
        src: '/image.jpg',
        alignment: 'floating',
        linkUrl: 'javascript:alert(1)',
        linkTarget: 'popup',
      })
      $getRoot().append(node)
      attributes = [node.getAlignment(), node.getLinkUrl(), node.getLinkTarget()]
    }, { discrete: true })

    expect(attributes).toEqual(['center', '', '_blank'])
  })

  it('imports a figure caption only as image metadata', () => {
    const editor = createEditor({ nodes: [ImageNode], onError: (error) => { throw error } })
    const document = new DOMParser().parseFromString(`
      <figure class="editor-image-container" data-alignment="center">
        <div><img src="/team.jpg" alt="Ekip"><figcaption>Yıllık ekip buluşması</figcaption></div>
      </figure>
    `, 'text/html')
    let result

    editor.update(() => {
      const nodes = $generateNodesFromDOM(editor, document)
      $getRoot().append(...nodes)
      const children = $getRoot().getChildren()
      result = {
        nodeCount: children.length,
        nodeType: children[0]?.getType(),
        caption: children[0]?.getCaption(),
        trailingText: children.slice(1).map((node) => node.getTextContent()).join(''),
      }
    }, { discrete: true })

    expect(result).toEqual({
      nodeCount: 1,
      nodeType: 'image',
      caption: 'Yıllık ekip buluşması',
      trailingText: '',
    })
  })

})

describe('image setting boundaries', () => {
  it('clamps dimensions to the supported HTML and JSON range', () => {
    expect(clampImageDimension(10)).toBe(40)
    expect(clampImageDimension(900)).toBe(900)
    expect(clampImageDimension(9000)).toBe(1600)
    expect(clampImageDimension('auto')).toBeUndefined()
    expect(getDisplayDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 })
  })

  it('accepts safe links and rejects executable protocols', () => {
    expect(normalizeImageLink('/icerik')).toBe('/icerik')
    expect(normalizeImageLink('https://ctxhub.net')).toBe('https://ctxhub.net')
    expect(normalizeImageLink('javascript:alert(1)')).toBeNull()
    expect(normalizeImageLink('data:text/html,hello')).toBeNull()
  })
})
