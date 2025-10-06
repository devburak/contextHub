import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
} from 'lexical'
import { $createVideoNode, VideoNode } from '../nodes/VideoNode.jsx'

export const INSERT_VIDEO_COMMAND = createCommand('INSERT_VIDEO_COMMAND')

export default function VideoPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([VideoNode])) {
      throw new Error('VideoNode is not registered on editor')
    }

    return editor.registerCommand(
      INSERT_VIDEO_COMMAND,
      (payload) => {
        if (!payload) {
          return true
        }

        const videoNode = $createVideoNode(payload)
        $insertNodes([videoNode])

        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          videoNode.selectNext()
        }

        const parent = videoNode.getParent()
        if (parent !== null && $isRootOrShadowRoot(parent)) {
          videoNode.insertAfter($createParagraphNode())
        }

        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}

