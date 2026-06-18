import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import clsx from 'clsx'
import { $isEmbedNode } from './EmbedNode.jsx'
import { buildEmbedPayloadFromUrl } from '../utils/embedHelpers.js'

const INTERACTIVE_TAGS = new Set(['iframe', 'video', 'button', 'input', 'textarea', 'select', 'a'])
const DEFAULT_FALLBACK_TITLE = 'Gömülü içerik'

function parseStyleString(styleString = '') {
  if (!styleString) return {}
  return styleString
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, declaration) => {
      const [property, value] = declaration.split(':')
      if (!property || typeof value === 'undefined') {
        return acc
      }
      const normalizedProperty = property
        .trim()
        .toLowerCase()
        .replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      acc[normalizedProperty] = value.trim()
      return acc
    }, {})
}

function buildIframeProps(src, attributes = {}) {
  const fallbackTitle = attributes.title || attributes['aria-label'] || DEFAULT_FALLBACK_TITLE
  const props = {
    src,
    title: fallbackTitle,
    loading: 'lazy',
    className: 'h-full w-full border-0',
    style: { width: '100%', border: 0 },
  }

  const normalizedAttributes = attributes || {}

  Object.entries(normalizedAttributes).forEach(([rawName, rawValue]) => {
    if (!rawName) {
      return
    }
    const name = rawName.toLowerCase()
    const value = typeof rawValue === 'string' ? rawValue : rawValue == null ? '' : String(rawValue)

    if (!value && name !== 'allowfullscreen') {
      return
    }

    switch (name) {
      case 'class':
      case 'classname':
        props.className = clsx(props.className, value)
        break
      case 'style': {
        const parsedStyle = parseStyleString(value)
        props.style = { ...props.style, ...parsedStyle }
        break
      }
      case 'allowfullscreen':
        props.allowFullScreen = value === '' ? true : value === 'true' || value === '1'
        break
      case 'frameborder':
        props.frameBorder = value
        break
      case 'referrerpolicy':
        props.referrerPolicy = value
        break
      case 'marginheight':
        props.marginHeight = value
        break
      case 'marginwidth':
        props.marginWidth = value
        break
      case 'title':
        props.title = value
        break
      default:
        props[name] = value
        break
    }
  })

  const numericHeight = Number.parseInt(normalizedAttributes.height, 10)
  if (!Number.isNaN(numericHeight) && !props.style.minHeight && !props.style.height) {
    props.style.minHeight = numericHeight
  }
  if (!props.style.minHeight && !props.style.height) {
    props.style.minHeight = 360
  }

  if (!props.src) {
    props.src = src
  }

  if (!props.title) {
    props.title = fallbackTitle
  }

  return props
}

function EmbedComponent({ nodeKey, src, attributes }) {
  const containerRef = useRef(null)
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [editUrl, setEditUrl] = useState(attributes?.['data-url'] || src || '')

  const iframeProps = useMemo(() => buildIframeProps(src, attributes), [src, attributes])
  const displayLabel = iframeProps.title || src || DEFAULT_FALLBACK_TITLE

  useEffect(() => {
    setEditUrl(attributes?.['data-url'] || src || '')
  }, [attributes, src])

  const onDelete = useCallback(
    (event) => {
      if (!isSelected) {
        return false
      }

      const activeTag = document.activeElement?.tagName?.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') {
        return false
      }

      event.preventDefault()
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isEmbedNode(node)) {
          node.remove()
        }
      })
      return true
    },
    [editor, isSelected, nodeKey]
  )

  const applyEdit = useCallback(() => {
    const trimmed = editUrl.trim()
    if (!trimmed) {
      return
    }

    const payload = buildEmbedPayloadFromUrl(trimmed) || {
      src: trimmed,
      attributes: {
        ...(attributes || {}),
        src: trimmed,
      },
    }

    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isEmbedNode(node)) {
        node.setPayload(payload)
      }
    })
  }, [attributes, editUrl, editor, nodeKey])

  const onClick = useCallback(
    (event) => {
      if (!containerRef.current || !containerRef.current.contains(event.target)) {
        return false
      }

      if (event.shiftKey) {
        setSelected(!isSelected)
      } else {
        clearSelection()
        setSelected(true)
      }

      const tagName = event.target?.tagName?.toLowerCase()
      const isInteractive = INTERACTIVE_TAGS.has(tagName)
      return isInteractive ? false : true
    },
    [clearSelection, isSelected, setSelected]
  )

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW)
    )
  }, [editor, onClick, onDelete])

  const resolvedSrc = iframeProps.src || src

  return (
    <div className="my-6 flex justify-center">
      <div
        ref={containerRef}
        className={clsx(
          'group relative w-full max-w-3xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition ring-offset-2',
          isSelected ? 'ring-2 ring-blue-500' : 'ring-0'
        )}
        data-lexical-embed-container
      >
        <div className="overflow-hidden rounded-lg bg-gray-50">
          {resolvedSrc ? (
            <iframe {...iframeProps} />
          ) : (
            <div className="flex h-64 items-center justify-center bg-gray-200 text-sm text-gray-500">
              Gömülü içerik yüklenemedi.
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
          <span className="truncate font-medium" title={displayLabel}>
            {displayLabel}
          </span>
          {resolvedSrc ? (
            <a
              href={resolvedSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Kaynağı aç
            </a>
          ) : null}
        </div>
        {isSelected ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={editUrl}
              onChange={(event) => setEditUrl(event.target.value)}
              onBlur={applyEdit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyEdit()
                  event.currentTarget.blur()
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200"
              placeholder="Embed URL"
            />
            <button
              type="button"
              onClick={applyEdit}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Güncelle
            </button>
          </div>
        ) : null}
        {isSelected && (
          <span className="absolute right-3 top-3 rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
            Seçili
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(EmbedComponent)
