import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_EDITOR,
  PASTE_COMMAND,
  createCommand,
} from 'lexical'
import { $createEmbedNode, EmbedNode } from '../nodes/EmbedNode.jsx'
import { detectVideoProvider } from '../../../utils/externalMedia.js'

export const INSERT_EMBED_COMMAND = createCommand('INSERT_EMBED_COMMAND')

export default function EmbedPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([EmbedNode])) {
      throw new Error('EmbedNode is not registered on editor')
    }

    const unregisterInsertEmbed = editor.registerCommand(
      INSERT_EMBED_COMMAND,
      (payload) => insertEmbedNodeFromPayload(payload),
      COMMAND_PRIORITY_EDITOR
    )

    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!event || !event.clipboardData) {
          return false
        }

        const plainText = (event.clipboardData.getData('text/plain') || '').trim()
        const html = event.clipboardData.getData('text/html')
        const candidate = html || plainText

        if (!candidate || !candidate.toLowerCase().includes('<iframe')) {
          return false
        }

        const embedPayloads = extractIframeEmbedsFromHtml(candidate)
        if (!embedPayloads.length) {
          return false
        }

        event.preventDefault()
        embedPayloads.forEach((embedPayload) => {
          insertEmbedNodeFromPayload(embedPayload)
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )

    return () => {
      unregisterInsertEmbed()
      unregisterPaste()
    }
  }, [editor])

  return null
}

function insertEmbedNodeFromPayload(payload) {
  if (!payload || typeof payload.src !== 'string' || !payload.src.trim()) {
    return false
  }

  const embedNode = $createEmbedNode(payload)
  $insertNodes([embedNode])

  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    embedNode.selectNext()
  }

  const parent = embedNode.getParent()
  if (parent !== null && $isRootOrShadowRoot(parent)) {
    embedNode.insertAfter($createParagraphNode())
  }

  return true
}

function extractIframeEmbedsFromHtml(htmlString) {
  if (typeof htmlString !== 'string') {
    return []
  }

  const trimmed = htmlString.trim()
  if (!trimmed) {
    return []
  }

  if (typeof DOMParser === 'undefined') {
    return []
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(trimmed, 'text/html')
    const iframeElements = Array.from(doc.querySelectorAll('iframe'))

    if (!iframeElements.length) {
      return []
    }

    return iframeElements
      .map((iframe) => {
        const src = iframe.getAttribute('src')?.trim()
        if (!src) {
          return null
        }

        const { provider } = detectVideoProvider(src)
        if (provider) {
          return null
        }

        const attributes = {}
        Array.from(iframe.attributes).forEach(({ name, value }) => {
          if (!name) return
          attributes[name.toLowerCase()] = value
        })

        return { src, attributes }
      })
      .filter(Boolean)
  } catch (error) {
    console.warn('[EmbedPlugin] Failed to parse pasted iframe HTML', error)
    return []
  }
}
