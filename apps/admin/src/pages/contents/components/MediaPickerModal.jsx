import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowPathIcon,
  CloudArrowUpIcon,
  DocumentIcon,
  PhotoIcon,
  PlayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { mediaAPI } from '../../../lib/mediaAPI.js'

const MODE_LABELS = {
  image: 'Görsel',
  video: 'Video',
  file: 'Dosya',
  any: 'Varlık',
}

function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function MediaPickerModal({
  isOpen,
  mode = 'image',
  initialSearch = '',
  onClose,
  onSelect,
  showUpload = true,
  multiple = false,
}) {
  const queryClient = useQueryClient()
  const searchInputRef = useRef(null)
  const loadMoreRef = useRef(null)
  const [search, setSearch] = useState(initialSearch)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [selectedItems, setSelectedItems] = useState([])
  const [activeTab, setActiveTab] = useState('library') // 'library' or 'url'
  const [videoUrl, setVideoUrl] = useState('')
  const debouncedSearch = useDebouncedValue(search, 400)

  useEffect(() => {
    if (!isOpen) {
      setSearch(initialSearch)
      setUploadError('')
      setSelectedItems([])
      setActiveTab('library')
      setVideoUrl('')
    }
  }, [isOpen, initialSearch])

  const filterMimePrefix = mode === 'image' ? 'image/' : mode === 'video' ? 'video/' : undefined

  const queryKey = useMemo(
    () => [
      'media-picker-list',
      {
        search: debouncedSearch || undefined,
        mode,
      },
    ],
    [debouncedSearch, mode]
  )

  const mediaQuery = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 1 }) =>
      mediaAPI.list({
        page: pageParam,
        limit: 18,
        search: debouncedSearch || undefined,
        mimeType: filterMimePrefix,
      }),
    getNextPageParam: (lastPage, pages) => {
      const currentPage = pages.length
      const totalPages = lastPage?.pagination?.pages || 1
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    enabled: isOpen,
    keepPreviousData: true,
  })

  const items = useMemo(() => {
    const flat = mediaQuery.data?.pages?.flatMap(page => page.items || []) ?? []
    if (mode === 'file') {
      return flat.filter((item) => {
        const mime = item?.mimeType || ''
        return !(mime.startsWith('image/') || mime.startsWith('video/'))
      })
    }
    return flat
  }, [mediaQuery.data, mode])

  const totalCount = mediaQuery.data?.pages?.[0]?.pagination?.total ?? 0

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !isOpen) return

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
  }, [mediaQuery, isOpen])

  const handleFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || [])
      if (!files.length) return

      setIsUploading(true)
      setUploadError('')
      try {
        const uploadedItems = []
        for (const file of files) {
          if (mode === 'image' && !file.type.startsWith('image/')) {
            throw new Error('Sadece görsel dosyaları yükleyebilirsin.')
          }
          if (mode === 'video' && !file.type.startsWith('video/')) {
            throw new Error('Sadece video dosyaları yükleyebilirsin.')
          }

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

          const record = await mediaAPI.completeUpload({
            key: presign.key,
            originalName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
          })

          uploadedItems.push(record)
        }

        queryClient.invalidateQueries({ queryKey: ['media'] })
        queryClient.invalidateQueries({ queryKey })

        if (uploadedItems.length && onSelect) {
          onSelect(uploadedItems[uploadedItems.length - 1])
        }
      } catch (error) {
        console.error('Media upload failed', error)
        setUploadError(error instanceof Error ? error.message : 'Dosya yükleme sırasında hata oluştu.')
      } finally {
        setIsUploading(false)
      }
    },
    [mode, onSelect, queryClient, queryKey]
  )

  const handleSelect = useCallback(
    (item, event) => {
      if (event) {
        event.preventDefault()
        event.stopPropagation()
      }

      if (multiple) {
        setSelectedItems((prev) => {
          const exists = prev.some((i) => i._id === item._id)
          if (exists) {
            return prev.filter((i) => i._id !== item._id)
          }
          return [...prev, item]
        })
      } else {
        if (onSelect) {
          onSelect(item, event)
        }
      }
    },
    [multiple, onSelect]
  )

  const handleConfirmSelection = useCallback(() => {
    if (onSelect) {
      onSelect(selectedItems)
    }
  }, [onSelect, selectedItems])

  const handleVideoUrlSubmit = useCallback(async () => {
    if (!videoUrl) return

    setIsUploading(true)
    try {
      let provider = 'other'
      let providerId = null
      let externalUrl = videoUrl

      if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        provider = 'youtube'
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
        const match = videoUrl.match(regExp)
        providerId = (match && match[2].length === 11) ? match[2] : null
      } else if (videoUrl.includes('vimeo.com')) {
        provider = 'vimeo'
        const regExp = /vimeo\.com\/(\d+)/
        const match = videoUrl.match(regExp)
        providerId = match ? match[1] : null
      }

      const media = await mediaAPI.createExternal({
        url: videoUrl,
        title: 'Video', // Kullanıcıdan başlık istenebilir veya otomatik çekilebilir
        provider,
        providerId,
        altText: 'Video',
      })

      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey })

      if (onSelect) {
        onSelect(media)
      }
    } catch (error) {
      console.error('Video URL save failed', error)
      setUploadError('Video eklenirken bir hata oluştu.')
    } finally {
      setIsUploading(false)
    }
  }, [videoUrl, onSelect, queryClient, queryKey])

  if (!isOpen) {
    return null
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-[70]"
        onClose={onClose}
        initialFocus={searchInputRef}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="w-full max-w-5xl transform overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      {MODE_LABELS[mode] || 'Varlık'} seç
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">
                      Medya kütüphanesinden seçim yapabilir veya yeni dosya yükleyebilirsin.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {mode === 'video' && (
                      <div className="flex rounded-md bg-gray-100 p-1 mr-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('library')}
                          className={clsx(
                            'rounded px-3 py-1.5 text-sm font-medium transition',
                            activeTab === 'library' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'
                          )}
                        >
                          Kütüphane
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('url')}
                          className={clsx(
                            'rounded px-3 py-1.5 text-sm font-medium transition',
                            activeTab === 'url' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'
                          )}
                        >
                          URL'den Ekle
                        </button>
                      </div>
                    )}
                    {multiple && selectedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleConfirmSelection}
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Seç ({selectedItems.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    >
                      <span className="sr-only">Kapat</span>
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 px-6 py-5">
                  {activeTab === 'library' ? (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <label htmlFor="media-picker-search" className="block text-sm font-medium text-gray-700">
                            Ara
                          </label>
                          <input
                            ref={searchInputRef}
                            id="media-picker-search"
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={`${MODE_LABELS[mode] || 'Varlık'} ara`}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                          />
                        </div>
                        {showUpload && (
                          <label className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer">
                            <CloudArrowUpIcon className="h-5 w-5" aria-hidden="true" />
                            <span>Dosya yükle</span>
                            <input
                              type="file"
                              className="hidden"
                              multiple
                              onChange={(event) => {
                                handleFiles(event.target.files)
                                event.target.value = ''
                              }}
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => mediaQuery.refetch()}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <ArrowPathIcon className={clsx('h-5 w-5', mediaQuery.isFetching ? 'animate-spin' : '')} />
                          Yenile
                        </button>
                      </div>

                      {uploadError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
                          {uploadError}
                        </div>
                      )}

                      <div className="min-h-[260px] max-h-[500px] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
                        {mediaQuery.isLoading ? (
                          <div className="text-sm text-gray-500">Dosyalar yükleniyor…</div>
                        ) : items.length === 0 ? (
                          <div className="text-sm text-gray-500">Sonuç bulunamadı.</div>
                        ) : (
                          <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              {items.map((item) => {
                                const isImage = item.mimeType?.startsWith('image/')
                                const providerName = typeof item.provider === 'string' ? item.provider.toLowerCase() : ''
                                const isVideo = item.mimeType?.startsWith('video/') || ['youtube', 'vimeo'].includes(providerName)
                                const imageThumbnail = item.variants?.find((variant) => variant.name === 'thumbnail')?.url
                                const thumbnail = isImage
                                  ? imageThumbnail || item.url
                                  : isVideo
                                    ? item.thumbnailUrl || imageThumbnail || null
                                    : null

                                const isSelected = multiple && selectedItems.some((i) => i._id === item._id)

                                return (
                                  <button
                                    key={item._id}
                                    type="button"
                                    onClick={(event) => handleSelect(item, event)}
                                    className={clsx(
                                      'flex flex-col overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:shadow',
                                      isSelected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-200 hover:border-blue-300'
                                    )}
                                  >
                                    <div className="relative aspect-video bg-gray-100">
                                      {isImage && thumbnail ? (
                                        <img src={thumbnail} alt={item.altText || item.originalName} className="h-full w-full object-cover" />
                                      ) : isVideo && thumbnail ? (
                                        <div className="relative h-full w-full">
                                          <img src={thumbnail} alt={item.altText || item.originalName || item.fileName} className="h-full w-full object-cover" />
                                          <PlayIcon className="absolute inset-0 m-auto h-10 w-10 text-white drop-shadow" />
                                        </div>
                                      ) : isVideo ? (
                                        <div className="flex h-full w-full items-center justify-center bg-black/10 text-gray-500">
                                          <PlayIcon className="h-10 w-10" />
                                        </div>
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                                          <DocumentIcon className="h-10 w-10" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="space-y-1 px-3 py-2">
                                      <p className="truncate text-sm font-medium text-gray-900">
                                        {item.originalName || item.fileName}
                                      </p>
                                      <p className="text-xs text-gray-500">{item.mimeType || 'Bilinmiyor'}</p>
                                      {isVideo && item.duration ? (
                                        <p className="text-xs text-gray-500">{Math.round(item.duration)} sn</p>
                                      ) : null}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                            {/* Infinite scroll trigger */}
                            <div ref={loadMoreRef} className="py-4 text-center">
                              {mediaQuery.isFetchingNextPage ? (
                                <div className="text-sm text-gray-500">Daha fazla medya yükleniyor...</div>
                              ) : mediaQuery.hasNextPage ? (
                                <div className="text-sm text-gray-400">Aşağı kaydırarak daha fazla yükle</div>
                              ) : (
                                <div className="text-sm text-gray-400">Tüm medya dosyaları yüklendi</div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{totalCount} kayıt</span>
                      </div>

                      {isUploading && (
                        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-700">
                          Dosya yükleniyor…
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col gap-4 py-8">
                      <div>
                        <label htmlFor="video-url" className="block text-sm font-medium text-gray-700">
                          Video URL
                        </label>
                        <div className="mt-1 flex rounded-md shadow-sm">
                          <input
                            type="text"
                            name="video-url"
                            id="video-url"
                            className="block w-full flex-1 rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                          />
                        </div>
                        <p className="mt-2 text-sm text-gray-500">
                          YouTube veya Vimeo bağlantısı yapıştırın.
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleVideoUrlSubmit}
                          disabled={!videoUrl || isUploading}
                          className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUploading ? 'Ekleniyor...' : 'Ekle'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
