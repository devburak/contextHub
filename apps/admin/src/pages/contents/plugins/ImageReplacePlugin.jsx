import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

export default function ImageReplacePlugin({ onReplaceImage }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor) return
    
    // Attach callback to editor instance so ImageComponent can access it
    if (!editor._editorCallbacks) {
      editor._editorCallbacks = {}
    }
    editor._editorCallbacks.onReplaceImage = onReplaceImage
    
    return () => {
      if (editor._editorCallbacks) {
        editor._editorCallbacks.onReplaceImage = null
      }
    }
  }, [editor, onReplaceImage])

  return null
}
