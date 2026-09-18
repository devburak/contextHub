import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
} from 'lexical'
import { findMatchesInBlocks } from '../utils/documentInsights.js'

function getScrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function readSearchBlocks() {
  return $getRoot().getChildren().map((block) => {
    const textNodes = $isTextNode(block)
      ? [block]
      : $isElementNode(block)
        ? block.getAllTextNodes()
        : []

    return {
      segments: textNodes.map((node) => ({
        key: node.getKey(),
        text: node.getTextContent(),
      })),
    }
  })
}

function createMatchSelection(match) {
  const first = match?.segments?.[0]
  const last = match?.segments?.[match.segments.length - 1]
  if (!first || !last) return null

  const firstNode = $getNodeByKey(first.key)
  const lastNode = $getNodeByKey(last.key)
  if (!$isTextNode(firstNode) || !$isTextNode(lastNode)) return null

  const selection = $createRangeSelection()
  selection.anchor.set(first.key, first.start, 'text')
  selection.focus.set(last.key, last.end, 'text')
  return selection
}

export default function FindReplacePlugin({ open, onOpenChange }) {
  const [editor] = useLexicalComposerContext()
  const { t } = useTranslation()
  const queryInputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matches, setMatches] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)

  const refreshMatches = useCallback(() => {
    const nextMatches = editor.getEditorState().read(() => (
      findMatchesInBlocks(readSearchBlocks(), query)
    ))
    setMatches(nextMatches)
    setCurrentIndex((index) => Math.min(index, Math.max(0, nextMatches.length - 1)))
    return nextMatches
  }, [editor, query])

  useEffect(() => {
    refreshMatches()
    return editor.registerUpdateListener(() => refreshMatches())
  }, [editor, refreshMatches])

  useEffect(() => {
    const handleFindShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        event.stopPropagation()
        onOpenChange(true)
      }
    }

    document.addEventListener('keydown', handleFindShortcut, true)
    return () => document.removeEventListener('keydown', handleFindShortcut, true)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      queryInputRef.current?.focus()
      queryInputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  const selectMatch = useCallback((index) => {
    const match = matches[index]
    if (!match) return

    editor.update(() => {
      const selection = createMatchSelection(match)
      if (selection) $setSelection(selection)
    }, {
      onUpdate: () => {
        const firstKey = match.segments[0]?.key
        editor.getElementByKey(firstKey)?.scrollIntoView({ block: 'center', behavior: getScrollBehavior() })
      },
    })
    setCurrentIndex(index)
  }, [editor, matches])

  const moveMatch = useCallback((direction) => {
    if (!matches.length) return
    const nextIndex = (currentIndex + direction + matches.length) % matches.length
    selectMatch(nextIndex)
  }, [currentIndex, matches.length, selectMatch])

  const replaceCurrent = useCallback(() => {
    const match = matches[currentIndex]
    if (!match) return

    editor.update(() => {
      const selection = createMatchSelection(match)
      if (!selection) return
      $setSelection(selection)
      selection.insertText(replacement)
    })
  }, [currentIndex, editor, matches, replacement])

  const replaceAll = useCallback(() => {
    if (!matches.length) return
    editor.update(() => {
      [...matches].reverse().forEach((match) => {
        match.segments.slice().reverse().forEach((segment, reverseIndex) => {
          const node = $getNodeByKey(segment.key)
          if (!$isTextNode(node)) return
          const isFirstSegment = reverseIndex === match.segments.length - 1
          node.spliceText(
            segment.start,
            segment.end - segment.start,
            isFirstSegment ? replacement : ''
          )
        })
      })
    })
  }, [editor, matches, replacement])

  if (!open) return null

  return (
    <section className="editor-find-panel" aria-label={t('content.find_replace_title')}>
      <div className="editor-find-panel__row">
        <input
          ref={queryInputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onOpenChange(false)
              editor.focus()
            } else if (event.key === 'Enter') {
              event.preventDefault()
              moveMatch(event.shiftKey ? -1 : 1)
            }
          }}
          placeholder={t('content.find_placeholder')}
          aria-label={t('content.find_label')}
        />
        <span className="editor-find-panel__count" aria-live="polite">
          {matches.length ? `${currentIndex + 1}/${matches.length}` : t('content.find_no_matches')}
        </span>
        <button type="button" onClick={() => moveMatch(-1)} disabled={!matches.length} aria-label={t('content.find_previous')}>↑</button>
        <button type="button" onClick={() => moveMatch(1)} disabled={!matches.length} aria-label={t('content.find_next')}>↓</button>
        <button type="button" onClick={() => onOpenChange(false)} aria-label={t('common.close')}>×</button>
      </div>
      <div className="editor-find-panel__row">
        <input
          type="text"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder={t('content.replace_placeholder')}
          aria-label={t('content.replace_label')}
        />
        <button type="button" onClick={replaceCurrent} disabled={!matches.length}>{t('content.replace')}</button>
        <button type="button" onClick={replaceAll} disabled={!matches.length}>{t('content.replace_all')}</button>
      </div>
    </section>
  )
}
