import clsx from 'clsx'
import { Fragment, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContent, createContent, updateContent, listVersions } from '../../lib/api/contents'
import { listCategories } from '../../lib/api/categories'
import { searchTags, createTag } from '../../lib/api/tags'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  INDENT_CONTENT_COMMAND,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { $setBlocksType } from '@lexical/selection'
import { HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { AutoLinkPlugin, createLinkMatcherWithRegExp } from '@lexical/react/LexicalAutoLinkPlugin'
import {
  ListNode,
  ListItemNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { AutoLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { registerCodeHighlighting, CodeNode, CodeHighlightNode, $createCodeNode } from '@lexical/code'
import './ContentEditor.css'
import FloatingTextFormatToolbarPlugin from './plugins/FloatingTextFormatToolbarPlugin'
import DraggableBlockPlugin from './plugins/DraggableBlockPlugin'
import { mediaAPI } from '../../lib/mediaAPI.js'
import { Dialog, Transition } from '@headlessui/react'
import { PhotoIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

const DEFAULT_FONT_SIZE = 16
const FONT_MIN = 10
const FONT_MAX = 48
const DEFAULT_TEXT_COLOR = '#111827'
const DEFAULT_HIGHLIGHT_COLOR = '#ffffff'

const statusLabels = {
  draft: 'Taslak',
  scheduled: 'Zamanlanmış',
  published: 'Yayında',
  archived: 'Arşiv',
}

const urlMatchers = [
  createLinkMatcherWithRegExp(/((https?:\/\/)|(www\.))[\w-]+(\.[\w-]+)+(\S*)/gi, (text) =>
    text.startsWith('http') ? text : `https://${text}`
  ),
  createLinkMatcherWithRegExp(/([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/gi, (text) => `mailto:${text}`),
]

const INITIAL_EDITOR_STATE = JSON.stringify({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    children: [
      { type: 'paragraph', format: '', indent: 0, textFormat: 0, version: 1, children: [] },
    ],
  },
})

const parseStyleString = (style = '') => {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const [key, value] = item.split(':')
      if (key && value) {
        acc[key.trim()] = value.trim()
      }
      return acc
    }, {})
}

const styleObjectToString = (styles) =>
  Object.entries(styles)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')

const toHexColor = (color) => {
  if (!color) return ''
  if (color.startsWith('#')) return color
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i)
  if (rgbMatch) {
    return `#${rgbMatch.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
  }
  return color
}

// Basic theme placeholder
const theme = {
  paragraph: 'mb-2 leading-relaxed text-gray-800',
  heading: {
    h1: 'text-3xl font-semibold text-gray-900 mt-6 mb-3',
    h2: 'text-2xl font-semibold text-gray-900 mt-5 mb-2',
    h3: 'text-xl font-semibold text-gray-900 mt-4 mb-2',
  },
  quote: 'border-l-4 border-gray-200 pl-4 italic text-gray-500 my-4',
  code: 'bg-gray-900 text-gray-100 rounded-lg px-4 py-3 font-mono text-sm overflow-x-auto',
  list: {
    listitem: 'my-1',
    nested: {
      listitem: 'my-1',
    },
  },
  link: 'text-blue-600 underline hover:text-blue-700',
}

const initialConfig = {
  namespace: 'content-editor',
  theme,
  nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, CodeHighlightNode, LinkNode, AutoLinkNode],
  onError(error) {
    console.error(error)
  },
}

function Placeholder() {
  return <div className="absolute top-2 left-3 text-gray-400 pointer-events-none text-sm">İçerik yazmaya başlayın...</div>
}

export default function ContentEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const { token, activeTenantId } = useAuth()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState('draft')
  const [summary, setSummary] = useState('')
  const [publishAt, setPublishAt] = useState('')
  const [categories, setCategories] = useState([])
  const [selectedCategoryRecords, setSelectedCategoryRecords] = useState([])
  const [tags, setTags] = useState([])
  const [selectedTagRecords, setSelectedTagRecords] = useState([])
  const [slugError, setSlugError] = useState('')
  const [initialEditorState, setInitialEditorState] = useState(INITIAL_EDITOR_STATE)
  const [latestEditorState, setLatestEditorState] = useState(INITIAL_EDITOR_STATE)
  const [html, setHtml] = useState('<p></p>')
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState(null)
  const [previewVersion, setPreviewVersion] = useState(null)
  const [featuredMedia, setFeaturedMedia] = useState(null)
  const [featuredMediaId, setFeaturedMediaId] = useState(null)
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false)
  const [mediaSearch, setMediaSearch] = useState('')
  const [mediaPage, setMediaPage] = useState(1)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [mediaUploadError, setMediaUploadError] = useState('')
  const [editorAnchorElem, setEditorAnchorElem] = useState(null)
  const skipNextOnChangeRef = useRef(false)
  const skipNextContentSyncRef = useRef(false)
  const cardClass = 'rounded-xl border border-gray-200 bg-white shadow-sm'
  const inputClass = 'mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:bg-white focus:ring-blue-500'
  const textareaClass = inputClass
  const normaliseIdList = useCallback((values = []) => (
    Array.isArray(values)
      ? values
          .map((value) => {
            if (!value) return null
            if (typeof value === 'string') return value
            if (typeof value === 'object') {
              if (value._id) return String(value._id)
              if (typeof value.toString === 'function') return value.toString()
            }
            try {
              return String(value)
            } catch (error) {
              return null
            }
          })
          .filter(Boolean)
      : []
  ), [])

  const mediaQueryParams = useMemo(
    () => ({
      search: mediaSearch.trim() || undefined,
      mimeType: 'image/',
      page: mediaPage,
      limit: 12,
    }),
    [mediaSearch, mediaPage]
  )

  const mediaQuery = useQuery(
    ['media-picker', mediaQueryParams],
    () => mediaAPI.list(mediaQueryParams),
    { enabled: isMediaPickerOpen }
  )

  useEffect(() => {
    if (!categories.length) {
      if (selectedCategoryRecords.length) {
        setSelectedCategoryRecords([])
      }
      return
    }

    const missingIds = categories.filter(
      (id) => !selectedCategoryRecords.some((item) => String(item._id) === String(id))
    )

    if (!missingIds.length) {
      const ordered = categories
        .map((id) => selectedCategoryRecords.find((item) => String(item._id) === String(id)))
        .filter(Boolean)
      const isSameOrder =
        ordered.length === selectedCategoryRecords.length &&
        ordered.every((item, index) => item === selectedCategoryRecords[index])
      if (!isSameOrder) {
        setSelectedCategoryRecords(ordered)
      }
      return
    }

    let active = true
    listCategories({ flat: true, ids: missingIds })
      .then((res) => {
        if (!active) return
        const fetched = res?.categories ?? []
        if (!fetched.length) {
          return
        }
        setSelectedCategoryRecords((prev) => {
          const cache = new Map(prev.map((item) => [String(item._id), item]))
          fetched.forEach((item) => {
            if (item && item._id) {
              cache.set(String(item._id), item)
            }
          })
          return categories.map((id) => cache.get(String(id))).filter(Boolean)
        })
      })
      .catch((error) => {
        if (!active) return
        console.error('Kategori bilgisi alınamadı', error)
      })

    return () => {
      active = false
    }
  }, [categories, selectedCategoryRecords])

  useEffect(() => {
    if (!tags.length) {
      if (selectedTagRecords.length) {
        setSelectedTagRecords([])
      }
      return
    }

    const missingIds = tags.filter(
      (id) => !selectedTagRecords.some((item) => String(item._id) === String(id))
    )

    if (!missingIds.length) {
      const ordered = tags
        .map((id) => selectedTagRecords.find((item) => String(item._id) === String(id)))
        .filter(Boolean)
      const isSameOrder =
        ordered.length === selectedTagRecords.length &&
        ordered.every((item, index) => item === selectedTagRecords[index])
      if (!isSameOrder) {
        setSelectedTagRecords(ordered)
      }
      return
    }

    let active = true
    searchTags({ ids: missingIds })
      .then((res) => {
        if (!active) return
        const fetched = res?.tags ?? []
        if (!fetched.length) {
          return
        }
        setSelectedTagRecords((prev) => {
          const cache = new Map(prev.map((item) => [String(item._id), item]))
          fetched.forEach((item) => {
            if (item && item._id) {
              cache.set(String(item._id), item)
            }
          })
          return tags.map((id) => cache.get(String(id))).filter(Boolean)
        })
      })
      .catch((error) => {
        if (!active) return
        console.error('Etiket bilgisi alınamadı', error)
      })

    return () => {
      active = false
    }
  }, [tags, selectedTagRecords])

  const applyContentPayload = useCallback((source, { markDirty = false } = {}) => {
    if (!source) return
    const lexicalStateString = typeof source.lexical === 'string'
      ? source.lexical
      : source.lexical
        ? JSON.stringify(source.lexical)
        : INITIAL_EDITOR_STATE

    skipNextOnChangeRef.current = true
    setInitialEditorState(lexicalStateString)
    setLatestEditorState(lexicalStateString)
    setTitle(source.title || '')
    setSlug(source.slug || '')
    setStatus(source.status || 'draft')
    setSummary(source.summary || '')
    setPublishAt(source.publishAt ? new Date(source.publishAt).toISOString().slice(0, 16) : '')
    setHtml(source.html || '')
    const nextCategories = normaliseIdList(source.categories)
    setSelectedCategoryRecords([])
    setCategories(nextCategories)
    const nextTags = normaliseIdList(source.tags)
    setSelectedTagRecords([])
    setTags(nextTags)
    const mediaValue = source.featuredMediaId
    if (mediaValue && typeof mediaValue === 'object') {
      setFeaturedMedia(mediaValue)
      setFeaturedMediaId(mediaValue._id || null)
    } else {
      setFeaturedMedia((prev) => {
        if (mediaValue && prev && prev._id === mediaValue) {
          return prev
        }
        return null
      })
      setFeaturedMediaId(mediaValue || null)
    }
    setSlugError('')
    setSaveError('')
    setDirty(Boolean(markDirty))
  }, [normaliseIdList, skipNextOnChangeRef])

  const formatDateTime = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
  }

  const { data: contentData } = useQuery(
    ['content', { tenant: activeTenantId, id }],
    () => getContent({ id }),
    { enabled: !!token && !!activeTenantId && !isNew }
  )

  const { data: versionsData } = useQuery(
    ['contentVersions', { tenant: activeTenantId, id }],
    () => listVersions({ id }),
    { enabled: !!token && !!activeTenantId && !isNew }
  )

  useEffect(() => {
    if (!versionsData) return
    if (!versionsData.length) {
      setPreviewVersion(null)
      setSelectedVersionId(null)
      return
    }
    const selected = selectedVersionId
      ? versionsData.find((item) => String(item._id) === selectedVersionId)
      : null
    if (selected) {
      setPreviewVersion(selected)
      return
    }
    const newest = versionsData[0]
    setPreviewVersion(newest)
    setSelectedVersionId(String(newest._id))
  }, [versionsData, selectedVersionId])

  useEffect(() => {
    if (!contentData) return
    if (skipNextContentSyncRef.current) {
      skipNextContentSyncRef.current = false
      return
    }
    applyContentPayload(contentData, { markDirty: false })
    setSelectedVersionId(contentData.lastVersionId ? String(contentData.lastVersionId) : null)
  }, [contentData, applyContentPayload])

  const createMut = useMutation((payload) => createContent({ payload }), {
    onSuccess: (content) => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
      queryClient.invalidateQueries({ predicate: (query) => ['content', 'contentVersions'].includes(query.queryKey[0]) })
      setDirty(false)
      navigate(`/contents/${content._id}`)
    }
  })

  const updateMut = useMutation(({ id, payload }) => updateContent({ id, payload }), {
    onSuccess: (content) => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
      queryClient.invalidateQueries({ predicate: (query) => ['content', 'contentVersions'].includes(query.queryKey[0]) })
      setDirty(false)
    }
  })

  const isSaving = createMut.isLoading || updateMut.isLoading

  const handleSave = useCallback(async ({ silent = false } = {}) => {
    const trimmedTitle = title.trim()
    const trimmedSlug = slug.trim()

    if (!trimmedTitle) {
      if (!silent) {
        setSaveError('Başlık gereklidir')
      }
      return null
    }

    if (!trimmedSlug) {
      setSlugError('Slug gereklidir')
      if (!silent) {
        setSaveError('Slug gereklidir')
      }
      return null
    }

    setSlugError('')
    if (!silent) {
      setSaveError('')
    }

    let parsedLexical
    try {
      parsedLexical = JSON.parse(latestEditorState || INITIAL_EDITOR_STATE)
    } catch (error) {
      console.error('Editor state parse failed, using fallback.', error)
      parsedLexical = JSON.parse(INITIAL_EDITOR_STATE)
    }

    const payload = {
      title: trimmedTitle,
      slug: trimmedSlug,
      status,
      summary,
      publishAt: publishAt ? new Date(publishAt).toISOString() : undefined,
      lexical: parsedLexical,
      html,
      categories,
      tags,
      featuredMediaId: featuredMediaId || null,
    }

    try {
      if (isNew) {
        return await createMut.mutateAsync(payload)
      }
      return await updateMut.mutateAsync({ id, payload })
    } catch (err) {
      const message = err?.response?.data?.message
      if (typeof message === 'string' && message.toLowerCase().includes('slug')) {
        setSlugError('Bu slug zaten kullanılıyor.')
      }
      if (!silent) {
        setSaveError('Kaydetme işlemi başarısız oldu. Lütfen tekrar deneyin.')
      }
      console.error('Save failed', err)
      throw err
    }
  }, [title, slug, status, summary, publishAt, latestEditorState, html, categories, tags, featuredMediaId, isNew, createMut, updateMut, id])

  const onLexicalChange = useCallback((editorState) => {
    editorState.read(() => {
      const root = $getRoot()
      const textContent = root.getTextContent()
      setHtml(`<p>${textContent.replace(/\n/g, '</p><p>')}</p>`)
      setLatestEditorState(JSON.stringify(editorState.toJSON()))
      if (skipNextOnChangeRef.current) {
        skipNextOnChangeRef.current = false
        return
      }
      setDirty(true)
      setSaveError('')
    })
  }, [skipNextOnChangeRef])

  const handleSelectVersion = (version) => {
    if (!version) return
    setPreviewVersion(version)
    setSelectedVersionId(String(version._id))
    setSaveError('')
  }

  const handleApplyVersion = async () => {
    if (!previewVersion) return

    if (!isNew && dirty) {
      try {
        skipNextContentSyncRef.current = true
        await handleSave({ silent: true })
      } catch (error) {
        skipNextContentSyncRef.current = false
        setSaveError('Değişiklikler kaydedilemedi. Seçilen sürüm yüklenmedi.')
        console.error('Auto-save before switching version failed', error)
        return
      }
    }

    skipNextContentSyncRef.current = true
    setSaveError('')
    applyContentPayload(previewVersion, { markDirty: true })
    setSelectedVersionId(String(previewVersion._id))
  }

  function computeSlug(base) {
    const map = {
      ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a'
    }
    return base
      .split('')
      .map((char) => map[char] ?? char)
      .join('')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const handleCategoryAdd = useCallback((category) => {
    if (!category || !category._id) return
    setCategories((prev) => {
      if (prev.includes(category._id)) {
        return prev
      }
      return [...prev, category._id]
    })
    setSelectedCategoryRecords((prev) => {
      if (prev.some((item) => String(item._id) === String(category._id))) {
        return prev
      }
      return [...prev, category]
    })
    setDirty(true)
    setSaveError('')
  }, [])

  const handleCategoryRemove = useCallback((id) => {
    setCategories((prev) => prev.filter((item) => item !== id))
    setSelectedCategoryRecords((prev) => prev.filter((item) => String(item._id) !== String(id)))
    setDirty(true)
    setSaveError('')
  }, [])

  const handleTagAdd = useCallback((tag) => {
    if (!tag || !tag._id) return
    setTags((prev) => {
      if (prev.includes(tag._id)) {
        return prev
      }
      return [...prev, tag._id]
    })
    setSelectedTagRecords((prev) => {
      if (prev.some((item) => String(item._id) === String(tag._id))) {
        return prev
      }
      return [...prev, tag]
    })
    setDirty(true)
    setSaveError('')
  }, [])

  const handleTagRemove = useCallback((id) => {
    setTags((prev) => prev.filter((item) => item !== id))
    setSelectedTagRecords((prev) => prev.filter((item) => String(item._id) !== String(id)))
    setDirty(true)
    setSaveError('')
  }, [])

  const openMediaPicker = () => {
    setMediaUploadError('')
    setIsMediaPickerOpen(true)
  }

  const handleFeaturedMediaSelect = (media) => {
    setFeaturedMedia(media)
    setFeaturedMediaId(media?._id || null)
    setIsMediaPickerOpen(false)
    setDirty(true)
    setSaveError('')
  }

  const handleFeaturedMediaRemove = () => {
    setFeaturedMedia(null)
    setFeaturedMediaId(null)
    setDirty(true)
    setSaveError('')
  }

  const handleMediaFileUpload = useCallback(
    async (file) => {
      if (!file) return
      if (!file.type?.startsWith('image/')) {
        setMediaUploadError('Sadece görsel dosyaları yükleyebilirsin.')
        return
      }

      setMediaUploadError('')
      setIsUploadingMedia(true)
      try {
        const presign = await mediaAPI.createPresignedUpload({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        })

        await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        })

        const mediaRecord = await mediaAPI.completeUpload({
          key: presign.key,
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
        })

        handleFeaturedMediaSelect(mediaRecord)
        queryClient.invalidateQueries({ queryKey: ['media-picker'] })
      } catch (error) {
        console.error('Media upload failed', error)
        setMediaUploadError(
          error instanceof Error ? error.message : 'Görsel yükleme sırasında bir hata oluştu.'
        )
      } finally {
        setIsUploadingMedia(false)
      }
    },
    [handleFeaturedMediaSelect, queryClient]
  )

  const currentFeaturedMediaId = featuredMediaId
  const featuredMediaThumbnail =
    featuredMedia?.variants?.find((variant) => variant.name === 'thumbnail')?.url || featuredMedia?.url
  const featuredMediaAlt =
    featuredMedia?.altText || featuredMedia?.originalName || featuredMedia?.fileName || 'Seçili görsel'
  const featuredMediaSizeKb = featuredMedia?.size ? Math.max(1, Math.round(featuredMedia.size / 1024)) : null

  const editorContainerRef = useCallback((element) => {
    setEditorAnchorElem(element)
  }, [])

  return (
    <>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
      <div className="xl:col-span-3 space-y-6">
        <section className={`${cardClass} p-6 space-y-5`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Temel Bilgiler</h2>
              <p className="text-sm text-gray-500">Başlık, slug, durum ve özet ayarlarını düzenle.</p>
            </div>
            {!isNew && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                V{contentData?.version ?? 1}
              </span>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700">Başlık</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (!slug) setSlug(computeSlug(e.target.value))
                  setDirty(true)
                  setSaveError('')
                }}
                className={inputClass}
                placeholder="Başlık"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Slug</label>
                <input
                  type="text"
                  value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setDirty(true)
                  setSlugError('')
                  setSaveError('')
                }}
                  className={clsx(inputClass, slugError && 'border-red-300 focus:border-red-400 focus:ring-red-300')}
                  placeholder="ornek-slug"
                />
                {slugError && <p className="mt-1 text-xs text-red-600">{slugError}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">Durum</label>
                <select
                  value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setDirty(true)
                  setSaveError('')
                }}
                  className={inputClass}
                >
                  <option value="draft">Taslak</option>
                  <option value="scheduled">Zamanlanmış</option>
                  <option value="published">Yayında</option>
                  <option value="archived">Arşiv</option>
                </select>
              </div>
              {status === 'scheduled' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Yayın Tarihi</label>
                  <input
                    type="datetime-local"
                    value={publishAt}
                    onChange={(e) => {
                      setPublishAt(e.target.value)
                      setDirty(true)
                      setSaveError('')
                    }}
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700">Özet</label>
              <textarea
                rows={3}
                value={summary}
                onChange={(e) => {
                  setSummary(e.target.value)
                  setDirty(true)
                  setSaveError('')
                }}
                className={textareaClass}
                placeholder="Kısa açıklama"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700">Kategoriler</label>
              <CategoryMultiSelect
                selectedCategories={selectedCategoryRecords}
                onAdd={handleCategoryAdd}
                onRemove={handleCategoryRemove}
              />
            </div>

          </div>
        </section>

        <section className={`${cardClass} space-y-4 p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">İçerik</h2>
            
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white">
            <LexicalComposer initialConfig={{ ...initialConfig, editorState: initialEditorState }}>
              <Toolbar />
              <div className="relative" ref={editorContainerRef}>
                <RichTextPlugin
                  contentEditable={<ContentEditable className="min-h-[260px] px-4 py-3 outline-none prose max-w-none" />}
                  placeholder={<Placeholder />}
                />
                <HistoryPlugin />
                <ListPlugin />
                <ListMaxIndentLevelPlugin maxDepth={4} />
                <LinkPlugin />
                <AutoLinkPlugin matchers={urlMatchers} />
                <CodeHighlightingPlugin />
                <EditorStateHydrator stateJSON={initialEditorState} skipNextOnChangeRef={skipNextOnChangeRef} />
                <OnChangePlugin onChange={onLexicalChange} />
                {editorAnchorElem && <DraggableBlockPlugin anchorElem={editorAnchorElem} />}
                <FloatingTextFormatToolbarPlugin />
              </div>
            </LexicalComposer>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleSave()}
            disabled={(!dirty && !isNew) || isSaving}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
          >
            {isSaving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          {saveError && (
            <span className="text-xs text-red-500">{saveError}</span>
          )}
          {dirty && !saveError && (
            <span className="text-xs text-gray-500">Kaydedilmemiş değişiklikler var.</span>
          )}
          {!isNew && (
            <span className="text-xs text-gray-500">Son güncelleme: {formatDateTime(contentData?.updatedAt)}</span>
          )}
        </div>
      </div>

      <aside className="xl:col-span-1 space-y-6">
        <section className={`${cardClass} space-y-3 p-5`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Sürümler</h3>
            {!isNew && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {versionsData?.length || 0} kayıt
              </span>
            )}
          </div>
          {isNew && <div className="text-xs text-gray-500">Kaydedildikten sonra sürümler görünecek.</div>}
          {!isNew && !versionsData?.length && <div className="text-xs text-gray-500">Sürüm yok.</div>}
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-xs">
            {versionsData?.map((v) => {
              const active = selectedVersionId === String(v._id)
              return (
                <li key={v._id}>
                  <button
                    type="button"
                    onClick={() => handleSelectVersion(v)}
                    className={clsx(
                      'w-full rounded border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-300',
                      active
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-200 hover:bg-blue-50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">#{v.version}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium">
                        {statusLabels[v.status] || v.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px]">
                      {formatDateTime(v.createdAt || v.publishedAt)}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {previewVersion && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">Sürüm #{previewVersion.version}</p>
                  <p className="text-[11px] text-gray-500">
                    {formatDateTime(previewVersion.createdAt || previewVersion.publishedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleApplyVersion}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
                >
                  Bu sürümü yükle
                </button>
              </div>
              {previewVersion.summary && (
                <p className="mt-2 text-gray-700">{previewVersion.summary}</p>
              )}
              {previewVersion.html && (
                <div
                  className="prose prose-sm mt-3 max-h-48 overflow-y-auto rounded bg-white p-3 text-gray-700"
                  dangerouslySetInnerHTML={{ __html: previewVersion.html }}
                />
              )}
            </div>
          )}
        </section>

        <section className={`${cardClass} space-y-3 p-5`}>
          <h3 className="text-sm font-semibold text-gray-900">Öne çıkan görsel</h3>
          {featuredMedia ? (
            <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="h-24 w-24 flex-none overflow-hidden rounded-md bg-gray-100">
                {featuredMediaThumbnail ? (
                  <img
                    src={featuredMediaThumbnail}
                    alt={featuredMediaAlt}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <PhotoIcon className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="truncate text-sm font-medium text-gray-900">
                    {featuredMedia.originalName || featuredMedia.fileName || 'Seçili görsel'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[featuredMedia.mimeType || 'Görsel', featuredMediaSizeKb ? `${featuredMediaSizeKb} KB` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openMediaPicker}
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Değiştir
                  </button>
                  <button
                    type="button"
                    onClick={handleFeaturedMediaRemove}
                    className="inline-flex items-center rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Kaldır
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openMediaPicker}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600"
            >
              <PhotoIcon className="h-8 w-8" />
              <span>Öne çıkan görsel seçin veya yükleyin</span>
            </button>
          )}
        </section>

        <section className={`${cardClass} space-y-3 p-5`}>
          <h3 className="text-sm font-semibold text-gray-900">Etiketler</h3>
          <TagSelector selectedTags={selectedTagRecords} onAdd={handleTagAdd} onRemove={handleTagRemove} />
        </section>

        <section className={`${cardClass} space-y-3 p-5`}>
          <h3 className="text-sm font-semibold text-gray-900">Yakındaki İyileştirmeler</h3>
          <ul className="list-disc space-y-1 pl-4 text-xs text-gray-500">
            <li>Etiket seçimi ve yönetimi</li>
            <li>Sürüm karşılaştırma & geri yükleme</li>
            <li>Medya yerleştirme ve özel bloklar</li>
            <li>İçerik çeviri ve lokalizasyon</li>
          </ul>
        </section>
      </aside>
      </div>

      <Transition.Root show={isMediaPickerOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-40"
          onClose={() => {
            setIsMediaPickerOpen(false)
            setMediaUploadError('')
          }}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-gray-900">
                        Öne çıkan görsel seç
                      </Dialog.Title>
                      <p className="mt-1 text-sm text-gray-500">
                        Medya kütüphanesinden bir görsel seçebilir veya yeni bir görsel yükleyebilirsin.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMediaPickerOpen(false)
                        setMediaUploadError('')
                      }}
                      className="rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    >
                      <span className="sr-only">Kapat</span>
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-4 px-6 py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <label htmlFor="media-picker-search" className="block text-sm font-medium text-gray-700">
                          Arama
                        </label>
                        <input
                          id="media-picker-search"
                          type="search"
                          value={mediaSearch}
                          onChange={(event) => {
                            setMediaSearch(event.target.value)
                            setMediaPage(1)
                          }}
                          placeholder="Dosya adı veya etiket"
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) {
                                handleMediaFileUpload(file)
                              }
                              event.target.value = ''
                            }}
                          />
                          Görsel yükle
                        </label>
                        <button
                          type="button"
                          onClick={() => mediaQuery.refetch()}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <ArrowPathIcon
                            className={clsx('h-4 w-4', mediaQuery.isFetching ? 'animate-spin' : '')}
                          />
                          Yenile
                        </button>
                      </div>
                    </div>

                    {mediaUploadError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                        {mediaUploadError}
                      </div>
                    )}

                    <div className="min-h-[220px] rounded-lg border border-gray-200 bg-gray-50 p-4">
                      {mediaQuery.isLoading ? (
                        <p className="text-sm text-gray-500">Görseller yükleniyor...</p>
                      ) : mediaQuery.isError ? (
                        <p className="text-sm text-red-600">Görseller alınamadı. Lütfen tekrar deneyin.</p>
                      ) : (mediaQuery.data?.items?.length ?? 0) === 0 ? (
                        <p className="text-sm text-gray-500">Henüz görsel yüklenmemiş.</p>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {(mediaQuery.data?.items ?? []).map((item) => {
                            const thumbnail =
                              item.variants?.find((variant) => variant.name === 'thumbnail')?.url || item.url
                            const isActive = item._id === currentFeaturedMediaId

                            return (
                              <button
                                key={item._id}
                                type="button"
                                onClick={() => handleFeaturedMediaSelect(item)}
                                className={clsx(
                                  'flex flex-col overflow-hidden rounded-lg border bg-white text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500',
                                  isActive ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
                                )}
                              >
                                <div className="relative aspect-video bg-gray-100">
                                  {thumbnail ? (
                                    <img src={thumbnail} alt={item.altText || item.originalName || 'Görsel'} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                                      <PhotoIcon className="h-8 w-8" />
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-1 px-3 py-2">
                                  <p className="truncate text-sm font-medium text-gray-900">
                                    {item.originalName || item.fileName || 'Görsel'}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {item.mimeType || 'image'}
                                  </p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        {(mediaQuery.data?.pagination?.total ?? 0)} kayıt bulundu
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMediaPage((prev) => Math.max(1, prev - 1))}
                          disabled={mediaPage <= 1 || mediaQuery.isFetching}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Önceki
                        </button>
                        <span className="text-xs text-gray-500">
                          Sayfa {mediaPage} / {mediaQuery.data?.pagination?.pages ?? 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMediaPage((prev) => prev + 1)}
                          disabled={
                            mediaQuery.isFetching ||
                            mediaPage >= (mediaQuery.data?.pagination?.pages ?? 1)
                          }
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Sonraki
                        </button>
                      </div>
                    </div>

                    {isUploadingMedia && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                        Görsel yükleniyor...
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  )
}

function CodeHighlightingPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    return registerCodeHighlighting(editor)
  }, [editor])
  return null
}

function CategoryMultiSelect({ selectedCategories, onAdd, onRemove }) {
  const containerRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const debouncedSearch = useDebouncedValue(searchTerm, 250)

  const categoryQuery = useQuery(
    ['category-search', debouncedSearch],
    () =>
      listCategories({
        flat: true,
        search: debouncedSearch || undefined,
        limit: 20,
      }),
    {
      enabled: isOpen,
      keepPreviousData: true,
    }
  )

  const options = categoryQuery.data?.categories ?? []
  const selectedIds = useMemo(
    () => new Set((selectedCategories || []).map((item) => String(item._id))),
    [selectedCategories]
  )

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  return (
    <div className="space-y-3">
      <div className="relative" ref={containerRef}>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value)
            if (!isOpen) {
              setIsOpen(true)
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Kategori ara ve seç"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />

        {isOpen && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="max-h-60 divide-y divide-gray-100 overflow-y-auto text-sm">
              {categoryQuery.isLoading ? (
                <div className="px-4 py-3 text-gray-500">Kategoriler yükleniyor…</div>
              ) : options.length === 0 ? (
                <div className="px-4 py-3 text-gray-500">Sonuç bulunamadı.</div>
              ) : (
                options.map((category) => {
                  const id = String(category._id)
                  const isSelected = selectedIds.has(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        if (isSelected) return
                        onAdd(category)
                        setSearchTerm('')
                      }}
                      disabled={isSelected}
                      className={clsx(
                        'flex w-full items-start gap-2 px-4 py-2 text-left transition',
                        isSelected
                          ? 'cursor-default bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-100'
                      )}
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{category.name}</div>
                        <div className="text-xs text-gray-500">{category.slug}</div>
                      </div>
                      {isSelected && <span className="text-xs font-semibold text-blue-600">Seçildi</span>}
                    </button>
                  )
                })
              )}
            </div>
            {categoryQuery.isFetching && !categoryQuery.isLoading && (
              <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                Güncelleniyor…
              </div>
            )}
          </div>
        )}
      </div>

      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCategories.map((category) => {
            const id = String(category._id)
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
              >
                {category.name}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  className="text-blue-500 hover:text-blue-700"
                  aria-label={`${category.name} kategorisini kaldır`}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TagSelector({ selectedTags, onAdd, onRemove }) {
  const containerRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [creationError, setCreationError] = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm, 1000)

  const tagQuery = useQuery(
    ['tag-search', debouncedSearch],
    () =>
      searchTags({
        search: debouncedSearch || undefined,
        limit: 20,
      }),
    {
      enabled: isOpen,
      keepPreviousData: true,
    }
  )

  const options = tagQuery.data?.tags ?? []
  const selectedIds = useMemo(
    () => new Set((selectedTags || []).map((item) => String(item._id))),
    [selectedTags]
  )

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelect = useCallback(
    (tag) => {
      if (!tag || selectedIds.has(String(tag._id))) {
        return
      }
      onAdd(tag)
      setSearchTerm('')
      setCreationError('')
      tagQuery.refetch()
    },
    [onAdd, selectedIds, tagQuery]
  )

  const handleCreate = useCallback(async () => {
    const trimmed = searchTerm.trim()
    if (!trimmed) return

    const existing = options.find((tag) => {
      const title = typeof tag.title === 'string' ? tag.title : ''
      return title.toLowerCase() === trimmed.toLowerCase() || tag.slug?.toLowerCase() === trimmed.toLowerCase()
    })

    if (existing) {
      handleSelect(existing)
      setIsOpen(false)
      return
    }

    if (selectedIds.size && [...selectedIds].some((id) => {
      const tag = selectedTags.find((item) => String(item._id) === id)
      if (!tag) return false
      const title = typeof tag.title === 'string' ? tag.title : ''
      return title.toLowerCase() === trimmed.toLowerCase() || tag.slug?.toLowerCase() === trimmed.toLowerCase()
    })) {
      setSearchTerm('')
      setCreationError('')
      return
    }

    setCreationError('')
    setIsCreating(true)
    try {
      const tag = await createTag({ title: trimmed })
      handleSelect(tag)
      setIsOpen(false)
    } catch (error) {
      console.error('Tag creation failed', error)
      setCreationError(error instanceof Error ? error.message : 'Etiket oluşturulamadı.')
    } finally {
      setIsCreating(false)
    }
  }, [createTag, handleSelect, options, searchTerm, selectedIds, selectedTags])

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleCreate()
      } else if (event.key === 'Escape') {
        setIsOpen(false)
      }
    },
    [handleCreate]
  )

  return (
    <div className="space-y-3">
      <div className="relative" ref={containerRef}>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value)
            if (!isOpen) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder="Etiket ara veya oluştur"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
        {(creationError || isCreating) && (
          <p className={clsx('mt-1 text-xs', creationError ? 'text-red-600' : 'text-blue-600')}>
            {isCreating ? 'Yeni etiket oluşturuluyor…' : creationError}
          </p>
        )}

        {isOpen && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="max-h-60 divide-y divide-gray-100 overflow-y-auto text-sm">
              {tagQuery.isLoading ? (
                <div className="px-4 py-3 text-gray-500">Etiketler yükleniyor…</div>
              ) : options.length === 0 ? (
                <div className="px-4 py-3 text-gray-500">Sonuç bulunamadı.</div>
              ) : (
                options.map((tag) => {
                  const id = String(tag._id)
                  const title = typeof tag.title === 'string' ? tag.title : tag.slug
                  const isSelected = selectedIds.has(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelect(tag)}
                      disabled={isSelected}
                      className={clsx(
                        'flex w-full items-start gap-2 px-4 py-2 text-left transition',
                        isSelected
                          ? 'cursor-default bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-100'
                      )}
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{title}</div>
                        <div className="text-xs text-gray-500">{tag.slug}</div>
                      </div>
                      {isSelected && <span className="text-xs font-semibold text-blue-600">Seçildi</span>}
                    </button>
                  )
                })
              )}
            </div>
            {tagQuery.isFetching && !tagQuery.isLoading && (
              <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                Güncelleniyor…
              </div>
            )}
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
              Enter tuşu ile yeni etiket oluşturabilirsiniz.
            </div>
          </div>
        )}
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => {
            const id = String(tag._id)
            const title = typeof tag.title === 'string' ? tag.title : tag.slug
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700"
              >
                {title}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  className="text-green-500 hover:text-green-700"
                  aria-label={`${title} etiketini kaldır`}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

const BLOCK_OPTIONS = [
  { value: 'paragraph', label: 'Paragraf' },
  { value: 'h1', label: 'Başlık 1' },
  { value: 'h2', label: 'Başlık 2' },
  { value: 'quote', label: 'Alıntı' },
  { value: 'code', label: 'Kod Bloğu' },
]

function Toolbar() {
  const [editor] = useLexicalComposerContext()
  const [formatState, setFormatState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    code: false,
  })
  const [blockType, setBlockType] = useState('paragraph')
  const [blockFormat, setBlockFormat] = useState('left')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR)
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR)
  const [isLinkActive, setIsLinkActive] = useState(false)

  const applyTextStyle = useCallback(
    (styleUpdates) => {
      editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return
        }

        const nodes = selection.getNodes()
        nodes.forEach((node) => {
          if (!$isTextNode(node)) {
            return
          }

          const styleObj = parseStyleString(node.getStyle())
          Object.entries(styleUpdates).forEach(([key, value]) => {
            if (value === null || value === '' || (key === 'background-color' && value === DEFAULT_HIGHLIGHT_COLOR)) {
              delete styleObj[key]
            } else {
              styleObj[key] = value
            }
          })
          node.setStyle(styleObjectToString(styleObj))
        })
      })
    },
    [editor]
  )

  const applyBlockType = useCallback(
    (type) => {
      if (type === 'bullet-list') {
        editor.dispatchCommand(
          blockType === 'bullet-list' ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
          undefined
        )
        setBlockType(blockType === 'bullet-list' ? 'paragraph' : 'bullet-list')
        return
      }
      if (type === 'numbered-list') {
        editor.dispatchCommand(
          blockType === 'numbered-list' ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
          undefined
        )
        setBlockType(blockType === 'numbered-list' ? 'paragraph' : 'numbered-list')
        return
      }

      editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return
        }

        switch (type) {
          case 'paragraph':
            $setBlocksType(selection, () => $createParagraphNode())
            break
          case 'quote':
            $setBlocksType(selection, () => $createQuoteNode())
            break
          case 'code':
            $setBlocksType(selection, () => $createCodeNode())
            break
          case 'h1':
          case 'h2':
            $setBlocksType(selection, () => $createHeadingNode(type))
            break
          default:
            break
        }
      })
      setBlockType(type)
    },
    [editor, blockType]
  )

  const updateToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return
      }

      setFormatState({
        bold: selection.hasFormat('bold'),
        italic: selection.hasFormat('italic'),
        underline: selection.hasFormat('underline'),
        strikethrough: selection.hasFormat('strikethrough'),
        code: selection.hasFormat('code'),
      })

      const anchorNode = selection.anchor.getNode()
      let element = null

      if (anchorNode.getType() === 'root') {
        element = anchorNode.getLastChild()
        if (!element) {
          setBlockType('paragraph')
          setBlockFormat('left')
        }
      } else {
        element = anchorNode.getTopLevelElementOrThrow()
      }

      if (!element || element.getType() === 'root') {
        element = element?.getLastChild() || null
        if (!element) {
          setBlockType('paragraph')
          setBlockFormat('left')
          return
        }
      }

      if ($isListNode(element)) {
        setBlockType(element.getTag() === 'ol' ? 'numbered-list' : 'bullet-list')
      } else {
        const parent = element.getParent()
        if ($isListNode(parent)) {
          setBlockType(parent.getTag() === 'ol' ? 'numbered-list' : 'bullet-list')
        } else {
          const type = element.getType()
          if (type === 'heading') {
            setBlockType(element.getTag())
          } else if (type === 'quote') {
            setBlockType('quote')
          } else if (type === 'code') {
            setBlockType('code')
          } else {
            setBlockType('paragraph')
          }
        }
      }

      setBlockFormat(element.getFormatType() || 'left')

      const nodes = selection.getNodes()
      let size = null
      let color = null
      let background = null
      let hasLink = false

      nodes.forEach((node) => {
        if ($isTextNode(node)) {
          const styleMap = parseStyleString(node.getStyle())
          if (styleMap['font-size']) {
            const parsed = parseInt(styleMap['font-size'], 10)
            if (!Number.isNaN(parsed)) {
              size = parsed
            }
          }
          if (styleMap.color) {
            color = toHexColor(styleMap.color)
          }
          if (styleMap['background-color']) {
            background = toHexColor(styleMap['background-color'])
          }
          const parent = node.getParent()
          if (parent && parent.getType && parent.getType() === 'link') {
            hasLink = true
          }
        } else if (node.getType && node.getType() === 'link') {
          hasLink = true
        }
      })

      setFontSize(size || DEFAULT_FONT_SIZE)
      setTextColor(color || DEFAULT_TEXT_COLOR)
      setHighlightColor(background || DEFAULT_HIGHLIGHT_COLOR)
      setIsLinkActive(hasLink)
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
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar()
        })
      }),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload)
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload)
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, updateToolbar])

  useEffect(() => {
    updateToolbar()
  }, [updateToolbar])

  const handleBlockChange = (event) => {
    applyBlockType(event.target.value)
  }

  const handleFontSizeChange = (delta) => {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta))
    setFontSize(next)
    applyTextStyle({ 'font-size': `${next}px` })
  }

  const handleFontSizeInput = (event) => {
    const value = parseInt(event.target.value, 10)
    if (Number.isNaN(value)) {
      return
    }
    const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, value))
    setFontSize(clamped)
    applyTextStyle({ 'font-size': `${clamped}px` })
  }

  const handleTextColorChange = (color) => {
    setTextColor(color)
    applyTextStyle({ color })
  }

  const handleHighlightChange = (color) => {
    setHighlightColor(color)
    applyTextStyle({ 'background-color': color })
  }

  const toggleLink = () => {
    if (isLinkActive) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    } else {
      const url = window.prompt('Bağlantı URL', 'https://')
      if (!url) return
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
    }
  }

  const clearInlineStyles = () => {
    setTextColor(DEFAULT_TEXT_COLOR)
    setHighlightColor(DEFAULT_HIGHLIGHT_COLOR)
    setFontSize(DEFAULT_FONT_SIZE)
    applyTextStyle({ color: null, 'background-color': null, 'font-size': null })
  }

  return (
    <div className="editor-toolbar mb-4">
      <ToolbarButton
        title="Geri al"
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        disabled={!canUndo}
      >
        ↺
      </ToolbarButton>
      <ToolbarButton
        title="İleri al"
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        disabled={!canRedo}
      >
        ↻
      </ToolbarButton>
      <Divider />
      <select
        value={blockType}
        onChange={handleBlockChange}
        className="editor-toolbar__select"
      >
        {BLOCK_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value="bullet-list">Madde işaretli liste</option>
        <option value="numbered-list">Numaralı liste</option>
      </select>
      <ToolbarButton
        title="Madde işaretli liste"
        onClick={() => applyBlockType('bullet-list')}
        active={blockType === 'bullet-list'}
      >
        •
      </ToolbarButton>
      <ToolbarButton
        title="Numaralı liste"
        onClick={() => applyBlockType('numbered-list')}
        active={blockType === 'numbered-list'}
      >
        1.
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="Kalın"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        active={formatState.bold}
      >
        <span className="font-semibold">B</span>
      </ToolbarButton>
      <ToolbarButton
        title="İtalik"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        active={formatState.italic}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        title="Altı çizili"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        active={formatState.underline}
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton
        title="Üzeri çizili"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
        active={formatState.strikethrough}
      >
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarButton
        title="Kod"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
        active={formatState.code}
      >
        {'<>'}
      </ToolbarButton>
      <ToolbarButton
        title="Bağlantı"
        onClick={toggleLink}
        active={isLinkActive}
      >
        🔗
      </ToolbarButton>
      <Divider />
      <div className="flex items-center gap-1">
        <ToolbarButton
          title="Yazı boyutunu küçült"
          onClick={() => handleFontSizeChange(-1)}
          disabled={fontSize <= FONT_MIN}
        >
          −
        </ToolbarButton>
        <input
          type="number"
          min={FONT_MIN}
          max={FONT_MAX}
          value={fontSize}
          onChange={handleFontSizeInput}
          className="editor-toolbar__font-input"
        />
        <ToolbarButton
          title="Yazı boyutunu büyüt"
          onClick={() => handleFontSizeChange(1)}
          disabled={fontSize >= FONT_MAX}
        >
          +
        </ToolbarButton>
      </div>
      <Divider />
      <ColorPicker
        label="Metin"
        value={textColor}
        onChange={handleTextColorChange}
      />
      <ColorPicker
        label="Vurgu"
        value={highlightColor}
        onChange={handleHighlightChange}
      />
      <ToolbarButton title="Stili temizle" onClick={clearInlineStyles}>
        Aa
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="Sola hizala"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}
        active={blockFormat === 'left'}
      >
        Sol
      </ToolbarButton>
      <ToolbarButton
        title="Ortala"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}
        active={blockFormat === 'center'}
      >
        Ort
      </ToolbarButton>
      <ToolbarButton
        title="Sağa hizala"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}
        active={blockFormat === 'right'}
      >
        Sağ
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({ children, onClick, active = false, disabled = false, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={clsx('editor-toolbar__button', active && 'is-active', disabled && 'is-disabled')}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="editor-toolbar__divider" aria-hidden="true" />
}

function ColorPicker({ label, value, onChange }) {
  return (
    <label className="editor-toolbar__color-picker">
      <span className="editor-toolbar__color-label">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="editor-toolbar__color-input"
      />
    </label>
  )
}

function EditorStateHydrator({ stateJSON, skipNextOnChangeRef }) {
  const [editor] = useLexicalComposerContext()
  const appliedStateRef = useRef(null)

  useEffect(() => {
    if (!stateJSON) return
    if (appliedStateRef.current === stateJSON) return

    let parsedState
    try {
      parsedState = editor.parseEditorState(stateJSON)
    } catch (error) {
      console.error('Editor state hydration failed', error)
      return
    }

    skipNextOnChangeRef.current = true
    editor.setEditorState(parsedState)
    appliedStateRef.current = stateJSON
  }, [editor, stateJSON, skipNextOnChangeRef])

  return null
}

function ListMaxIndentLevelPlugin({ maxDepth }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      INDENT_CONTENT_COMMAND,
      () => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return false
        }
        const anchorNode = selection.anchor.getNode()
        const element = anchorNode.getType() === 'root' ? anchorNode.getLastChild() : anchorNode.getTopLevelElementOrThrow()
        if ($isListNode(element) && element.getIndent() >= maxDepth) {
          return true
        }
        return false
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, maxDepth])

  return null
}
