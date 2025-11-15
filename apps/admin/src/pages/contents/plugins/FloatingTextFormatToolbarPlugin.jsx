import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { $isCodeHighlightNode } from '@lexical/code'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'

import './FloatingTextFormatToolbarPlugin.css'

const HIDDEN_TRANSFORM = 'translate3d(-10000px, -10000px, 0)'

function positionToolbar(toolbarElem, rect) {
  if (!toolbarElem || !rect) {
    return
  }

  const { innerWidth } = window
  const toolbarWidth = toolbarElem.offsetWidth
  const toolbarHeight = toolbarElem.offsetHeight

  let top = rect.top + window.scrollY - toolbarHeight - 12
  if (top < 8) {
    top = rect.bottom + window.scrollY + 12
  }

  let left = rect.left + window.scrollX + rect.width / 2 - toolbarWidth / 2
  left = Math.max(8, Math.min(left, innerWidth - toolbarWidth - 8))

  toolbarElem.style.opacity = '1'
  toolbarElem.style.transform = `translate3d(${left}px, ${top}px, 0)`
}

function hideToolbar(toolbarElem) {
  if (!toolbarElem) return
  toolbarElem.style.opacity = '0'
  toolbarElem.style.transform = HIDDEN_TRANSFORM
}

export default function FloatingTextFormatToolbarPlugin({ anchorElem: anchorElemProp, onOpenLinkModal } = {}) {
  const [editor] = useLexicalComposerContext()
  const toolbarRef = useRef(null)
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [isCode, setIsCode] = useState(false)
  const [isLink, setIsLink] = useState(false)
  const anchorElem = useMemo(() => {
    if (anchorElemProp) return anchorElemProp
    if (typeof document !== 'undefined') {
      return document.body
    }
    return null
  }, [anchorElemProp])

  const updateToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      const toolbarElem = toolbarRef.current
      const nativeSelection = typeof window !== 'undefined' ? window.getSelection() : null
      const rootElement = editor.getRootElement()

      if (!toolbarElem || !nativeSelection || !rootElement) {
        return
      }

      if (!$isRangeSelection(selection) || selection.isCollapsed() || !nativeSelection.rangeCount) {
        hideToolbar(toolbarElem)
        setIsBold(false)
        setIsItalic(false)
        setIsUnderline(false)
        setIsStrikethrough(false)
        setIsCode(false)
        setIsLink(false)
        return
      }

      const anchorNode = selection.anchor.getNode()
      const focusNode = selection.focus.getNode()

      if (selection.getTextContent().trim() === '') {
        hideToolbar(toolbarElem)
        setIsLink(false)
        return
      }

      if (!rootElement.contains(nativeSelection.anchorNode)) {
        hideToolbar(toolbarElem)
        setIsLink(false)
        return
      }

      const anchorParent = anchorNode ? anchorNode.getParent() : null
      const focusParent = focusNode ? focusNode.getParent() : null

      if (
        $isCodeHighlightNode(anchorNode) ||
        $isCodeHighlightNode(focusNode) ||
        $isCodeHighlightNode(anchorParent) ||
        $isCodeHighlightNode(focusParent)
      ) {
        hideToolbar(toolbarElem)
        setIsLink(false)
        return
      }

      setIsBold(selection.hasFormat('bold'))
      setIsItalic(selection.hasFormat('italic'))
      setIsUnderline(selection.hasFormat('underline'))
      setIsStrikethrough(selection.hasFormat('strikethrough'))
      setIsCode(selection.hasFormat('code'))

      let nextIsLink = false
      const nodes = selection.getNodes()
      for (const node of nodes) {
        if ($isLinkNode(node)) {
          nextIsLink = true
          break
        }
        const parent = node.getParent()
        if (parent && $isLinkNode(parent)) {
          nextIsLink = true
          break
        }
        if ($isTextNode(node)) {
          const parentOfText = node.getParent()
          if (parentOfText && $isLinkNode(parentOfText)) {
            nextIsLink = true
            break
          }
        }
      }
      setIsLink(nextIsLink)

      const domRange = nativeSelection.getRangeAt(0)
      const rangeRect = domRange.getBoundingClientRect()

      if (!rangeRect || (rangeRect.top === 0 && rangeRect.bottom === 0)) {
        hideToolbar(toolbarElem)
        return
      }

      positionToolbar(toolbarElem, rangeRect)
    })
  }, [editor])

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar()
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerUpdateListener(() => {
        updateToolbar()
      })
    )
  }, [editor, updateToolbar])

  useEffect(() => {
    const handler = () => {
      updateToolbar()
    }

    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)

    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [updateToolbar])

  useEffect(() => {
    hideToolbar(toolbarRef.current)
    setTimeout(() => {
      updateToolbar()
    }, 0)
  }, [updateToolbar])

  const applyFormat = (format) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
    setTimeout(updateToolbar, 0)
  }

  const toggleLink = () => {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
      setTimeout(updateToolbar, 0)
      return
    }

    if (typeof onOpenLinkModal === 'function') {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        let existingLink = null
        let selectionText = ''
        if ($isRangeSelection(selection)) {
          selectionText = selection.getTextContent()
          const linkNode = selection
            .getNodes()
            .map((node) => {
              if ($isLinkNode(node)) return node
              const parent = node.getParent()
              if (parent && $isLinkNode(parent)) return parent
              return null
            })
            .find(Boolean)
          existingLink = linkNode || null
        }

        if (existingLink) {
          onOpenLinkModal({
            open: true,
            url: existingLink.getURL?.() || '',
            text: existingLink.getTextContent() || '',
            newTab: (existingLink.getTarget?.() || '_blank') === '_blank',
            linkKey: existingLink.getKey ? existingLink.getKey() : null,
            error: '',
          })
        } else {
          onOpenLinkModal({
            open: true,
            url: '',
            text: selectionText || '',
            newTab: true,
            linkKey: null,
            error: '',
          })
        }
      })
      return
    }

    const url = window.prompt('Bağlantı URL', 'https://')
    if (url) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
    }
    setTimeout(updateToolbar, 0)
  }

  const preventHide = (event) => {
    event.preventDefault()
  }

  if (!anchorElem) {
    return null
  }

  return createPortal(
    <div ref={toolbarRef} className="floating-text-format-toolbar" role="toolbar" onMouseDown={preventHide}>
      <button
        type="button"
        className={clsx('floating-text-format-toolbar__button', isBold && 'is-active')}
        onClick={() => applyFormat('bold')}
        aria-label="Kalın"
      >
        B
      </button>
      <button
        type="button"
        className={clsx('floating-text-format-toolbar__button', isItalic && 'is-active')}
        onClick={() => applyFormat('italic')}
        aria-label="İtalik"
      >
        I
      </button>
      <button
        type="button"
        className={clsx('floating-text-format-toolbar__button', isUnderline && 'is-active')}
        onClick={() => applyFormat('underline')}
        aria-label="Altı Çizili"
      >
        U
      </button>
      <button
        type="button"
        className={clsx('floating-text-format-toolbar__button', isStrikethrough && 'is-active')}
        onClick={() => applyFormat('strikethrough')}
        aria-label="Üzeri Çizili"
      >
        S
      </button>
      <button
        type="button"
        className={clsx('floating-text-format-toolbar__button', isCode && 'is-active')}
        onClick={() => applyFormat('code')}
        aria-label="Kod"
      >
        {'</>'}
      </button>
      <span className="floating-text-format-toolbar__divider" aria-hidden="true" />
      <button
        type="button"
        className={clsx('floating-text-format-toolbar__button', isLink && 'is-active')}
        onClick={toggleLink}
        aria-label={isLink ? 'Bağlantıyı kaldır' : 'Bağlantı ekle'}
      >
        🔗
      </button>
    </div>,
    anchorElem
  )
}
