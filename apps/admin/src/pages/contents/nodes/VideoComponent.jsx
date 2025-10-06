import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import clsx from 'clsx'
import { buildExternalEmbed } from '../../../utils/externalMedia.js'
import { $isVideoNode } from './VideoNode.jsx'

function VideoComponent({
  url,
  externalUrl,
  provider,
  providerId,
  thumbnailUrl,
  title,
  caption = '',
  mimeType,
  duration,
  nodeKey,
}) {
  const containerRef = useRef(null)
  const textareaRef = useRef(null)
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [localCaption, setLocalCaption] = useState(caption || '')
  const missingEmbedLoggedRef = useRef(false)

  useEffect(() => {
    setLocalCaption(caption || '')
  }, [caption])

  useEffect(() => {
    if (isSelected && textareaRef.current) {
      // Small delay to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus({ preventScroll: true })
          textareaRef.current.select()
        }
      }, 0)

      return () => clearTimeout(timeoutId)
    }
  }, [isSelected])

  const embed = useMemo(() => {
    const result = buildExternalEmbed({
      url,
      externalUrl,
      provider,
      providerId,
      thumbnailUrl,
      mimeType,
    })

    if (!result && !missingEmbedLoggedRef.current) {
      console.warn('[VideoComponent] No embeddable source derived for media.', {
        url,
        externalUrl,
        provider,
        providerId,
        mimeType,
      })
      missingEmbedLoggedRef.current = true
    }

    return result
  }, [url, externalUrl, provider, providerId, thumbnailUrl, mimeType])

  const mediaTitle = title || localCaption || externalUrl || url || 'Video'

  const onDelete = useCallback(
    (event) => {
      // Don't delete if user is editing caption (textarea is focused)
      if (isSelected && textareaRef.current !== document.activeElement) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node) {
            node.remove()
          }
        })
        return true
      }
      return false
    },
    [editor, isSelected, nodeKey]
  )

  const onClick = useCallback(
    (event) => {
      if (!containerRef.current) {
        return false
      }
      if (!containerRef.current.contains(event.target)) {
        return false
      }

      const target = event.target
      const tagName = (target?.tagName || '').toLowerCase()
      const interactiveTags = new Set(['iframe', 'video', 'textarea', 'input', 'button'])
      const isInteractive = interactiveTags.has(tagName)

      if (event.shiftKey) {
        setSelected(!isSelected)
      } else {
        clearSelection()
        setSelected(true)
      }

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

  // Remove the duplicate selection listener since useLexicalNodeSelection already handles this

  const handleCaptionBlur = useCallback(() => {
    // Only update if caption actually changed
    if (localCaption !== caption) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isVideoNode(node)) {
          node.setCaption(localCaption)
        }
      })
    }
  }, [editor, nodeKey, localCaption, caption])

  const activateEditing = useCallback(() => {
    if (!isSelected) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          node.select()
        }
      })
    }
  }, [editor, nodeKey, isSelected])

  return (
    <div className="my-6 flex justify-center">
      <div
        ref={containerRef}
        className={clsx(
          'group relative w-full max-w-3xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition ring-offset-2',
          isSelected ? 'ring-2 ring-blue-500' : 'ring-0'
        )}
        data-lexical-video-container
      >
        <div className="overflow-hidden rounded-lg bg-black">
          {embed ? (
            embed.type === 'iframe' ? (
              <div className="aspect-video">
                <iframe
                  src={embed.src}
                  title={mediaTitle}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              </div>
            ) : (
              <video
                controls
                poster={thumbnailUrl || undefined}
                src={embed.src}
                className="h-full w-full"
              >
                Tarayıcınız video öğesini desteklemiyor.
              </video>
            )
          ) : (
            <div className="flex aspect-video items-center justify-center bg-gray-200 text-sm text-gray-500">
              Video ön izlemesi oluşturulamadı.
            </div>
          )}
        </div>
        <div className="mt-3 space-y-2 text-sm text-gray-600">
          {isSelected ? (
            <textarea
              ref={textareaRef}
              value={localCaption}
              onChange={(event) => setLocalCaption(event.target.value)}
              onBlur={handleCaptionBlur}
              placeholder="Bu video için açıklama ekle"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200"
              rows={2}
            />
          ) : localCaption ? (
            <p className="whitespace-pre-line" onDoubleClick={activateEditing}>{localCaption}</p>
          ) : (
            <p className="text-gray-400" onDoubleClick={activateEditing}>
              Video açıklaması eklemek için videoya çift tıkla.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {provider && <span className="uppercase tracking-wide text-gray-500">{provider}</span>}
            {duration ? <span>{Math.round(duration)} sn</span> : null}
            {externalUrl ? (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                Kaynağı aç
              </a>
            ) : null}
          </div>
        </div>
        {isSelected && (
          <span className="absolute right-3 top-3 rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
            Seçili
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(VideoComponent)
