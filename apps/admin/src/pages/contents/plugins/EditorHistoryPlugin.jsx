import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { useEffect } from 'react'
import { registerHistoryShortcuts } from './editorHistoryShortcuts.js'

function HistoryShortcutPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => registerHistoryShortcuts(editor), [editor])
  return null
}

export default function EditorHistoryPlugin() {
  return (
    <>
      <HistoryPlugin />
      <HistoryShortcutPlugin />
    </>
  )
}
