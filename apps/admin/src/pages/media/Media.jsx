import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowPathIcon,
  CloudArrowUpIcon,
  DocumentIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { mediaAPI } from '../../lib/mediaAPI.js'

const MIME_FILTERS = [
  { label: 'Tümü', value: '' },
  { label: 'Görseller', value: 'image/' },
  { label: 'Videolar', value: 'video/' },
  { label: 'Dokümanlar', value: 'application/' },
]

export default function MediaLibrary() {
  const [search, setSearch] = useState('')
  const [mimeFilter, setMimeFilter] = useState('')
  const [lastUploadedNames, setLastUploadedNames] = useState([])
  const queryClient = useQueryClient()

  const queryParams = useMemo(() => ({
    search: search.trim() || undefined,
    mimeType: mimeFilter || undefined,
    limit: 40,
  }), [search, mimeFilter])

  const mediaQuery = useQuery({
    queryKey: ['media', queryParams],
    queryFn: async () => {
      const data = await mediaAPI.list(queryParams)
      return data
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

  const items = mediaQuery.data?.items ?? []

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Medya Kütüphanesi</h1>
          <p className="mt-2 text-sm text-gray-600">
            Varlık bazlı dosyalarını yönet, yeni dosyalar yükle ve mevcut içerikleri filtreleyerek bul.
          </p>
        </div>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div className="sm:col-span-1">
          <label htmlFor="media-search" className="block text-sm font-medium text-gray-700">
            Arama
          </label>
          <input
            id="media-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Dosya adı veya etiket"
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
              {items.map((item) => (
                <article
                  key={item._id}
                  className="flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
                >
                  <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                    {item.mimeType?.startsWith('image/') ? (
                      <img
                        src={item.variants?.find((variant) => variant.name === 'thumbnail')?.url || item.url}
                        alt={item.altText || item.originalName || item.fileName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <DocumentIcon className="h-12 w-12 text-gray-400" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{item.originalName || item.fileName}</h3>
                      {item.mimeType?.startsWith('image/') ? (
                        <PhotoIcon className="h-5 w-5 text-blue-500" />
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
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      İncele
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
