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
