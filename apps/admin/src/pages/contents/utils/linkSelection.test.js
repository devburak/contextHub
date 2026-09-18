import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  createEditor,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  $applyTextLinkToSelection,
  $restoreSerializedRangeSelection,
  $updateLinkNodeText,
  createTextLinkEditorState,
  serializeRangeSelection,
} from './linkSelection.js'

const { toggleLinkMock } = vi.hoisted(() => ({ toggleLinkMock: vi.fn() }))

vi.mock('@lexical/link', () => ({
  $toggleLink: toggleLinkMock,
}))

describe('link selection persistence', () => {
  it('restores the selected text after focus leaves the editor', () => {
    const editor = createEditor({ onError: (error) => { throw error } })
    let snapshot
    let restoredText

    editor.update(() => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('Bağlantı metni')
      paragraph.append(text)
      $getRoot().append(paragraph)
      text.select(0, 8)
      snapshot = serializeRangeSelection($getSelection())
    }, { discrete: true })

    editor.update(() => {
      const selection = $restoreSerializedRangeSelection(snapshot)
      restoredText = selection?.getTextContent()
    }, { discrete: true })

    expect(restoredText).toBe('Bağlantı')
  })

  it('does not restore a selection whose nodes no longer exist', () => {
    const editor = createEditor({ onError: (error) => { throw error } })
    let result

    editor.update(() => {
      result = $restoreSerializedRangeSelection({
        anchor: { key: 'missing', offset: 0, type: 'text' },
        focus: { key: 'missing', offset: 1, type: 'text' },
      })
    }, { discrete: true })

    expect(result).toBeNull()
  })
})

describe('$applyTextLinkToSelection', () => {
  beforeEach(() => {
    toggleLinkMock.mockClear()
  })

  it('preserves selected text while wrapping it with a link', () => {
    const editor = createEditor({ onError: (error) => { throw error } })

    editor.update(() => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('Seçili metin kaybolmamalı')
      paragraph.append(text)
      $getRoot().append(paragraph)
      text.select(0, 12)

      const applied = $applyTextLinkToSelection($getSelection(), {
        url: 'https://example.com',
        text: 'Seçili metin',
        target: '_blank',
        rel: 'noopener noreferrer',
      })

      expect(applied).toBe(true)
    }, { discrete: true })

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('Seçili metin kaybolmamalı')
    })
    expect(toggleLinkMock).toHaveBeenCalledWith('https://example.com', {
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })

  it('keeps the link when the modal text is edited', () => {
    const editor = createEditor({ onError: (error) => { throw error } })

    editor.update(() => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('Eski metin')
      paragraph.append(text, $createTextNode(' devamı'))
      $getRoot().append(paragraph)
      text.select(0, 10)

      $applyTextLinkToSelection($getSelection(), {
        url: 'https://example.com',
        text: 'Yeni metin',
        target: '_self',
        rel: 'noopener noreferrer',
      })
    }, { discrete: true })

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('Yeni metin devamı')
    })
    expect(toggleLinkMock).toHaveBeenCalledWith('https://example.com', {
      target: '_self',
      rel: 'noopener noreferrer',
    })
  })
})

describe('$updateLinkNodeText', () => {
  it('does not touch children when only the URL is updated', () => {
    const editor = createEditor({ onError: (error) => { throw error } })
    let originalTextNodeKey

    editor.update(() => {
      const container = $createParagraphNode()
      const text = $createTextNode('Bağlantı metni')
      text.toggleFormat('bold')
      container.append(text)
      $getRoot().append(container)
      originalTextNodeKey = text.getKey()

      $updateLinkNodeText(container, 'Bağlantı metni')
    }, { discrete: true })

    editor.getEditorState().read(() => {
      const text = $getRoot().getFirstDescendant()
      expect(text?.getKey()).toBe(originalTextNodeKey)
      expect(text?.hasFormat('bold')).toBe(true)
      expect(text?.getTextContent()).toBe('Bağlantı metni')
    })
  })

  it('updates text without leaving the link node empty', () => {
    const editor = createEditor({ onError: (error) => { throw error } })

    editor.update(() => {
      const container = $createParagraphNode()
      const first = $createTextNode('Eski')
      const second = $createTextNode(' metin')
      first.toggleFormat('bold')
      second.toggleFormat('italic')
      container.append(first, second)
      $getRoot().append(container)

      $updateLinkNodeText(container, 'Yeni metin')
    }, { discrete: true })

    editor.getEditorState().read(() => {
      const container = $getRoot().getFirstChild()
      expect(container?.getTextContent()).toBe('Yeni metin')
      expect(container?.getChildrenSize()).toBe(1)
      expect(container?.getFirstChild()?.hasFormat('bold')).toBe(true)
    })
  })
})

describe('createTextLinkEditorState', () => {
  it('opens existing links in edit mode without removing them', () => {
    const link = {
      getType: () => 'link',
      getURL: () => 'https://example.com',
      getTextContent: () => 'Örnek bağlantı',
      getTarget: () => '_self',
      getKey: () => 'link-key',
    }
    const result = createTextLinkEditorState({
      getNodes: () => [{ getType: () => 'text', getParent: () => link }],
      getTextContent: () => 'Örnek',
    })

    expect(result).toMatchObject({
      open: true,
      url: 'https://example.com',
      text: 'Örnek bağlantı',
      newTab: false,
      type: 'link',
    })
    expect(result.linkKey).toBeTruthy()
  })
})
