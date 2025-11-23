import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  createCommand,
} from 'lexical'
import { $createVideoNode, VideoNode } from '../nodes/VideoNode.jsx'
import { detectVideoProvider } from '../../../utils/externalMedia.js'

export const INSERT_VIDEO_COMMAND = createCommand('INSERT_VIDEO_COMMAND')

export default function VideoPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([VideoNode])) {
      throw new Error('VideoNode is not registered on editor')
    }

    const unregisterInsert = editor.registerCommand(
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

    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => handleVideoPaste(event, editor),
      COMMAND_PRIORITY_HIGH
    )

    return () => {
      unregisterInsert()
      unregisterPaste()
    }
  }, [editor])

  return null
}

const VIDEO_URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|(?:youtu\.be|youtube\.com|vimeo\.com)[^\s]*)/gi

function handleVideoPaste(event, editor) {
  if (!event?.clipboardData) {
    return false
  }

  const plainText = (event.clipboardData.getData('text/plain') || '').trim()
  if (!plainText) {
    return false
  }

  // Let iframe pastes be handled by the default HTML parsing / embed plugin
  const html = event.clipboardData.getData('text/html') || ''
  if (html && html.toLowerCase().includes('<iframe')) {
    return false
  }

  const videoUrls = extractVideoUrls(plainText)
  if (!videoUrls.length) {
    return false
  }

  VIDEO_URL_REGEX.lastIndex = 0
  const remainingText = plainText.replace(VIDEO_URL_REGEX, '').trim()
  if (remainingText.length > 0) {
    return false
  }

  const payloads = videoUrls
    .map((rawUrl) => buildVideoPayloadFromUrl(rawUrl))
    .filter(Boolean)

  if (!payloads.length) {
    return false
  }

  event.preventDefault()
  payloads.forEach((payload) => {
    editor.dispatchCommand(INSERT_VIDEO_COMMAND, payload)
  })

  return true
}

function extractVideoUrls(text) {
  const matches = new Set()
  VIDEO_URL_REGEX.lastIndex = 0
  let match
  while ((match = VIDEO_URL_REGEX.exec(text)) !== null) {
    const cleaned = (match[0] || '').replace(/^[<(]+/, '').replace(/[)>.,;!?]+$/, '')
    if (cleaned) {
      matches.add(cleaned)
    }
  }
  return Array.from(matches)
}

function buildVideoPayloadFromUrl(rawUrl) {
  const normalizedUrl = normalizeUrl(rawUrl)
  if (!normalizedUrl) {
    return null
  }

  const { provider, providerId } = detectVideoProvider(normalizedUrl)
  if (!provider || !providerId) {
    return null
  }

  return {
    url: normalizedUrl,
    externalUrl: normalizedUrl,
    provider,
    providerId,
    title: '',
    caption: '',
    mimeType: null,
  }
}

function normalizeUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim()
  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}
