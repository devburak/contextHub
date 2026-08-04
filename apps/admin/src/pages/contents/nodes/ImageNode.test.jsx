import { $getRoot, createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'
import { $createImageNode, ImageNode } from './ImageNode.jsx'

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
