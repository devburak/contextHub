import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { mediaAPI } from '../../lib/mediaAPI.js'
import { buildExternalEmbed } from '../../utils/externalMedia.js'

const MIME_FILTERS = [
  { label: 'Tümü', value: '' },
  { label: 'Görseller', value: 'image/' },
  { label: 'Videolar', value: 'video/' },
  { label: 'Dokümanlar', value: 'application/' },
]

export default function MediaLibrary() {
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

  const queryClient = useQueryClient()
  const searchTimeoutRef = useRef(null)
  const tagTimeoutRef = useRef(null)

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

  const mediaQuery = useQuery({
    queryKey: ['media', queryParams],
    queryFn: async () => mediaAPI.list(queryParams),
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
          throw new Error(`Dosya yüklenemedi: ${file.name}. Sunucu yanıtı: ${uploadResponse.status} ${errorText}`)
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
      setExternalError(error)
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
    const confirmed = window.confirm('Bu medya öğesini silmek istediğine emin misin? Bu işlem geri alınamaz.')
    if (!confirmed) return
    deleteMutation.mutate(activeItem._id)
  }, [activeItem, deleteMutation])

  const handleBulkDelete = useCallback(() => {
    if (!selectedIds.length) return
    const confirmed = window.confirm('Seçili tüm medya öğeleri silinecek. Onaylıyor musun?')
    if (!confirmed) return
    bulkDeleteMutation.mutate(selectedIds)
  }, [bulkDeleteMutation, selectedIds])

  const handleBulkTagSubmit = useCallback(() => {
    if (!selectedIds.length) return
    const tags = bulkTagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    if (!tags.length) {
      alert('En az bir etiket girmelisin.')
      return
    }

    bulkTagMutation.mutate({ ids: selectedIds, tags, mode: bulkTagMode })
  }, [bulkTagInput, bulkTagMode, bulkTagMutation, selectedIds])

  const handleFormChange = useCallback((event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }, [])

  const items = mediaQuery.data?.items ?? []
  const selectedCount = selectedIds.length
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const totalCount = mediaQuery.data?.pagination?.total ?? 0
  const totalLabel = !mediaQuery.data && mediaQuery.isLoading
    ? 'Yükleniyor…'
    : `Toplam ${totalCount.toLocaleString('tr-TR')} medya`

  const copyUrl = useCallback(async (url, id) => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000)
    } catch (error) {
      const fallback = window.prompt("URL'yi kopyalamak için seçip kopyalayın:", url)
      if (fallback !== null) {
        setCopiedId(id)
        window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000)
      }
    }
  }, [])

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
      setExternalError(new Error('Lütfen geçerli bir URL girin.'))
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
      setExternalError(new Error('Süre alanı sayı olmalıdır.'))
      return
    }

    setExternalError(null)
    createExternalMutation.mutate(payload)
  }, [createExternalMutation, externalForm])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Medya Kütüphanesi</h1>
            <span className="text-sm text-gray-400">
              {totalLabel}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Varlık bazlı dosyalarını yönet, yeni dosyalar yükle ve mevcut içerikleri filtreleyerek bul.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row">
          <label className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer">
            <CloudArrowUpIcon className="h-5 w-5" aria-hidden="true" />
            <span>Dosya Yükle</span>
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
            URL'den Ekle
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-1">
          <label htmlFor="media-search" className="block text-sm font-medium text-gray-700">
            Dosya Adı
          </label>
          <input
            id="media-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Dosya adında ara"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
        <div className="sm:col-span-1">
          <label htmlFor="media-tags" className="block text-sm font-medium text-gray-700">
            Etiketler
          </label>
          <input
            id="media-tags"
            type="search"
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            placeholder="afiş, 2024"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
        <div className="sm:col-span-1">
          <label htmlFor="media-type" className="block text-sm font-medium text-gray-700">
            Tür
          </label>
          <select
            id="media-type"
            value={mimeFilter}
            onChange={(event) => setMimeFilter(event.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            {MIME_FILTERS.map((filter) => (
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
            Yenile
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
            Temizle
          </button>
        </div>
        {lastUploadedNames.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              {lastUploadedNames.length === 1
                ? `${lastUploadedNames[0]} yüklendi.`
                : `${lastUploadedNames.length} dosya yüklendi.`}
            </div>
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-blue-800">
            {selectedCount} medya seçildi
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setShowBulkTagPanel((prev) => !prev)}
              className="inline-flex items-center gap-x-2 rounded-md border border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
              disabled={bulkTagMutation.isPending}
            >
              <TagIcon className="h-4 w-4" />
              Etiket Ata
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-x-2 rounded-md border border-red-500 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              disabled={bulkDeleteMutation.isPending}
            >
              <TrashIcon className="h-4 w-4" />
              Seçiliyi Sil
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-x-2 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              Seçimi Temizle
            </button>
          </div>
        </div>
      )}

      {showBulkTagPanel && selectedCount > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-800">Seçili öğelere etiket ata</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={bulkTagInput}
              onChange={(event) => setBulkTagInput(event.target.value)}
              placeholder="Örn. kampanya, banner"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
            <select
              value={bulkTagMode}
              onChange={(event) => setBulkTagMode(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="add">Var olanlara ekle</option>
              <option value="replace">Var olanları değiştir</option>
            </select>
            <button
              type="button"
              onClick={handleBulkTagSubmit}
              className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={bulkTagMutation.isPending}
            >
              Uygula
            </button>
            <button
              type="button"
              onClick={() => setShowBulkTagPanel(false)}
              className="inline-flex items-center gap-x-2 rounded-md border border-transparent px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Kapat
            </button>
          </div>
          {bulkTagMutation.isError && (
            <div className="text-sm text-red-600">
              {(bulkTagMutation.error instanceof Error ? bulkTagMutation.error.message : 'Etiket atama sırasında hata oluştu')}
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
            Dosyaları buraya sürükleyip bırakabilir veya <span className="font-medium text-blue-600">Dosya Yükle</span> butonunu kullanabilirsiniz.
          </div>
          <div className="text-xs text-gray-500">Maksimum dosya boyutu 100 MB. Görseller otomatik olarak farklı boyutlara dönüştürülür.</div>
          {uploadMutation.isPending && <div className="text-blue-600">Dosyalar yükleniyor…</div>}
          {uploadMutation.isError && (
            <div className="text-red-600">
              {(uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Yükleme sırasında bir hata oluştu')}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Dosyalar</h2>
          <span className="text-sm text-gray-500">
            {mediaQuery.data?.pagination?.total ?? 0} kayıt
          </span>
        </div>
        <div className="p-6">
          {mediaQuery.isLoading ? (
            <div className="text-sm text-gray-500">Medya dosyaları yükleniyor...</div>
          ) : mediaQuery.isError ? (
            <div className="text-sm text-red-600">
              Medya dosyaları alınamadı. Lütfen tekrar deneyin.
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-500">Henüz yüklenmiş medya bulunmuyor.</div>
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
                          <dt>Boyut</dt>
                          <dd>{formatFileSize(item.size)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Tür</dt>
                          <dd>{item.mimeType || 'Bilinmiyor'}</dd>
                        </div>
                        {item.width && item.height && (
                          <div className="flex justify-between gap-2">
                            <dt>Ölçüler</dt>
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
                          İncele
                        </button>
                        <button
                          type="button"
                          onClick={() => copyUrl(item.url, item._id)}
                          title="URL'yi kopyala"
                          className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <DocumentDuplicateIcon className="h-5 w-5" />
                        </button>
                      </div>
                      {copiedId === item._id && (
                        <span className="text-xs text-green-600">URL kopyalandı</span>
                      )}
                    </div>
                  </article>
                )
              })}
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
                  Medya Ayrıntıları
                </Dialog.Title>
                {!item ? (
                  <p className="mt-6 text-sm text-gray-600">Yükleniyor...</p>
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
                                  title={item.originalName || item.fileName || 'Video'}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
                              Tarayıcınız video öğesini desteklemiyor.
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
                          <span className="font-medium text-gray-700">Kaynak</span>
                          <span className="text-gray-900">{isExternal ? 'Harici Video' : 'Dosya Yükleme'}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-700">Dosya Adı</span>
                          <span className="text-gray-900">{item.fileName}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-700">Tür</span>
                          <span className="text-gray-900">{item.mimeType || 'Bilinmiyor'}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-700">Boyut</span>
                          <span className="text-gray-900">{formatFileSize(item.size)}</span>
                        </div>
                        {item.width && item.height && (
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-gray-700">Ölçüler</span>
                            <span className="text-gray-900">{item.width} × {item.height}</span>
                          </div>
                        )}
                        <div className="truncate text-blue-600">
                          <button
                            type="button"
                            onClick={() => copyUrl(item.url, item._id)}
                            title="URL'yi kopyala"
                            className="inline-flex items-center gap-x-1 text-blue-600 hover:text-blue-700"
                          >
                            <DocumentDuplicateIcon className="h-4 w-4" />
                            <span>URL'yi kopyala</span>
                          </button>
                          {copiedId === item._id && (
                            <span className="ml-2 text-xs text-green-600">Kopyalandı</span>
                          )}
                        </div>
                        {isExternal && (
                          <div className="space-y-1 text-sm">
                            {item.provider && (
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-gray-700">Platform</span>
                                <span className="text-gray-900">{item.provider}</span>
                              </div>
                            )}
                            {item.providerId && (
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-gray-700">Video ID</span>
                                <span className="text-gray-900">{item.providerId}</span>
                              </div>
                            )}
                            {item.duration && (
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-gray-700">Süre</span>
                                <span className="text-gray-900">{Math.round(item.duration)} sn</span>
                              </div>
                            )}
                            <div className="flex justify-between gap-2">
                              <span className="font-medium text-gray-700">Harici URL</span>
                              <a
                                href={item.externalUrl || item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-700"
                              >
                                Aç
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <form className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="media-originalName">
                          Görünen İsim
                        </label>
                        <input
                          id="media-originalName"
                          name="originalName"
                          value={formState.originalName}
                          onChange={onChange}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">Sistemdeki dosya adı değişmez, bu alan listelerde görünecek ismi temsil eder.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="media-altText">
                          Alternatif Metin
                        </label>
                        <input
                          id="media-altText"
                          name="altText"
                          value={formState.altText}
                          onChange={onChange}
                          placeholder="Erişilebilirlik için görsel açıklaması"
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="media-caption">
                          Başlık / Caption
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
                          Açıklama
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
                          Etiketler
                        </label>
                        <input
                          id="media-tags"
                          name="tags"
                          value={formState.tags}
                          onChange={onChange}
                          placeholder="Virgülle ayrılmış etiketler"
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">Örnek: kampanya, hero, blog</p>
                      </div>

                      {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                          {(error instanceof Error ? error.message : 'Güncelleme sırasında bir hata oluştu')}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={onSave}
                          disabled={saving}
                          className="inline-flex flex-1 justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                        >
                          {saving ? 'Kaydediliyor…' : 'Kaydet'}
                        </button>
                        <button
                          type="button"
                          onClick={onDelete}
                          disabled={deleting}
                          className="inline-flex items-center justify-center gap-x-2 rounded-md border border-red-500 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          <TrashIcon className="h-4 w-4" />
                          {deleting ? 'Siliniyor…' : 'Sil'}
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
                  URL'den Video Ekle
                </Dialog.Title>
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="external-url">
                      Video URL'si
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
                        Başlık
                      </label>
                      <input
                        id="external-title"
                        name="title"
                        value={formState.title}
                        onChange={onChange}
                        placeholder="Örn. Lansman Videosu"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-thumbnail">
                        Thumbnail URL
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
                        Platform
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
                        Video ID
                      </label>
                      <input
                        id="external-providerId"
                        name="providerId"
                        value={formState.providerId}
                        onChange={onChange}
                        placeholder="Opsiyonel"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-altText">
                        Alternatif Metin
                      </label>
                      <input
                        id="external-altText"
                        name="altText"
                        value={formState.altText}
                        onChange={onChange}
                        placeholder="Erişilebilirlik açıklaması"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700" htmlFor="external-duration">
                        Süre (sn)
                      </label>
                      <input
                        id="external-duration"
                        name="duration"
                        type="number"
                        min="0"
                        value={formState.duration}
                        onChange={onChange}
                        placeholder="Opsiyonel"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="external-description">
                      Açıklama
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
                      Etiketler
                    </label>
                    <input
                      id="external-tags"
                      name="tags"
                      value={formState.tags}
                      onChange={onChange}
                      placeholder="ör. youtube, kampanya"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">Virgülle ayırarak birden fazla etiket ekleyebilirsin.</p>
                  </div>
                  {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {error instanceof Error ? error.message : 'Video eklenemedi. Lütfen tekrar dene.'}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      onClick={onSubmit}
                      disabled={isSubmitting}
                      className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                    >
                      {isSubmitting ? 'Ekleniyor…' : 'Medyaya Ekle'}
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
