import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRootOrShadowRoot,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
} from 'lexical'
import { $createImageNode, ImageNode } from '../nodes/ImageNode.jsx'

export const INSERT_IMAGE_COMMAND = createCommand('INSERT_IMAGE_COMMAND')

export default function ImagePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      throw new Error('ImageNode is not registered on editor')
    }

    return editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      (payload) => {
        const { src, altText = '', width, height } = payload || {}
        if (!src) {
          return true
        }

        const imageNode = $createImageNode({ src, altText, width, height })
        $insertNodes([imageNode])

        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          imageNode.selectNext()
        }

        const parent = imageNode.getParent()
        if (parent !== null && $isRootOrShadowRoot(parent)) {
          imageNode.insertAfter($createParagraphNode())
        }

        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
