import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { galleriesAPI } from '../../lib/galleriesAPI.js'
import { useApiError } from '../../lib/useApiError.js'
import MediaPickerModal from '../contents/components/MediaPickerModal.jsx'
import { PhotoIcon, TrashIcon, ArrowsUpDownIcon, PlusCircleIcon, VideoCameraIcon, PlayIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { getGalleryId, getMediaPreview } from './galleryPresentation.js'

const emptyGallery = {
  title: '',
  description: '',
  status: 'draft',
  items: [],
  linkedContentIds: [],
}

function GalleryMediaPreview({ media, alt, compact = false }) {
  const { t } = useTranslation()
  const preview = getMediaPreview(media)
  const heightClass = compact ? 'h-full' : 'h-32'

  if (preview.isVideo) {
    return (
      <div className={clsx('relative w-full bg-black', heightClass)}>
        {preview.url ? (
          <img src={preview.url} alt={alt || t('gallery.video_alt')} className="h-full w-full object-cover" />
        ) : !preview.isExternal && preview.mediaUrl ? (
          <video src={preview.mediaUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white">
            <VideoCameraIcon className={compact ? 'h-6 w-6' : 'h-10 w-10'} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <PlayIcon className={clsx('text-white drop-shadow-lg', compact ? 'h-4 w-4' : 'h-8 w-8')} />
        </div>
        {!compact && (
          <div className="absolute top-1 left-1 bg-red-600 text-white text-xs px-1 rounded">
            {media?.provider?.toUpperCase() || 'VIDEO'}
          </div>
        )}
      </div>
    )
  }

  if (preview.url) {
    return <img src={preview.url} alt={alt || t('gallery.media_alt')} className={clsx('w-full object-cover', heightClass)} />
  }

  return (
    <div className={clsx('flex w-full items-center justify-center text-gray-300', heightClass)}>
      <PhotoIcon className={compact ? 'h-6 w-6' : 'h-10 w-10'} />
    </div>
  )
}

function GalleryItemsEditor({ items, onChange, openMediaPicker }) {
  const { t } = useTranslation()

  const updateItem = useCallback((index, patch) => {
    onChange(items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)))
  }, [items, onChange])

  const removeItem = useCallback((index) => {
    onChange(items.filter((_, idx) => idx !== index))
  }, [items, onChange])

  const moveItem = useCallback((index, direction) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= items.length) return
    const next = [...items]
    const [current] = next.splice(index, 1)
    next.splice(nextIndex, 0, current)
    onChange(next)
  }, [items, onChange])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{t('gallery.items_title')}</h3>
        <button
          type="button"
          onClick={openMediaPicker}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <PlusCircleIcon className="h-5 w-5" />
          {t('gallery.add_media')}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{t('gallery.items_empty')}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item, index) => (
            <li key={`${item.mediaId}-${index}`} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 p-4 sm:flex-row">
                <div className="w-full max-w-[160px] flex-none overflow-hidden rounded-md bg-gray-100 relative">
                  <GalleryMediaPreview
                    media={item.media}
                    alt={item.media?.altText || item.media?.originalName || t('gallery.media_alt')}
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('common.title')}</label>
                    <input
                      type="text"
                      value={item.title || ''}
                      onChange={(e) => updateItem(index, { title: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('common.description')}</label>
                    <textarea
                      rows={2}
                      value={item.caption || ''}
                      onChange={(e) => updateItem(index, { caption: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{item.media?.originalName || item.mediaId}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveItem(index, -1)}
                        className={clsx('inline-flex items-center rounded-md border border-gray-300 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50', index === 0 && 'opacity-40 cursor-not-allowed')}
                        disabled={index === 0}
                      >
                        <ArrowsUpDownIcon className="h-4 w-4 rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(index, 1)}
                        className={clsx('inline-flex items-center rounded-md border border-gray-300 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50', index === items.length - 1 && 'opacity-40 cursor-not-allowed')}
                        disabled={index === items.length - 1}
                      >
                        <ArrowsUpDownIcon className="h-4 w-4 -rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="inline-flex items-center rounded-md border border-red-200 p-1 text-red-500 hover:bg-red-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function GalleryManager() {
  const { t } = useTranslation()
  const describeError = useApiError()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedGalleryId, setSelectedGalleryId] = useState(null)
  const [formState, setFormState] = useState(emptyGallery)
  const [errorMessage, setErrorMessage] = useState('')
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)

  const listQuery = useQuery({
    queryKey: ['galleries', { search, page }],
    queryFn: () => galleriesAPI.list({ search, page, limit: 20 }),
    keepPreviousData: true
  })

  const selectedGalleryQuery = useQuery({
    queryKey: ['galleries', 'detail', selectedGalleryId],
    queryFn: () => galleriesAPI.get(selectedGalleryId),
    enabled: Boolean(selectedGalleryId)
  })

  useEffect(() => {
    if (selectedGalleryId && selectedGalleryQuery.data) {
      const gallery = selectedGalleryQuery.data
      setFormState({
        title: gallery.title,
        description: gallery.description || '',
        status: gallery.status || 'draft',
        items: (gallery.items || []).map((item) => ({
          mediaId: item.mediaId || item.media?.id,
          title: item.title,
          caption: item.caption,
          media: item.media || null,
        })),
        linkedContentIds: gallery.linkedContentIds || []
      })
      setErrorMessage('')
    }
  }, [selectedGalleryId, selectedGalleryQuery.data])

  const resetForm = useCallback(() => {
    setSelectedGalleryId(null)
    setFormState(emptyGallery)
    setErrorMessage('')
  }, [])

  const createMutation = useMutation({
    mutationFn: galleriesAPI.create,
    onMutate: () => setErrorMessage(''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galleries'] })
      resetForm()
    },
    onError: (error) => {
      setErrorMessage(describeError(error, 'gallery.create_failed'))
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => galleriesAPI.update(id, payload),
    onMutate: () => setErrorMessage(''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galleries'] })
      if (selectedGalleryId) {
        queryClient.invalidateQueries({ queryKey: ['galleries', 'detail', selectedGalleryId] })
      }
    },
    onError: (error) => {
      setErrorMessage(describeError(error, 'gallery.update_failed'))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: galleriesAPI.remove,
    onMutate: () => setErrorMessage(''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galleries'] })
      resetForm()
    },
    onError: (error) => {
      setErrorMessage(describeError(error, 'gallery.delete_failed'))
    }
  })

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleItemsChange = (nextItems) => {
    setFormState((prev) => ({ ...prev, items: nextItems }))
  }

  const handleMediaSelected = (selection) => {
    const selectedList = Array.isArray(selection) ? selection : [selection]
    const nextItems = selectedList
      .map((media) => {
        if (!media) return null
        const mediaId = media.id || media._id
        if (!mediaId) return null
        return {
          mediaId,
          title: media.originalName || media.title || '',
          caption: '',
          media,
        }
      })
      .filter(Boolean)

    if (!nextItems.length) {
      setMediaPickerOpen(false)
      return
    }

    setFormState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        ...nextItems
      ]
    }))
    setMediaPickerOpen(false)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!formState.title.trim()) {
      setErrorMessage(t('gallery.title_required'))
      return
    }

    const payload = {
      title: formState.title.trim(),
      description: formState.description?.trim() || '',
      status: formState.status,
      items: formState.items.map((item, index) => ({
        mediaId: item.mediaId,
        title: item.title?.trim() || '',
        caption: item.caption?.trim() || '',
        order: index
      })),
      linkedContentIds: formState.linkedContentIds || []
    }

    if (selectedGalleryId) {
      updateMutation.mutate({ id: selectedGalleryId, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleDelete = () => {
    if (!selectedGalleryId) return
    const confirmDelete = window.confirm(t('gallery.delete_confirm'))
    if (!confirmDelete) return
    deleteMutation.mutate(selectedGalleryId)
  }

  const isSaving = createMutation.isLoading || updateMutation.isLoading

  const galleries = listQuery.data?.items || []
  const pagination = listQuery.data?.pagination || { page: 1, pages: 1 }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('gallery.page_title')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('gallery.page_subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          {t('gallery.new')}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{t('gallery.list_title')}</h2>
            <input
              type="search"
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>

          <div className="divide-y divide-gray-200 rounded-md border border-gray-200">
            {listQuery.isLoading ? (
              <div className="p-4 text-sm text-gray-500">{t('gallery.loading')}</div>
            ) : galleries.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">{t('gallery.empty')}</div>
            ) : (
              galleries.map((gallery) => {
                const galleryId = getGalleryId(gallery)
                const active = selectedGalleryId === galleryId
                return (
                  <button
                    key={galleryId}
                    type="button"
                    onClick={() => galleryId && setSelectedGalleryId(galleryId)}
                    disabled={!galleryId}
                    className={clsx('flex w-full min-w-0 items-center gap-3 overflow-hidden p-3 text-left hover:bg-gray-50 focus:outline-none', active && 'bg-blue-50 border-l-4 border-blue-500')}
                  >
                    <div className="h-14 w-14 flex-none overflow-hidden rounded-md bg-gray-100 relative">
                      <GalleryMediaPreview media={gallery.items?.[0]?.media} alt={gallery.title} compact />
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="truncate text-sm font-semibold text-gray-900" title={gallery.title}>{gallery.title}</p>
                      <p className="truncate text-xs text-gray-500">
                        {t('gallery.item_summary', {
                          count: gallery.items?.length || 0,
                          status: gallery.status === 'published' ? t('status.published') : t('status.draft'),
                        })}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>{t('gallery.page_indicator', { current: pagination.page, total: pagination.pages })}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={pagination.page <= 1}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('common.previous')}
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(prev + 1, pagination.pages))}
                  disabled={pagination.page >= pagination.pages}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="min-w-0 space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedGalleryId ? t('gallery.edit') : t('gallery.new')}</h2>
              <p className="text-sm text-gray-600">{t('gallery.form_hint')}</p>
            </div>
            {selectedGalleryId && selectedGalleryQuery.data?.status === 'draft' && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isLoading}
                className="inline-flex items-center rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {deleteMutation.isLoading ? t('common.deleting') : t('gallery.delete_draft')}
              </button>
            )}
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="gallery-title">{t('common.title')}</label>
              <input
                id="gallery-title"
                name="title"
                type="text"
                value={formState.title}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder={t('gallery.title_placeholder')}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="gallery-description">{t('common.description')}</label>
              <textarea
                id="gallery-description"
                name="description"
                rows={3}
                value={formState.description}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder={t('gallery.description_placeholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="gallery-status">{t('common.status')}</label>
              <select
                id="gallery-status"
                name="status"
                value={formState.status}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              >
                <option value="draft">{t('status.draft')}</option>
                <option value="published">{t('status.published')}</option>
              </select>
            </div>

            <GalleryItemsEditor
              items={formState.items}
              onChange={handleItemsChange}
              openMediaPicker={() => setMediaPickerOpen(true)}
            />

            {selectedGalleryId && selectedGalleryQuery.data?.status === 'published' && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t('gallery.published_delete_notice')}
              </p>
            )}

            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

            <div className="flex items-center justify-end gap-3">
              {selectedGalleryId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  {t('gallery.new')}
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
              >
                {isSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </section>
      </div>

      <MediaPickerModal
        isOpen={mediaPickerOpen}
        mode="any"
        multiple
        onClose={() => setMediaPickerOpen(false)}
        onSelect={handleMediaSelected}
      />
    </div>
  )
}
