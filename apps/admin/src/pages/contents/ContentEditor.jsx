import clsx from 'clsx'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContent, createContent, updateContent, listVersions, deleteContentVersions, setContentGalleries } from '../../lib/api/contents'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { listCategories } from '../../lib/api/categories'
import { searchTags, createTag } from '../../lib/api/tags'
import { galleriesAPI } from '../../lib/galleriesAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $insertNodes,
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
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
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
import TableActionMenuPlugin from './plugins/TableActionMenuPlugin.jsx'
import TableHoverActionsPlugin from './plugins/TableHoverActionsPlugin.jsx'
import TableCellResizerPlugin from './plugins/TableCellResizerPlugin.jsx'
import TableSelectionPlugin from './plugins/TableSelectionPlugin.jsx'
import ImagePlugin, { INSERT_IMAGE_COMMAND } from './plugins/ImagePlugin.jsx'
import VideoPlugin, { INSERT_VIDEO_COMMAND } from './plugins/VideoPlugin.jsx'
import { ImageNode } from './nodes/ImageNode.jsx'
import { VideoNode } from './nodes/VideoNode.jsx'
import {
  TableNode,
  TableRowNode,
  TableCellNode,
  $createTableWithDimensions,
  $createTableNode,
  $createTableRowNode,
  $createTableCellNode
} from './nodes/TableNode.jsx'
import { PhotoIcon, TrashIcon } from '@heroicons/react/24/outline'
import MediaPickerModal from './components/MediaPickerModal.jsx'
import TableDimensionSelector from './components/TableDimensionSelector.jsx'

const DEFAULT_FONT_SIZE = 12
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

function formatDateTimeLocal(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60000)
  return localDate.toISOString().slice(0, 16)
}

function toDateTimeInputValue(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return formatDateTimeLocal(date)
}

const toHexColor = (color) => {
  if (!color) return ''
  if (color.startsWith('#')) return color
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i)
  if (rgbMatch) {
    return `#${rgbMatch.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
  }
  return color
}

// Lexical Playground inspired theme
const theme = {
  paragraph: 'editor-paragraph',
  heading: {
    h1: 'editor-heading-h1',
    h2: 'editor-heading-h2',
    h3: 'editor-heading-h3',
    h4: 'editor-heading-h4',
    h5: 'editor-heading-h5',
    h6: 'editor-heading-h6',
  },
  quote: 'editor-quote',
  code: 'editor-code',
  list: {
    ul: 'editor-ul',
    ol: 'editor-ol',
    listitem: 'editor-listitem',
    listitemChecked: 'editor-listitem-checked',
    listitemUnchecked: 'editor-listitem-unchecked',
    nested: {
      listitem: 'editor-nested-listitem',
    },
  },
  link: 'editor-link',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    underline: 'editor-text-underline',
    strikethrough: 'editor-text-strikethrough',
    underlineStrikethrough: 'editor-text-underlineStrikethrough',
    code: 'editor-text-code',
    subscript: 'editor-text-subscript',
    superscript: 'editor-text-superscript',
  },
}

const initialConfig = {
  namespace: 'content-editor',
  theme,
  nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, CodeHighlightNode, LinkNode, AutoLinkNode, ImageNode, VideoNode, TableNode, TableRowNode, TableCellNode],
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

  const { data: tenantSettingsData } = useQuery({
    queryKey: ['tenants', 'settings'],
    queryFn: tenantAPI.getSettings,
    staleTime: 5 * 60 * 1000,
  })

  const featureFlags = tenantSettingsData?.features || {}
  const allowScheduling = Boolean(featureFlags.contentScheduling)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState('draft')
  const [summary, setSummary] = useState('')
  const [publishAt, setPublishAt] = useState(() => formatDateTimeLocal())
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
  const [selectedVersionIds, setSelectedVersionIds] = useState([])
  const [previewVersion, setPreviewVersion] = useState(null)
  const [versionActionError, setVersionActionError] = useState('')
  const [featuredMedia, setFeaturedMedia] = useState(null)
  const [featuredMediaId, setFeaturedMediaId] = useState(null)
  const [mediaPickerState, setMediaPickerState] = useState({ open: false, mode: 'image', onSelect: null })
  const [isTableSelectorOpen, setIsTableSelectorOpen] = useState(false)
  const [editorAnchorElem, setEditorAnchorElem] = useState(null)
  const [attachedGalleries, setAttachedGalleries] = useState([])
  const [selectedGalleryIds, setSelectedGalleryIds] = useState([])
  const [galleriesDirty, setGalleriesDirty] = useState(false)
  const [gallerySearch, setGallerySearch] = useState('')
  const [galleryError, setGalleryError] = useState('')
  const skipNextOnChangeRef = useRef(false)
  const skipNextContentSyncRef = useRef(false)
  const cardClass = 'rounded-xl border border-gray-200 bg-white shadow-sm'
  const inputClass = 'mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:bg-white focus:ring-blue-500'
  const textareaClass = inputClass
  const statusOptions = useMemo(() => {
    const base = [
      { value: 'draft', label: statusLabels.draft },
      { value: 'published', label: statusLabels.published },
      { value: 'archived', label: statusLabels.archived },
    ]

    if (allowScheduling || status === 'scheduled') {
      base.splice(1, 0, { value: 'scheduled', label: statusLabels.scheduled })
    }

    return base
  }, [allowScheduling, status])
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
    const formattedPublishAt = toDateTimeInputValue(source.publishAt || source.publishedAt)
    setPublishAt(() => {
      if (formattedPublishAt) {
        return formattedPublishAt
      }
      if (source.status === 'scheduled' || source.status === 'published') {
        return formatDateTimeLocal()
      }
      return ''
    })
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
    const galleries = Array.isArray(source.galleries) ? source.galleries : []
    setAttachedGalleries(galleries)
    setSelectedGalleryIds(galleries.map((gallery) => String(gallery.id || gallery._id)).filter(Boolean))
    setGalleriesDirty(false)
    setGalleryError('')
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

  const { data: versionsPayload } = useQuery(
    ['contentVersions', { tenant: activeTenantId, id }],
    () => listVersions({ id }),
    { enabled: !!token && !!activeTenantId && !isNew }
  )

  const galleriesListQuery = useQuery(
    ['galleries', 'content-link', { tenant: activeTenantId, search: gallerySearch }],
    () => galleriesAPI.list({ search: gallerySearch, limit: 100 }),
    { enabled: !!token && !!activeTenantId }
  )

  const versionsData = useMemo(() => versionsPayload?.versions ?? [], [versionsPayload])
  const deletedVersionsData = useMemo(() => versionsPayload?.deletedVersions ?? [], [versionsPayload])
  const hasPublishedVersion = useMemo(
    () => versionsData.some((item) => item.status === 'published'),
    [versionsData]
  )

  const availableGalleries = useMemo(() => {
    const resultMap = new Map()
    const listItems = galleriesListQuery.data?.items || []
    listItems.forEach((gallery) => {
      resultMap.set(gallery.id, gallery)
    })
    attachedGalleries.forEach((gallery) => {
      const key = gallery.id || gallery._id
      if (key && !resultMap.has(key)) {
        resultMap.set(key, gallery)
      }
    })
    return Array.from(resultMap.values())
  }, [galleriesListQuery.data, attachedGalleries])

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
    if (!versionsData) return
    setSelectedVersionIds((prev) =>
      prev.filter((id) => {
        const version = versionsData.find((item) => String(item._id) === id)
        return version && version.status !== 'published'
      })
    )
  }, [versionsData])

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

  const setGalleriesMut = useMutation(
    (galleryIds) => setContentGalleries({ id, galleryIds }),
    {
      onMutate: () => setGalleryError(''),
      onSuccess: (galleries) => {
        setAttachedGalleries(galleries)
        setSelectedGalleryIds(galleries.map((item) => String(item.id || item._id)))
        setGalleriesDirty(false)
        queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'content' })
        queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'galleries' })
      },
      onError: (error) => {
        const message = error?.response?.data?.message || error.message || 'Galeriler güncellenemedi.'
        setGalleryError(message)
      }
    }
  )

  const deleteVersionsMut = useMutation(
    ({ versionIds }) => deleteContentVersions({ id, versionIds }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['contents'] })
        queryClient.invalidateQueries({ predicate: (query) => ['content', 'contentVersions'].includes(query.queryKey[0]) })
        setVersionActionError('')
        setSelectedVersionIds([])
      },
      onError: (error) => {
        const message = error?.response?.data?.message
        setVersionActionError(typeof message === 'string' ? message : 'Sürüm silme işlemi başarısız oldu.')
      },
    }
  )

  const isSaving = createMut.isLoading || updateMut.isLoading
  const isDeletingVersions = deleteVersionsMut.isLoading

  const handleGalleryToggle = useCallback((galleryId, checked) => {
    setSelectedGalleryIds((prev) => {
      const idString = String(galleryId)
      if (checked) {
        if (prev.includes(idString)) return prev
        return [...prev, idString]
      }
      return prev.filter((value) => value !== idString)
    })
    setGalleriesDirty(true)
  }, [])

  const handleGallerySave = useCallback(() => {
    if (isNew) return
    setGalleriesMut.mutate(selectedGalleryIds)
  }, [isNew, selectedGalleryIds, setGalleriesMut])

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

    const shouldSendPublishAt = status === 'scheduled' || status === 'published'
    const payload = {
      title: trimmedTitle,
      slug: trimmedSlug,
      status,
      summary,
      publishAt: publishAt && shouldSendPublishAt ? new Date(publishAt).toISOString() : undefined,
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

  const onLexicalChange = useCallback((editorState, editor) => {
    editorState.read(() => {
      const root = $getRoot()
      const htmlString = $generateHtmlFromNodes(editor, null)
      setHtml(htmlString)
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
    setVersionActionError('')
  }

  const handleToggleVersionSelection = useCallback((version, nextChecked) => {
    if (!version || version.status === 'published') return
    const versionId = String(version._id)
    setSelectedVersionIds((prev) => {
      if (nextChecked) {
        if (prev.includes(versionId)) {
          return prev
        }
        return [...prev, versionId]
      }
      return prev.filter((item) => item !== versionId)
    })
    setVersionActionError('')
  }, [])

  const handleDeleteSelectedVersions = useCallback(async () => {
    if (!selectedVersionIds.length || isDeletingVersions) return
    const confirmation = window.confirm('Seçili sürümleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')
    if (!confirmation) return
    const deletableMap = selectedVersionIds
      .map((id) => {
        const version = versionsData?.find((item) => String(item._id) === id)
        return { id, version }
      })
      .filter((entry) => entry.version && entry.version.status !== 'published')

    if (!deletableMap.length) {
      setVersionActionError('Yayındaki sürümler silinemez.')
      return
    }

    const idsToDelete = deletableMap.map((entry) => entry.id)

    if (idsToDelete.includes(selectedVersionId)) {
      setPreviewVersion(null)
      setSelectedVersionId(null)
    }
    setVersionActionError('')
    try {
      await deleteVersionsMut.mutateAsync({ versionIds: idsToDelete })
    } catch (error) {
      console.error('Version delete failed', error)
    }
  }, [selectedVersionIds, isDeletingVersions, selectedVersionId, deleteVersionsMut, versionsData])

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

  const openMediaPicker = useCallback((options) => {
    setMediaPickerState({
      open: true,
      mode: options?.mode || 'image',
      onSelect: options?.onSelect || null,
    })
  }, [])

  const closeMediaPicker = useCallback(() => {
    setMediaPickerState((prev) => ({ ...prev, open: false, onSelect: null }))
  }, [])

  const handleFeaturedMediaSelect = (media) => {
    setFeaturedMedia(media)
    setFeaturedMediaId(media?._id || null)
    closeMediaPicker()
    setDirty(true)
    setSaveError('')
  }

  const handleFeaturedMediaRemove = () => {
    setFeaturedMedia(null)
    setFeaturedMediaId(null)
    setDirty(true)
    setSaveError('')
  }


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
              <p className="text-sm text-gray-500">Başlık, slug ve özet ayarlarını düzenle.</p>
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
            <LexicalComposer initialConfig={initialConfig}>
              <Toolbar
                openMediaPicker={openMediaPicker}
                isTableSelectorOpen={isTableSelectorOpen}
                setIsTableSelectorOpen={setIsTableSelectorOpen}
              />
              <ImagePlugin />
              <VideoPlugin />
              <div className="relative" ref={editorContainerRef}>
                <RichTextPlugin
                  contentEditable={<ContentEditable className="min-h-[260px] px-4 py-3 outline-none prose max-w-none" />}
                  placeholder={<Placeholder />}
                  ErrorBoundary={LexicalErrorBoundary}
                />
                <HistoryPlugin />
                <ListPlugin />
                <ListMaxIndentLevelPlugin maxDepth={4} />
                <LinkPlugin />
                <AutoLinkPlugin matchers={urlMatchers} />
                <CodeHighlightingPlugin />
                <EditorStateHydrator stateJSON={initialEditorState} skipNextOnChangeRef={skipNextOnChangeRef} />
                <OnChangePlugin onChange={onLexicalChange} />
                <TablePastePlugin />
                {editorAnchorElem && <DraggableBlockPlugin anchorElem={editorAnchorElem} />}
                {editorAnchorElem && <TableActionMenuPlugin anchorElem={editorAnchorElem} />}
                {editorAnchorElem && <TableHoverActionsPlugin anchorElem={editorAnchorElem} />}
                {editorAnchorElem && <TableCellResizerPlugin anchorElem={editorAnchorElem} />}
                {editorAnchorElem && <TableSelectionPlugin anchorElem={editorAnchorElem} />}
                <FloatingTextFormatToolbarPlugin />
              </div>
            </LexicalComposer>
          </div>
        </section>

      </div>

      <aside className="xl:col-span-1 space-y-6">
        <section className={`${cardClass} space-y-4 p-5`}>
          <h3 className="text-sm font-semibold text-gray-900">Yayınlama</h3>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Durum</label>
            <select
              value={status}
              onChange={(e) => {
                const nextStatus = e.target.value
                if (nextStatus === 'scheduled' && !allowScheduling && status !== 'scheduled') {
                  setSaveError('Bu tenant için içerik zamanlama özelliği kapalı.')
                  return
                }
                setStatus(nextStatus)
                setPublishAt((prev) => {
                  if (nextStatus === 'scheduled') {
                    return prev || formatDateTimeLocal()
                  }
                  if (nextStatus === 'published') {
                    return prev || formatDateTimeLocal()
                  }
                  return prev
                })
                setDirty(true)
                setSaveError('')
              }}
              className={inputClass}
            >
              {statusOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.value === 'scheduled' && !allowScheduling && status !== 'scheduled'}
                >
                  {option.label}
                </option>
              ))}
            </select>
            {!allowScheduling && status !== 'scheduled' && (
              <p className="mt-1 text-xs text-gray-500">Bu tenant için içerik zamanlama özelliği kapalı.</p>
            )}
            {!allowScheduling && status === 'scheduled' && (
              <p className="mt-1 text-xs text-amber-600">
                Zamanlama bu tenant için kapalı; mevcut içerik zamanlanmış durumda. Durumu değiştirdiğinizde yeniden zamanlayamazsınız.
              </p>
            )}
          </div>
          {(status === 'scheduled' || status === 'published') && (
            <div>
              <label className="block text-sm font-semibold text-gray-700">
                {status === 'scheduled' ? 'Planlanan Yayın Tarihi' : 'Yayın Tarihi'}
              </label>
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
              {status === 'published' && (
                <p className="mt-1 text-xs text-gray-500">Durum "Yayında" olduğunda tarih varsayılan olarak şuanı alır, dilerseniz düzenleyebilirsiniz.</p>
              )}
            </div>
          )}
        </section>
        {!isNew && (
          <section className={`${cardClass} space-y-4 p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Bağlı Galeriler</h3>
                <p className="text-xs text-gray-600">İçerikle ilişkilendirilecek galerileri seç.</p>
              </div>
              <a
                href="/galeriler"
                className="text-xs font-medium text-blue-600 hover:text-blue-500"
                target="_blank"
                rel="noreferrer"
              >
                Galerileri yönet
              </a>
            </div>

            <input
              type="search"
              placeholder="Galeri ara..."
              value={gallerySearch}
              onChange={(e) => setGallerySearch(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />

            {galleriesListQuery.isLoading ? (
              <p className="text-sm text-gray-500">Galeriler yükleniyor...</p>
            ) : availableGalleries.length === 0 ? (
              <p className="text-sm text-gray-500">Aramana uyan galeri bulunamadı.</p>
            ) : (
              <div className="space-y-2">
                {availableGalleries.map((gallery) => {
                  const id = String(gallery.id || gallery._id)
                  const checked = selectedGalleryIds.includes(id)
                  return (
                    <label
                      key={id}
                      className={clsx(
                        'flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm shadow-sm',
                        checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-300'
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{gallery.title}</span>
                        <span className="text-xs text-gray-500">{gallery.items?.length || 0} medya · {gallery.status === 'published' ? 'Yayında' : 'Taslak'}</span>
                      </div>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={checked}
                        onChange={(e) => handleGalleryToggle(id, e.target.checked)}
                      />
                    </label>
                  )
                })}
              </div>
            )}

            {galleryError && <p className="text-xs text-red-600">{galleryError}</p>}

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleGallerySave}
                disabled={isNew || !galleriesDirty || setGalleriesMut.isLoading}
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
              >
                {setGalleriesMut.isLoading ? 'Kaydediliyor...' : 'Bağlantıları Kaydet'}
              </button>
            </div>

            {attachedGalleries.length > 0 && (
              <div className="space-y-2 border-t border-gray-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bağlı galeriler</p>
                <ul className="space-y-1 text-xs text-gray-600">
                  {attachedGalleries.map((gallery) => (
                    <li key={gallery.id || gallery._id} className="truncate">
                      • {gallery.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {isNew && (
          <section className={`${cardClass} space-y-3 p-5`}>
            <h3 className="text-sm font-semibold text-gray-900">Bağlı Galeriler</h3>
            <p className="text-sm text-gray-600">
              Galeri eklemek için önce içeriği kaydet. İçerik oluşturulduktan sonra galerileri bu panelden ilişkilendirebilirsin.
            </p>
          </section>
        )}
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
                    onClick={() => openMediaPicker({ mode: 'image', onSelect: handleFeaturedMediaSelect })}
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
              onClick={() => openMediaPicker({ mode: 'image', onSelect: handleFeaturedMediaSelect })}
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
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Sürümler</h3>
            {!isNew && (
              <div className="flex items-center gap-2">
                {selectedVersionIds.length > 0 && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                    {selectedVersionIds.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleDeleteSelectedVersions}
                  disabled={!selectedVersionIds.length || isDeletingVersions}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Seçili sürümleri sil"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Seçili sürümleri sil</span>
                </button>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {versionsData?.length || 0} kayıt
                </span>
              </div>
            )}
          </div>
          {isNew && <div className="text-xs text-gray-500">Kaydedildikten sonra sürümler görünecek.</div>}
          {!isNew && versionActionError && (
            <div className="text-xs text-red-500">{versionActionError}</div>
          )}
          {!isNew && versionsData?.length === 0 && (
            <div className="text-xs text-gray-500">Sürüm yok.</div>
          )}
          {!isNew && hasPublishedVersion && (
            <div className="text-[11px] text-gray-500">Yayındaki sürümler silinemez.</div>
          )}
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-xs">
            {versionsData?.map((v) => {
              const versionKey = String(v._id)
              const active = selectedVersionId === versionKey
              const checked = selectedVersionIds.includes(versionKey)
              const createdDisplay = formatDateTime(v.createdAt || v.publishedAt)
              const isPublished = v.status === 'published'
              return (
                <li key={versionKey}>
                  <div
                    className={clsx(
                      'flex items-start gap-2 rounded border px-3 py-2 transition',
                      active
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-200 hover:bg-blue-50'
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Sürüm ${v.version} silme seçimi`}
                      className={clsx(
                        'mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-400',
                        isPublished && 'cursor-not-allowed opacity-40'
                      )}
                      checked={checked}
                      disabled={isPublished}
                      onChange={(event) => handleToggleVersionSelection(v, event.target.checked)}
                      title={isPublished ? 'Yayındaki sürümler silinemez.' : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => handleSelectVersion(v)}
                      className="flex-1 cursor-pointer bg-transparent text-left focus:outline-none"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">#{v.version}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium">
                          {statusLabels[v.status] || v.status}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px]">{createdDisplay}</div>
                    </button>
                  </div>
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
          {!!deletedVersionsData.length && (
            <div className="border-t border-gray-200 pt-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">Silme geçmişi</h4>
                <span className="text-[11px] text-gray-500">{deletedVersionsData.length} kayıt</span>
              </div>
              <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1 text-xs">
                {deletedVersionsData.map((item) => {
                  const deletedKey = String(item._id)
                  const deletedByText = item.deletedByDisplayName
                    || item.deletedBy?.name
                    || item.deletedBy?.email
                    || 'Bilinmeyen kullanıcı'
                  return (
                    <li key={deletedKey} className="rounded border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">#{item.version}</span>
                        <span className="text-[11px] text-rose-600">{formatDateTime(item.deletedAt)}</span>
                      </div>
                      {item.title && (
                        <div className="mt-1 text-[11px] text-rose-700">{item.title}</div>
                      )}
                      <div className="mt-1 text-[11px] text-rose-600">{deletedByText} tarafından silindi</div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>

        <section className={`${cardClass} sticky top-4 space-y-3 p-5 shadow-md`}>
          <div className="space-y-1 text-xs text-gray-500">
            {dirty && !saveError && <p>Kaydedilmemiş değişiklikler var.</p>}
            {!isNew && (
              <p>Son güncelleme: {formatDateTime(contentData?.updatedAt)}</p>
            )}
          </div>
          <button
            onClick={() => handleSave()}
            disabled={(!dirty && !isNew) || isSaving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
          >
            {isSaving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          {saveError && (
            <span className="text-xs text-red-500">{saveError}</span>
          )}
        </section>
      </aside>
      </div>

      <MediaPickerModal
        isOpen={mediaPickerState.open}
        mode={mediaPickerState.mode}
        onClose={closeMediaPicker}
        onSelect={(item) => {
          mediaPickerState.onSelect?.(item)
          closeMediaPicker()
        }}
      />
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
  { value: 'paragraph', label: 'Normal' },
  { value: 'h1', label: 'Başlık 1' },
  { value: 'h2', label: 'Başlık 2' },
  { value: 'h3', label: 'Başlık 3' },
  { value: 'quote', label: 'Alıntı' },
  { value: 'code', label: 'Kod Bloğu' },
]

function Toolbar({ openMediaPicker = null, isTableSelectorOpen = false, setIsTableSelectorOpen = null }) {
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
  const tableSelectorRef = useRef(null)

  const handleInsertImage = useCallback(() => {
    if (typeof openMediaPicker !== 'function') {
      return
    }

    openMediaPicker({
      mode: 'image',
      onSelect: (media) => {
        if (!media) return
        const variants = Array.isArray(media.variants) ? media.variants : []
        const preferredOrder = ['large', 'preview', 'optimized', 'original']
        const variant = preferredOrder
          .map((name) => variants.find((item) => item.name === name))
          .find(Boolean) || variants[0]

        const src = variant?.url || media.url
        if (!src) return

        const width = variant?.width || media.width
        const height = variant?.height || media.height
        const altText = media.altText || media.originalName || media.fileName || ''

        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          src,
          altText,
          width,
          height,
        })
      },
    })
  }, [editor, openMediaPicker])

  const handleInsertVideo = useCallback(() => {
    if (typeof openMediaPicker !== 'function') {
      return
    }

    openMediaPicker({
      mode: 'video',
      onSelect: (media) => {
        if (!media) return

        editor.dispatchCommand(INSERT_VIDEO_COMMAND, {
          url: media.url,
          externalUrl: media.externalUrl || media.url,
          provider: media.provider || null,
          providerId: media.providerId || null,
          thumbnailUrl: media.thumbnailUrl || (Array.isArray(media.variants) ? media.variants.find((variant) => variant.name === 'thumbnail')?.url : null),
          title: media.originalName || media.caption || media.fileName || media.url,
          caption: media.caption || '',
          mimeType: media.mimeType,
          duration: typeof media.duration === 'number' ? media.duration : null,
        })
      },
    })
  }, [editor, openMediaPicker])

  const handleCreateTable = useCallback((rows, columns) => {
    editor.update(() => {
      const table = $createTableWithDimensions(rows, columns, true)
      $insertNodes([table])
    })
  }, [editor])

  const handleToggleTableSelector = useCallback(() => {
    if (setIsTableSelectorOpen) {
      setIsTableSelectorOpen(!isTableSelectorOpen)
    }
  }, [isTableSelectorOpen, setIsTableSelectorOpen])

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
          case 'h3':
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
      </ToolbarButton>
      <ToolbarButton
        title="Numaralı liste"
        onClick={() => applyBlockType('numbered-list')}
        active={blockType === 'numbered-list'}
      >
      </ToolbarButton>
      <Divider />
      <ToolbarButton title="Görsel ekle" onClick={handleInsertImage}>
      </ToolbarButton>
      <ToolbarButton title="Video ekle" onClick={handleInsertVideo}>
      </ToolbarButton>
      <div className="relative">
        <ToolbarButton
          title="Tablo ekle"
          onClick={handleToggleTableSelector}
          active={isTableSelectorOpen}
        >
        </ToolbarButton>
        {isTableSelectorOpen && (
          <div
            ref={tableSelectorRef}
            className="absolute top-full left-0 z-50 mt-1"
          >
            <TableDimensionSelector
              onCreateTable={handleCreateTable}
              onClose={() => setIsTableSelectorOpen && setIsTableSelectorOpen(false)}
            />
          </div>
        )}
      </div>
      <Divider />
      <ToolbarButton
        title="Kalın"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        active={formatState.bold}
      >
      </ToolbarButton>
      <ToolbarButton
        title="İtalik"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        active={formatState.italic}
      >
      </ToolbarButton>
      <ToolbarButton
        title="Altı çizili"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        active={formatState.underline}
      >
      </ToolbarButton>
      <ToolbarButton
        title="Üzeri çizili"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
        active={formatState.strikethrough}
      >
      </ToolbarButton>
      <ToolbarButton
        title="Kod"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
        active={formatState.code}
      >
      </ToolbarButton>
      <ToolbarButton
        title="Bağlantı"
        onClick={toggleLink}
        active={isLinkActive}
      >
      </ToolbarButton>
      <Divider />
      <div className="flex items-center gap-1">
        <ToolbarButton
          title="Yazı boyutunu küçült"
          onClick={() => handleFontSizeChange(-1)}
          disabled={fontSize <= FONT_MIN}
        >
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
        </ToolbarButton>
      </div>
      <Divider />
      <ColorPicker
        icon="font-color"
        title="Metin rengi"
        value={textColor}
        onChange={handleTextColorChange}
      />
      <ColorPicker
        icon="bg-color"
        title="Vurgu rengi"
        value={highlightColor}
        onChange={handleHighlightChange}
      />
      <FormattingDropdown />
      <Divider />
      <ToolbarButton
        title="Sola hizala"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}
        active={blockFormat === 'left'}
      >
      </ToolbarButton>
      <ToolbarButton
        title="Ortala"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}
        active={blockFormat === 'center'}
      >
      </ToolbarButton>
      <ToolbarButton
        title="Sağa hizala"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}
        active={blockFormat === 'right'}
      >
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

function FormattingDropdown() {
  const [editor] = useLexicalComposerContext()
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const dropdownRef = useRef(null)

  const formatOptions = [
    {
      key: 'lowercase',
      label: 'Lowercase',
      shortcut: '⌃+Shift+1',
      action: () => transformSelectedText((text) => text.toLowerCase())
    },
    {
      key: 'uppercase',
      label: 'Uppercase',
      shortcut: '⌃+Shift+2',
      action: () => transformSelectedText((text) => text.toUpperCase())
    },
    {
      key: 'capitalize',
      label: 'Capitalize',
      shortcut: '⌃+Shift+3',
      action: () => transformSelectedText((text) =>
        text.replace(/\b\w/g, (char) => char.toUpperCase())
      )
    },
    {
      key: 'strikethrough',
      label: 'Strikethrough',
      shortcut: '⌘+Shift+X',
      action: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
    },
    {
      key: 'subscript',
      label: 'Subscript',
      shortcut: '⌘+,',
      action: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')
    },
    {
      key: 'superscript',
      label: 'Superscript',
      shortcut: '⌘+.',
      action: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')
    },
    {
      key: 'highlight',
      label: 'Highlight',
      shortcut: '',
      action: () => {
        // Highlight functionality placeholder
        console.log('Highlight selected')
      }
    },
    {
      key: 'clear',
      label: 'Clear Formatting',
      shortcut: '⌘+\\',
      action: () => clearInlineStyles()
    }
  ]

  const transformSelectedText = useCallback((transform) => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const selectedText = selection.getTextContent()
        const transformedText = transform(selectedText)
        selection.insertText(transformedText)
      }
    })
  }, [editor])

  const clearInlineStyles = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.getNodes().forEach((node) => {
          if ($isTextNode(node)) {
            node.setFormat(0)
            node.setStyle('')
          }
        })
      }
    })
  }, [editor])

  const handleButtonClick = useCallback(() => {
    if (!buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left
    })
    setIsOpen(!isOpen)
  }, [isOpen])

  const handleOptionClick = useCallback((option) => {
    option.action()
    setIsOpen(false)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        aria-label="Formatting options for additional text styles"
        className="toolbar-item spaced"
      >
        <span className="icon dropdown-more"></span>
        <i className="chevron-down"></i>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="formatting-dropdown"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left
          }}
        >
          {formatOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className="item wide"
              title={option.label}
              onClick={() => handleOptionClick(option)}
            >
              <div className="icon-text-container">
                <i className={`icon ${option.key}`} />
                <span className="text">{option.label}</span>
              </div>
              {option.shortcut && <span className="shortcut">{option.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function ColorPicker({ icon, title, value, onChange }) {
  return (
    <label className="editor-toolbar__color-picker-icon" title={title}>
      <div className={`color-icon ${icon}`}></div>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="editor-toolbar__color-input-hidden"
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

    // Schedule the state update in the next microtask to avoid flushSync warning
    Promise.resolve().then(() => {
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
    })
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

function TablePastePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const handlePaste = (event) => {
        const clipboardData = event.clipboardData
        if (!clipboardData) return

        const htmlData = clipboardData.getData('text/html')
        if (!htmlData || !htmlData.includes('<table')) return

        // Check if HTML contains table elements
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = htmlData
        const tables = tempDiv.querySelectorAll('table')

        if (tables.length === 0) return

        event.preventDefault()
        event.stopPropagation()

        try {
          editor.update(() => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return

            tables.forEach(table => {
              const lexicalTable = convertHTMLTableToLexicalTable(table, editor)
              if (lexicalTable) {
                $insertNodes([lexicalTable])
              }
            })
          })
        } catch (error) {
          console.warn('Table paste failed:', error)
        }
    }

    // Add event listener to the editor's root element
    const rootElement = editor.getRootElement()
    if (rootElement) {
      rootElement.addEventListener('paste', handlePaste)
    }

    return () => {
      if (rootElement) {
        rootElement.removeEventListener('paste', handlePaste)
      }
    }
  }, [editor])

  return null
}

function convertHTMLTableToLexicalTable(htmlTable, editor) {
  const rows = htmlTable.querySelectorAll('tr')
  if (rows.length === 0) return null

  const lexicalTable = $createTableNode()

  rows.forEach((htmlRow) => {
    const lexicalRow = $createTableRowNode()
    const cells = htmlRow.querySelectorAll('td, th')

    cells.forEach((htmlCell) => {
      // Check if cell is a header (th tag or strong content)
      const isHeader = htmlCell.tagName.toLowerCase() === 'th' ||
                      htmlCell.querySelector('strong, b') !== null

      // Get colspan and rowspan if present
      const colSpan = parseInt(htmlCell.getAttribute('colspan') || '1', 10)
      const rowSpan = parseInt(htmlCell.getAttribute('rowspan') || '1', 10)

      // Get width if present
      const width = htmlCell.getAttribute('width')
        ? parseInt(htmlCell.getAttribute('width'), 10)
        : undefined

      const lexicalCell = $createTableCellNode(
        isHeader ? 1 : 0, // headerState
        width, // width
        null, // backgroundColor
        colSpan, // colSpan
        rowSpan // rowSpan
      )

      // Convert cell content to Lexical nodes
      const cellContent = htmlCell.innerHTML.trim()
      if (cellContent) {
        try {
          // Create a temporary div to parse cell content
          const tempDiv = document.createElement('div')
          tempDiv.innerHTML = cellContent

          // Generate Lexical nodes from the HTML content
          const nodes = $generateNodesFromDOM(editor, tempDiv)

          // If we have nodes, append them to the cell
          if (nodes.length > 0) {
            nodes.forEach(node => {
              lexicalCell.append(node)
            })
          } else {
            // Fallback: create a text node
            const textContent = htmlCell.textContent || htmlCell.innerText || ''
            if (textContent.trim()) {
              const paragraph = $createParagraphNode()
              paragraph.append($createTextNode(textContent.trim()))
              lexicalCell.append(paragraph)
            } else {
              // Empty cell gets empty paragraph
              lexicalCell.append($createParagraphNode())
            }
          }
        } catch (error) {
          // Fallback for content parsing errors
          const textContent = htmlCell.textContent || htmlCell.innerText || ''
          if (textContent.trim()) {
            const paragraph = $createParagraphNode()
            paragraph.append($createTextNode(textContent.trim()))
            lexicalCell.append(paragraph)
          } else {
            lexicalCell.append($createParagraphNode())
          }
        }
      } else {
        // Empty cell gets empty paragraph
        lexicalCell.append($createParagraphNode())
      }

      lexicalRow.append(lexicalCell)
    })

    lexicalTable.append(lexicalRow)
  })

  return lexicalTable
}
