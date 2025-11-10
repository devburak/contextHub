import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect, useCallback } from 'react'
import { $getNodeByKey } from 'lexical'
import { $isImageNode } from '../nodes/ImageNode.jsx'
import { INSERT_IMAGE_COMMAND } from './ImagePlugin.jsx'

export default function ImageHandlersPlugin({ openMediaPicker }) {
  const [editor] = useLexicalComposerContext()

  const handleInsertImage = useCallback(() => {
    if (typeof openMediaPicker !== 'function') {
      return
    }

    openMediaPicker({
      mode: 'image',
      onSelect: (media) => {
        if (!media) return
        const variants = Array.isArray(media.variants) ? media.variants : []
        const preferredOrder = ['large', 'preview', 'optimized', 'original']
        const variant = preferredOrder
          .map((name) => variants.find((item) => item.name === name))
          .find(Boolean) || variants[0]

        const src = variant?.url || media.url
        if (!src) return

        const width = variant?.width || media.width
        const height = variant?.height || media.height
        const altText = media.altText || media.originalName || media.fileName || ''

        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          src,
          altText,
          width,
          height,
        })
      },
    })
  }, [editor, openMediaPicker])

  const handleReplaceImage = useCallback((nodeKey, currentCaption) => {
    if (typeof openMediaPicker !== 'function') {
      return
    }

    openMediaPicker({
      mode: 'image',
      onSelect: (media) => {
        if (!media) return
        const variants = Array.isArray(media.variants) ? media.variants : []
        const preferredOrder = ['large', 'preview', 'optimized', 'original']
        const variant = preferredOrder
          .map((name) => variants.find((item) => item.name === name))
          .find(Boolean) || variants[0]

        const src = variant?.url || media.url
        if (!src) return

        const width = variant?.width || media.width
        const height = variant?.height || media.height
        const altText = media.altText || media.originalName || media.fileName || ''

        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isImageNode(node)) {
            node.setSrc(src)
            node.setAltText(altText)
            node.setDimensions({ width, height })
            // Keep existing caption
          }
        })
      },
    })
  }, [editor, openMediaPicker])

  useEffect(() => {
    if (!editor) return
    
    // Attach callbacks to editor for use in ImageComponent
    if (!editor._editorCallbacks) {
      editor._editorCallbacks = {}
    }
    editor._editorCallbacks.onInsertImage = handleInsertImage
    editor._editorCallbacks.onReplaceImage = handleReplaceImage

    return () => {
      if (editor._editorCallbacks) {
        editor._editorCallbacks.onInsertImage = null
        editor._editorCallbacks.onReplaceImage = null
      }
    }
  }, [editor, handleInsertImage, handleReplaceImage])

  return null
}
