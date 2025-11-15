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
}) {
  const queryClient = useQueryClient()
  const searchInputRef = useRef(null)
  const loadMoreRef = useRef(null)
  const [search, setSearch] = useState(initialSearch)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const debouncedSearch = useDebouncedValue(search, 400)

  useEffect(() => {
    if (!isOpen) {
      setSearch(initialSearch)
      setUploadError('')
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
      if (onSelect) {
        onSelect(item, event)
      }
    },
    [onSelect]
  )

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
                  <button
                    type="button"
                    onClick={onClose}
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
                          return (
                            <button
                              key={item._id}
                              type="button"
                              onClick={(event) => handleSelect(item, event)}
                              className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:border-blue-300 hover:shadow"
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
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
