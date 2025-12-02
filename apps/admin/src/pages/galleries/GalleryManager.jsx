import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { galleriesAPI } from '../../lib/galleriesAPI.js'
import MediaPickerModal from '../contents/components/MediaPickerModal.jsx'
import { PhotoIcon, TrashIcon, ArrowsUpDownIcon, PlusCircleIcon, VideoCameraIcon, PlayIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

const emptyGallery = {
  title: '',
  description: '',
  status: 'draft',
  items: [],
  linkedContentIds: [],
}

function GalleryItemsEditor({ items, onChange, openMediaPicker }) {
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
        <h3 className="text-sm font-semibold text-gray-900">Medya Öğeleri</h3>
        <button
          type="button"
          onClick={openMediaPicker}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <PlusCircleIcon className="h-5 w-5" />
          Görsel/Video ekle
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Galeride henüz medya yok. "Görsel/Video ekle" diyerek kütüphaneden öğe seçebilirsin.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item, index) => (
            <li key={`${item.mediaId}-${index}`} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 p-4 sm:flex-row">
                <div className="w-full max-w-[160px] flex-none overflow-hidden rounded-md bg-gray-100 relative">
                  {item.media?.sourceType === 'external' ? (
                    // External video (YouTube, Vimeo, etc.)
                    <div className="relative h-32 w-full bg-black">
                      {item.media.thumbnailUrl ? (
                        <>
                          <img src={item.media.thumbnailUrl} alt={item.media.originalName || 'Video'} className="h-full w-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <PlayIcon className="h-8 w-8 text-white drop-shadow-lg" />
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white">
                          <VideoCameraIcon className="h-10 w-10" />
                        </div>
                      )}
                      <div className="absolute top-1 left-1 bg-red-600 text-white text-xs px-1 rounded">
                        {item.media.provider?.toUpperCase() || 'VIDEO'}
                      </div>
                    </div>
                  ) : item.media?.publicUrl || item.media?.url ? (
                    // Regular image
                    <img src={item.media.publicUrl || item.media.url} alt={item.media.originalName || 'Medya'} className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center text-gray-300">
                      <PhotoIcon className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Başlık</label>
                    <input
                      type="text"
                      value={item.title || ''}
                      onChange={(e) => updateItem(index, { title: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Açıklama</label>
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
      const message = error?.response?.data?.message || error.message || 'Galeri oluşturulamadı.'
      setErrorMessage(message)
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
      const message = error?.response?.data?.message || error.message || 'Galeri güncelleme başarısız.'
      setErrorMessage(message)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: galleriesAPI.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galleries'] })
      resetForm()
    },
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
      setErrorMessage('Galeri başlığı gereklidir.')
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
    const confirmDelete = window.confirm('Bu galeriyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')
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
          <h1 className="text-2xl font-bold text-gray-900">Galeri Yönetimi</h1>
          <p className="mt-1 text-sm text-gray-600">Görsel ve video öğelerini gruplandırarak galeriler oluştur ve içeriklerle ilişkilendir.</p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Yeni Galeri
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Galeriler</h2>
            <input
              type="search"
              placeholder="Ara..."
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
              <div className="p-4 text-sm text-gray-500">Galeriler yükleniyor...</div>
            ) : galleries.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">Henüz galeri oluşturulmamış.</div>
            ) : (
              galleries.map((gallery) => {
                const active = selectedGalleryId === gallery.id
                const thumbnail = gallery.items?.[0]?.media?.publicUrl
                return (
                  <button
                    key={gallery.id}
                    type="button"
                    onClick={() => setSelectedGalleryId(gallery.id)}
                    className={clsx('flex w-full items-center gap-3 p-3 text-left hover:bg-gray-50 focus:outline-none', active && 'bg-blue-50 border-l-4 border-blue-500')}
                  >
                    <div className="h-14 w-14 flex-none overflow-hidden rounded-md bg-gray-100 relative">
                      {thumbnail ? (
                        <>
                          <img src={thumbnail} alt={gallery.title} className="h-full w-full object-cover" />
                          {gallery.items?.[0]?.media?.sourceType === 'external' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <PlayIcon className="h-4 w-4 text-white drop-shadow" />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          <PhotoIcon className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{gallery.title}</p>
                      <p className="truncate text-xs text-gray-500">{gallery.items?.length || 0} medya · {gallery.status === 'published' ? 'Yayında' : 'Taslak'}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Sayfa {pagination.page} / {pagination.pages}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={pagination.page <= 1}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Önceki
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(prev + 1, pagination.pages))}
                  disabled={pagination.page >= pagination.pages}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedGalleryId ? 'Galeriyi Düzenle' : 'Yeni Galeri'}</h2>
              <p className="text-sm text-gray-600">Başlık, açıklama ve medya öğelerini düzenleyebilirsin.</p>
            </div>
            {selectedGalleryId && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Sil
              </button>
            )}
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="gallery-title">Başlık</label>
              <input
                id="gallery-title"
                name="title"
                type="text"
                value={formState.title}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="Örn. Yaz Koleksiyonu"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="gallery-description">Açıklama</label>
              <textarea
                id="gallery-description"
                name="description"
                rows={3}
                value={formState.description}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="Galeriyi tanımlayan kısa açıklama"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="gallery-status">Durum</label>
              <select
                id="gallery-status"
                name="status"
                value={formState.status}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              >
                <option value="draft">Taslak</option>
                <option value="published">Yayında</option>
              </select>
            </div>

            <GalleryItemsEditor
              items={formState.items}
              onChange={handleItemsChange}
              openMediaPicker={() => setMediaPickerOpen(true)}
            />

            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

            <div className="flex items-center justify-end gap-3">
              {selectedGalleryId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Yeni Galeri
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
              >
                {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
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
