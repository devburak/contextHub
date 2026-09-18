import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import { countDocumentText } from '../utils/documentInsights.js'

export default function DocumentStatsPlugin() {
  const [editor] = useLexicalComposerContext()
  const { t } = useTranslation()
  const [stats, setStats] = useState(() => countDocumentText(''))

  const updateStats = useCallback((editorState = editor.getEditorState()) => {
    editorState.read(() => setStats(countDocumentText($getRoot().getTextContent())))
  }, [editor])

  useEffect(() => {
    updateStats()
    return editor.registerUpdateListener(({ editorState }) => updateStats(editorState))
  }, [editor, updateStats])

  return (
    <footer className="editor-document-stats" aria-live="polite">
      <span>{t('content.word_count', { count: stats.words })}</span>
      <span aria-hidden="true">·</span>
      <span>{t('content.character_count', { count: stats.characters })}</span>
    </footer>
  )
}
