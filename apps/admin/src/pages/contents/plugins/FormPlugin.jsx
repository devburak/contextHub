import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $wrapNodeInElement, mergeRegister } from '@lexical/utils'
import {
  $createParagraphNode,
  $insertNodes,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
} from 'lexical'
import { useEffect } from 'react'
import { $createFormNode, FormNode } from '../nodes/FormNode.jsx'

export const INSERT_FORM_COMMAND = createCommand('INSERT_FORM_COMMAND')

export default function FormPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([FormNode])) {
      throw new Error('FormPlugin: FormNode not registered on editor')
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_FORM_COMMAND,
        (payload) => {
          const formNode = $createFormNode(payload)
          $insertNodes([formNode])
          if ($isRootOrShadowRoot(formNode.getParentOrThrow())) {
            $wrapNodeInElement(formNode, $createParagraphNode).selectEnd()
          }
          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
