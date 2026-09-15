import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowPathIcon,
  CloudArrowUpIcon,
  DocumentDuplicateIcon,
  DocumentIcon,
  PhotoIcon,
  PlayIcon,
  TagIcon,
  TrashIcon,
  XMarkIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { Trans, useTranslation } from 'react-i18next'
import { mediaAPI } from '../../lib/mediaAPI.js'
import { useApiError } from '../../lib/useApiError.js'
import { buildExternalEmbed } from '../../utils/externalMedia.js'

export default function MediaLibrary() {
  const { t, i18n } = useTranslation()
  const describeError = useApiError()
  const [search, setSearch] = useState('')
  const [mimeFilter, setMimeFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [debouncedTagFilter, setDebouncedTagFilter] = useState('')
  const [lastUploadedNames, setLastUploadedNames] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [showBulkTagPanel, setShowBulkTagPanel] = useState(false)
  const [bulkTagInput, setBulkTagInput] = useState('')
  const [bulkTagMode, setBulkTagMode] = useState('add')
  const [activeItem, setActiveItem] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formState, setFormState] = useState({
    originalName: '',
    altText: '',
    caption: '',
    description: '',
    tags: '',
  })
  const [copiedId, setCopiedId] = useState(null)
  const [isExternalModalOpen, setIsExternalModalOpen] = useState(false)
  const [externalError, setExternalError] = useState(null)
  const [externalForm, setExternalForm] = useState({
    url: '',
    title: '',
    provider: '',
    providerId: '',
    thumbnailUrl: '',
    altText: '',
    description: '',
    tags: '',
    duration: '',
  })

  const mimeFilters = useMemo(() => ([
    { label: t('media.filter_all'), value: '' },
    { label: t('media.filter_images'), value: 'image/' },
    { label: t('media.filter_videos'), value: 'video/' },
    { label: t('media.filter_documents'), value: 'application/' },
  ]), [t])

  const queryClient = useQueryClient()
  const searchTimeoutRef = useRef(null)
  const tagTimeoutRef = useRef(null)
  const loadMoreRef = useRef(null)

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [search])

  // Debounce tag filter input
  useEffect(() => {
    if (tagTimeoutRef.current) {
      clearTimeout(tagTimeoutRef.current)
    }

    tagTimeoutRef.current = setTimeout(() => {
      setDebouncedTagFilter(tagFilter)
    }, 300)

    return () => {
      if (tagTimeoutRef.current) {
        clearTimeout(tagTimeoutRef.current)
      }
    }
  }, [tagFilter])

  const queryParams = useMemo(() => {
    const trimmedSearch = debouncedSearch.trim()
    const trimmedTagFilter = debouncedTagFilter.trim()

    return {
      search: trimmedSearch || undefined,
      tags: trimmedTagFilter ? trimmedTagFilter.split(',').map(tag => tag.trim()).filter(Boolean) : undefined,
      mimeType: mimeFilter || undefined,
      limit: 40,
    }
  }, [debouncedSearch, mimeFilter, debouncedTagFilter])

  const mediaQuery = useInfiniteQuery({
    queryKey: ['media', queryParams],
    queryFn: async ({ pageParam = 1 }) => mediaAPI.list({ ...queryParams, page: pageParam }),
    getNextPageParam: (lastPage, pages) => {
      const currentPage = pages.length
      const totalPages = lastPage?.pagination?.pages || 1
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    keepPreviousData: true,
  })

  const uploadMutation = useMutation({
    mutationFn: async (files) => {
      const uploaded = []
      for (const file of files) {
        const contentType = file.type || 'application/octet-stream'
        const presign = await mediaAPI.createPresignedUpload({
          fileName: file.name,
          contentType,
          size: file.size,
        })

        const uploadResponse = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
          },
          body: file,
        })

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text()
          throw new Error(t('media.upload_failed_named', {
            name: file.name,
            status: uploadResponse.status,
            details: errorText,
          }))
        }

        const record = await mediaAPI.completeUpload({
          key: presign.key,
          originalName: file.name,
          mimeType: contentType,
          size: file.size,
        })
        uploaded.push(record)
      }
      return uploaded
    },
    onSuccess: (uploaded) => {
      setLastUploadedNames(uploaded.map((item) => item.originalName || item.fileName))
      queryClient.invalidateQueries({ queryKey: ['media'] })
    },
  })

  const updateMetadataMutation = useMutation({
    mutationFn: ({ id, payload }) => mediaAPI.update(id, payload),
    onSuccess: (media) => {
      setActiveItem(media)
      setLastUploadedNames([])
      queryClient.invalidateQueries({ queryKey: ['media'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => mediaAPI.remove(id),
    onSuccess: () => {
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['media'] })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => mediaAPI.bulkDelete(ids),
    onSuccess: () => {
      clearSelection()
      queryClient.invalidateQueries({ queryKey: ['media'] })
    },
  })

  const bulkTagMutation = useMutation({
    mutationFn: ({ ids, tags, mode }) => mediaAPI.bulkTag({ ids, tags, mode }),
    onSuccess: () => {
      setShowBulkTagPanel(false)
      setBulkTagInput('')
      queryClient.invalidateQueries({ queryKey: ['media'] })
    },
  })

  const resetExternalForm = useCallback(() => {
    setExternalForm({
      url: '',
      title: '',
      provider: '',
      providerId: '',
      thumbnailUrl: '',
      altText: '',
      description: '',
      tags: '',
      duration: '',
    })
  }, [])

  const createExternalMutation = useMutation({
    mutationFn: (payload) => mediaAPI.createExternal(payload),
    onSuccess: (media) => {
      setExternalError(null)
      resetExternalForm()
      setIsExternalModalOpen(false)
      setLastUploadedNames([media.originalName || media.fileName])
      queryClient.invalidateQueries({ queryKey: ['media'] })
    },
    onError: (error) => {
      setExternalError(describeError(error, 'media.external_add_failed'))
    },
  })

  useEffect(() => {
    if (!activeItem) {
      setFormState({ originalName: '', altText: '', caption: '', description: '', tags: '' })
      return
    }

    setFormState({
      originalName: activeItem.originalName || '',
      altText: activeItem.altText || '',
      caption: activeItem.caption || '',
      description: activeItem.description || '',
      tags: Array.isArray(activeItem.tags) && activeItem.tags.length ? activeItem.tags.join(', ') : '',
    })
  }, [activeItem])

  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    uploadMutation.mutate(files)
  }, [uploadMutation])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    if (event.dataTransfer?.files?.length) {
      handleFiles(event.dataTransfer.files)
    }
  }, [handleFiles])

  const onDragOver = useCallback((event) => {
    event.preventDefault()
  }, [])

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
    setShowBulkTagPanel(false)
    setBulkTagInput('')
  }, [])

  const openModal = useCallback((item) => {
    setActiveItem(item)
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setActiveItem(null)
  }, [])

  const handleModalSave = useCallback(() => {
    if (!activeItem) return

    const payload = {
      originalName: formState.originalName,
      altText: formState.altText,
      caption: formState.caption,
      description: formState.description,
      tags: formState.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }

    updateMetadataMutation.mutate({ id: activeItem._id, payload })
  }, [activeItem, formState, updateMetadataMutation])

  const handleModalDelete = useCallback(() => {
    if (!activeItem) return
    const confirmed = window.confirm(t('media.delete_confirm'))
    if (!confirmed) return
    deleteMutation.mutate(activeItem._id)
  }, [activeItem, deleteMutation, t])

  const handleBulkDelete = useCallback(() => {
    if (!selectedIds.length) return
    const confirmed = window.confirm(t('media.bulk_delete_confirm'))
    if (!confirmed) return
    bulkDeleteMutation.mutate(selectedIds)
  }, [bulkDeleteMutation, selectedIds, t])

  const handleBulkTagSubmit = useCallback(() => {
    if (!selectedIds.length) return
    const tags = bulkTagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    if (!tags.length) {
      alert(t('media.tag_required'))
      return
    }

    bulkTagMutation.mutate({ ids: selectedIds, tags, mode: bulkTagMode })
  }, [bulkTagInput, bulkTagMode, bulkTagMutation, selectedIds, t])

  const handleFormChange = useCallback((event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }, [])

  // Flatten all pages into a single items array
  const items = useMemo(() => {
    return mediaQuery.data?.pages?.flatMap(page => page.items || []) ?? []
  }, [mediaQuery.data])

  const selectedCount = selectedIds.length
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const totalCount = mediaQuery.data?.pages?.[0]?.pagination?.total ?? 0
  const totalLabel = !mediaQuery.data && mediaQuery.isLoading
    ? t('common.loading')
    : t('media.total_count', { total: totalCount.toLocaleString(i18n.language) })

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first.isIntersecting && mediaQuery.hasNextPage && !mediaQuery.isFetchingNextPage) {
          mediaQuery.fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current)
      }
    }
  }, [mediaQuery])

  const copyUrl = useCallback(async (url, id) => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000)
    } catch (error) {
      const fallback = window.prompt(t('media.copy_url_prompt'), url)
      if (fallback !== null) {
        setCopiedId(id)
        window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000)
      }
    }
  }, [t])

  const openExternalModal = useCallback(() => {
    setExternalError(null)
    setIsExternalModalOpen(true)
  }, [])

  const closeExternalModal = useCallback(() => {
    setIsExternalModalOpen(false)
    setExternalError(null)
    resetExternalForm()
  }, [resetExternalForm])

  const handleExternalChange = useCallback((event) => {
    const { name, value } = event.target
    setExternalForm((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleExternalSubmit = useCallback(() => {
    const trimmedUrl = externalForm.url.trim()
    if (!trimmedUrl) {
      setExternalError(t('validation.url'))
      return
    }

    const tagList = externalForm.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    const payload = {
      url: trimmedUrl,
      title: externalForm.title.trim() || undefined,
      description: externalForm.description.trim() || undefined,
      provider: externalForm.provider.trim() || undefined,
      providerId: externalForm.providerId.trim() || undefined,
      thumbnailUrl: externalForm.thumbnailUrl.trim() || undefined,
      altText: externalForm.altText.trim() || undefined,
      duration: externalForm.duration.trim() ? Number(externalForm.duration) : undefined,
      tags: tagList.length ? tagList : undefined,
    }

    if (Number.isNaN(payload.duration)) {
      setExternalError(t('validation.number'))
      return
    }

    setExternalError(null)
    createExternalMutation.mutate(payload)
  }, [createExternalMutation, externalForm, t])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{t('media.title')}</h1>
            <span className="text-sm text-gray-400">
              {totalLabel}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {t('media.subtitle')}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row">
          <label className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer">
            <CloudArrowUpIcon className="h-5 w-5" aria-hidden="true" />
            <span>{t('media.upload_file')}</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                handleFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            onClick={openExternalModal}
            className="inline-flex items-center justify-center gap-x-2 rounded-md border border-blue-400 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <VideoCameraIcon className="h-5 w-5" aria-hidden="true" />
            {t('media.add_from_url')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-1">
          <label htmlFor="media-search" className="block text-sm font-medium text-gray-700">
            {t('media.file_name')}
          </label>
          <input
            id="media-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('media.search_placeholder')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
        <div className="sm:col-span-1">
          <label htmlFor="media-tags" className="block text-sm font-medium text-gray-700">
            {t('media.tags')}
          </label>
          <input
            id="media-tags"
            type="search"
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            placeholder={t('media.tags_placeholder')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
        <div className="sm:col-span-1">
          <label htmlFor="media-type" className="block text-sm font-medium text-gray-700">
            {t('common.type')}
          </label>
          <select
            id="media-type"
            value={mimeFilter}
            onChange={(event) => setMimeFilter(event.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            {mimeFilters.map((filter) => (
              <option key={filter.value || 'all'} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['media'] })}
            className="mt-6 inline-flex items-center gap-x-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <ArrowPathIcon className={clsx('h-5 w-5', mediaQuery.isFetching ? 'animate-spin' : '')} />
            {t('common.refresh')}
          </button>
        </div>
        <div className="sm:col-span-1 lg:col-span-1">
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setTagFilter('')
              setMimeFilter('')
              setDebouncedSearch('')
              setDebouncedTagFilter('')
            }}
            className="mt-6 inline-flex items-center gap-x-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {t('common.clear')}
          </button>
        </div>
        {lastUploadedNames.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              {lastUploadedNames.length === 1
                ? t('media.uploaded_one', { name: lastUploadedNames[0] })
                : t('media.uploaded_many', { count: lastUploadedNames.length })}
            </div>
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-blue-800">
            {t('common.selected_count', { count: selectedCount })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setShowBulkTagPanel((prev) => !prev)}
              className="inline-flex items-center gap-x-2 rounded-md border border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
              disabled={bulkTagMutation.isPending}
            >
              <TagIcon className="h-4 w-4" />
              {t('media.assign_tags')}
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-x-2 rounded-md border border-red-500 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              disabled={bulkDeleteMutation.isPending}
            >
              <TrashIcon className="h-4 w-4" />
              {t('media.delete_selected')}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-x-2 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              {t('media.clear_selection')}
            </button>
          </div>
        </div>
      )}

      {showBulkTagPanel && selectedCount > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-800">{t('media.bulk_tag_title')}</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={bulkTagInput}
              onChange={(event) => setBulkTagInput(event.target.value)}
              placeholder={t('media.bulk_tag_placeholder')}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
            <select
              value={bulkTagMode}
              onChange={(event) => setBulkTagMode(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="add">{t('media.tag_mode_add')}</option>
              <option value="replace">{t('media.tag_mode_replace')}</option>
            </select>
            <button
              type="button"
              onClick={handleBulkTagSubmit}
              className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={bulkTagMutation.isPending}
            >
              {t('media.apply')}
            </button>
            <button
              type="button"
              onClick={() => setShowBulkTagPanel(false)}
              className="inline-flex items-center gap-x-2 rounded-md border border-transparent px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {t('common.close')}
            </button>
          </div>
          {bulkTagMutation.isError && (
            <div className="text-sm text-red-600">
              {describeError(bulkTagMutation.error, 'media.bulk_tag_failed')}
            </div>
          )}
        </div>
      )}

      <div
        className={clsx(
          'rounded-xl border-2 border-dashed p-6 transition-colors',
          uploadMutation.isPending ? 'border-blue-400 bg-blue-50/40' : 'border-gray-300 hover:border-blue-400'
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <div className="flex flex-col items-center justify-center gap-3 text-center text-sm text-gray-600">
          <CloudArrowUpIcon className="h-10 w-10 text-gray-400" />
          <div>
            <Trans i18nKey="media.drop_hint" components={{ strong: <span className="font-medium text-blue-600" /> }} />
          </div>
          <div className="text-xs text-gray-500">{t('media.upload_hint')}</div>
          {uploadMutation.isPending && <div className="text-blue-600">{t('media.uploading')}</div>}
          {uploadMutation.isError && (
            <div className="text-red-600">
              {(uploadMutation.error instanceof Error ? uploadMutation.error.message : t('media.upload_failed'))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t('media.files')}</h2>
          <span className="text-sm text-gray-500">
            {t('media.record_count', { count: totalCount })}
          </span>
        </div>
        <div className="p-6">
          {mediaQuery.isLoading ? (
            <div className="text-sm text-gray-500">{t('media.loading')}</div>
          ) : mediaQuery.isError ? (
            <div className="text-sm text-red-600">
              {describeError(mediaQuery.error, 'media.load_failed')}
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-500">{t('media.empty')}</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => {
                const isSelected = selectedSet.has(item._id)
                const isExternal = item.sourceType === 'external'
                const isImage = item.mimeType?.startsWith('image/')
                const thumbnailUrl = isExternal
                  ? item.thumbnailUrl || item.url
                  : item.variants?.find((variant) => variant.name === 'thumbnail')?.url || item.url

                return (
                  <article
                    key={item._id}
                    className={clsx(
                      'flex flex-col rounded-lg border bg-white shadow-sm overflow-hidden transition ring-2 ring-offset-1',
                      isSelected ? 'border-blue-500 ring-blue-400 bg-blue-50/40' : 'border-gray-200 ring-transparent'
                    )}
                  >
                    <div className="relative aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleSelect(item._id)}
                        className={clsx(
                          'absolute left-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded border text-sm font-medium',
                          isSelected ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-600'
                        )}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? '✓' : ''}
                      </button>
                      {isImage ? (
                        <img
                          src={thumbnailUrl}
                          alt={item.altText || item.originalName || item.fileName}
                          className="h-full w-full object-cover"
                        />
                      ) : isExternal && thumbnailUrl ? (
                        <div className="relative h-full w-full">
                          <img
                            src={thumbnailUrl}
                            alt={item.altText || item.originalName || item.fileName}
                            className="h-full w-full object-cover"
                          />
                          <PlayIcon className="absolute inset-0 m-auto h-12 w-12 text-white drop-shadow" />
                        </div>
                      ) : isExternal ? (
                        <VideoCameraIcon className="h-12 w-12 text-gray-500" aria-hidden="true" />
                      ) : (
                        <DocumentIcon className="h-12 w-12 text-gray-400" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4 gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{item.originalName || item.fileName}</h3>
                        {isImage ? (
                          <PhotoIcon className="h-5 w-5 text-blue-500" />
                        ) : isExternal ? (
                          <VideoCameraIcon className="h-5 w-5 text-blue-500" />
                        ) : (
                          <DocumentIcon className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <dl className="text-xs text-gray-500 space-y-1">
                        <div className="flex justify-between gap-2">
                          <dt>{t('media.size')}</dt>
                          <dd>{formatFileSize(item.size)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>{t('common.type')}</dt>
                          <dd>{item.mimeType || t('media.unknown_type')}</dd>
                        </div>
                        {item.width && item.height && (
                          <div className="flex justify-between gap-2">
                            <dt>{t('media.dimensions')}</dt>
                            <dd>
                              {item.width} × {item.height}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {Array.isArray(item.tags) && item.tags.length > 0 && (
                        <ul className="flex flex-wrap gap-1 pt-1">
                          {item.tags.map((tag) => (
                            <li key={tag} className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                              {tag}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => openModal(item)}
                          className="inline-flex flex-1 justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                        >
                          {t('media.inspect')}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyUrl(item.url, item._id)}
                          title={t('media.copy_url')}
                          className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <DocumentDuplicateIcon className="h-5 w-5" />
                        </button>
                      </div>
                      {copiedId === item._id && (
                        <span className="text-xs text-green-600">{t('media.url_copied')}</span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          {/* Infinite scroll trigger */}
          {!mediaQuery.isLoading && items.length > 0 && (
            <div ref={loadMoreRef} className="py-4 text-center">
              {mediaQuery.isFetchingNextPage ? (
                <div className="text-sm text-gray-500">{t('media.loading_more')}</div>
              ) : mediaQuery.hasNextPage ? (
                <div className="text-sm text-gray-400">{t('media.scroll_for_more')}</div>
              ) : (
                <div className="text-sm text-gray-400">{t('media.all_loaded')}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <MediaDetailModal
        open={isModalOpen}
        onClose={closeModal}
        item={activeItem}
        formState={formState}
        onChange={handleFormChange}
        onSave={handleModalSave}
        onDelete={handleModalDelete}
        saving={updateMetadataMutation.isPending}
        deleting={deleteMutation.isPending}
        error={updateMetadataMutation.isError ? updateMetadataMutation.error : null}
        copyUrl={copyUrl}
        copiedId={copiedId}
      />
      <ExternalMediaModal
        open={isExternalModalOpen}
        onClose={closeExternalModal}
        formState={externalForm}
        onChange={handleExternalChange}
        onSubmit={handleExternalSubmit}
        isSubmitting={createExternalMutation.isPending}
        error={externalError}
      />
    </div>
  )
}

function MediaDetailModal({ open, onClose, item, formState, onChange, onSave, onDelete, saving, deleting, error, copyUrl, copiedId }) {
  const { t } = useTranslation()
  const describeError = useApiError()
  const isExternal = item?.sourceType === 'external'
  const isImage = item?.mimeType?.startsWith('image/')
  const previewUrl = isExternal ? item?.thumbnailUrl || item?.url : item?.url
  const externalEmbed = isExternal ? buildExternalEmbed(item) : null
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white px-4 pb-6 pt-5 text-left shadow-xl transition-all sm:p-8">
                <button
                  type="button"
                  className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                  onClick={onClose}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
                <Dialog.Title className="text-lg font-semibold leading-6 text-gray-900">
                  {t('media.details_title')}
                </Dialog.Title>
                {!item ? (
                  <p className="mt-6 text-sm text-gray-600">{t('common.loading')}</p>
                ) : (
                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        {isExternal && externalEmbed ? (
                          externalEmbed.type === 'iframe' ? (
                            <div className="relative w-full overflow-hidden rounded-lg">
                              <div className="aspect-video">
                                <iframe
                                  src={externalEmbed.src}
                                  title={item.originalName || item.fileName || t('media.video')}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  referrerPolicy="strict-origin-when-cross-origin"
                                  allowFullScreen
                                  className="h-full w-full border-0"
                                />
                              </div>
                            </div>
                          ) : (
                            <video
                              controls
                              poster={previewUrl || undefined}
                              src={externalEmbed.src}
                              className="max-h-80 w-full rounded object-contain bg-black"
                            >
                              {t('media.video_unsupported')}
                            </video>
                          )
                        ) : isImage ? (
                          <img
                            src={previewUrl}
                            alt={item.altText || item.originalName || item.fileName}
                            className="max-h-80 w-full rounded object-contain"
                          />
                        ) : isExternal && previewUrl ? (
                          <div className="relative">
                            <img
                              src={previewUrl}
                              alt={item.altText || item.originalName || item.fileName}
                              className="max-h-80 w-full rounded object-contain"
                            />
                            <PlayIcon className="absolute inset-0 m-auto h-16 w-16 text-white drop-shadow" />
                          </div>
                        ) : isExternal ? (
                          <div className="flex h-48 items-center justify-center text-gray-500">
                            <VideoCameraIcon className="h-12 w-12" />
                          </div>
                        ) : (
                          <div className="flex h-48 items-center justify-center text-gray-500">
                            <DocumentIcon className="h-12 w-12" />
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600 space-y-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-700">{t('media.source')}</span>
                          <span className="text-gray-900">{isExternal ? t('media.source_external') : t('media.source_upload')}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-700">{t('media.file_name')}</span>
                          <span className="text-gray-900">{item.fileName}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-700">{t('common.type')}</span>
                          <span className="text-gray-900">{item.mimeType || t('media.unknown_type')}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-700">{t('media.size')}</span>
                          <span className="text-gray-900">{formatFileSize(item.size)}</span>
                        </div>
                        {item.width && item.height && (
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-gray-700">{t('media.dimensions')}</span>
                            <span className="text-gray-900">{item.width} × {item.height}</span>
                          </div>
                        )}
                        <div className="truncate text-blue-600">
                          <button
                            type="button"
                            onClick={() => copyUrl(item.url, item._id)}
                            title={t('media.copy_url')}
                            className="inline-flex items-center gap-x-1 text-blue-600 hover:text-blue-700"
                          >
                            <DocumentDuplicateIcon className="h-4 w-4" />
                            <span>{t('media.copy_url')}</span>
                          </button>
                          {copiedId === item._id && (
                            <span className="ml-2 text-xs text-green-600">{t('common.copied')}</span>
                          )}
                        </div>
                        {isExternal && (
                          <div className="space-y-1 text-sm">
                            {item.provider && (
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-gray-700">{t('media.platform')}</span>
                                <span className="text-gray-900">{item.provider}</span>
                              </div>
                            )}
                            {item.providerId && (
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-gray-700">{t('media.video_id')}</span>
                                <span className="text-gray-900">{item.providerId}</span>
                              </div>
                            )}
                            {item.duration && (
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-gray-700">{t('media.duration')}</span>
                                <span className="text-gray-900">{t('media.duration_seconds', { count: Math.round(item.duration) })}</span>
                              </div>
                            )}
                            <div className="flex justify-between gap-2">
                              <span className="font-medium text-gray-700">{t('media.external_url')}</span>
                              <a
                                href={item.externalUrl || item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-700"
                              >
                                {t('media.open')}
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <form className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="media-originalName">
                          {t('media.display_name')}
                        </label>
                        <input
                          id="media-originalName"
                          name="originalName"
                          value={formState.originalName}
                          onChange={onChange}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">{t('media.display_name_hint')}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="media-altText">
                          {t('media.alt_text')}
                        </label>
                        <input
                          id="media-altText"
                          name="altText"
                          value={formState.altText}
                          onChange={onChange}
                          placeholder={t('media.alt_text_placeholder')}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="media-caption">
                          {t('media.caption')}
                        </label>
                        <input
                          id="media-caption"
                          name="caption"
                          value={formState.caption}
                          onChange={onChange}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="media-description">
                          {t('common.description')}
                        </label>
                        <textarea
                          id="media-description"
                          name="description"
                          rows={4}
                          value={formState.description}
                          onChange={onChange}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="media-tags">
                          {t('media.tags')}
                        </label>
                        <input
                          id="media-tags"
                          name="tags"
                          value={formState.tags}
                          onChange={onChange}
                          placeholder={t('media.tags_input_placeholder')}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">{t('media.tags_example')}</p>
                      </div>

                      {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                          {describeError(error, 'media.update_failed')}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={onSave}
                          disabled={saving}
                          className="inline-flex flex-1 justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                        >
                          {saving ? t('common.saving') : t('common.save')}
                        </button>
                        <button
                          type="button"
                          onClick={onDelete}
                          disabled={deleting}
                          className="inline-flex items-center justify-center gap-x-2 rounded-md border border-red-500 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          <TrashIcon className="h-4 w-4" />
                          {deleting ? t('common.deleting') : t('common.delete')}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

function ExternalMediaModal({ open, onClose, formState, onChange, onSubmit, isSubmitting, error }) {
  const { t } = useTranslation()

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white px-4 pb-6 pt-5 text-left shadow-xl transition-all sm:p-8">
                <button
                  type="button"
                  className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                  onClick={onClose}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
                <Dialog.Title className="text-lg font-semibold leading-6 text-gray-900 flex items-center gap-2">
                  <VideoCameraIcon className="h-6 w-6 text-blue-500" />
                  {t('media.external_modal_title')}
                </Dialog.Title>
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="external-url">
                      {t('media.external_url_label')}
                    </label>
                    <input
                      id="external-url"
                      name="url"
                      type="url"
                      required
                      value={formState.url}
                      onChange={onChange}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-title">
                        {t('common.title')}
                      </label>
                      <input
                        id="external-title"
                        name="title"
                        value={formState.title}
                        onChange={onChange}
                        placeholder={t('media.external_title_placeholder')}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-thumbnail">
                        {t('media.thumbnail_url')}
                      </label>
                      <input
                        id="external-thumbnail"
                        name="thumbnailUrl"
                        value={formState.thumbnailUrl}
                        onChange={onChange}
                        placeholder="https://.../preview.jpg"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-provider">
                        {t('media.platform')}
                      </label>
                      <input
                        id="external-provider"
                        name="provider"
                        value={formState.provider}
                        onChange={onChange}
                        placeholder="youtube, vimeo"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-providerId">
                        {t('media.video_id')}
                      </label>
                      <input
                        id="external-providerId"
                        name="providerId"
                        value={formState.providerId}
                        onChange={onChange}
                        placeholder={t('common.optional')}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-altText">
                        {t('media.alt_text')}
                      </label>
                      <input
                        id="external-altText"
                        name="altText"
                        value={formState.altText}
                        onChange={onChange}
                        placeholder={t('media.alt_text_placeholder')}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-duration">
                        {t('media.duration_seconds_label')}
                      </label>
                      <input
                        id="external-duration"
                        name="duration"
                        type="number"
                        min="0"
                        value={formState.duration}
                        onChange={onChange}
                        placeholder={t('common.optional')}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="external-description">
                      {t('common.description')}
                    </label>
                    <textarea
                      id="external-description"
                      name="description"
                      rows={3}
                      value={formState.description}
                      onChange={onChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="external-tags">
                      {t('media.tags')}
                    </label>
                    <input
                      id="external-tags"
                      name="tags"
                      value={formState.tags}
                      onChange={onChange}
                      placeholder={t('media.external_tags_placeholder')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">{t('media.tags_comma_hint')}</p>
                  </div>
                  {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={onSubmit}
                      disabled={isSubmitting}
                      className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                    >
                      {isSubmitting ? t('media.adding') : t('media.add_to_library')}
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—'
  const threshold = 1024
  if (Math.abs(bytes) < threshold) {
    return `${bytes} B`
  }
  const units = ['KB', 'MB', 'GB', 'TB']
  let u = -1
  let value = bytes
  do {
    value /= threshold
    u += 1
  } while (Math.abs(value) >= threshold && u < units.length - 1)
  return `${value.toFixed(1)} ${units[u]}`
}
