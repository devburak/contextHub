import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  createEditor,
} from 'lexical'
import { describe, expect, it } from 'vitest'
import {
  $restoreSerializedRangeSelection,
  createTextLinkEditorState,
  serializeRangeSelection,
} from './linkSelection.js'

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
