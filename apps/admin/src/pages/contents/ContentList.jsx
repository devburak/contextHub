import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listContents } from '../../lib/api/contents'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { Link } from 'react-router-dom'
import { searchTags } from '../../lib/api/tags'
import clsx from 'clsx'

export default function ContentList() {
  const { token, activeTenantId } = useAuth()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false)
  const tagContainerRef = useRef(null)

  const debouncedTagSearch = useDebouncedValue(tagInput, 800)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 2000)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!isTagDropdownOpen) return
    const handleClickOutside = (event) => {
      if (!tagContainerRef.current?.contains(event.target)) {
        setIsTagDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isTagDropdownOpen])

  const { data, isLoading, isError, refetch } = useQuery([
    'contents', { tenant: activeTenantId, page, status, search: debouncedSearch, tag: selectedTag?._id || null }
  ], () => listContents({
    page,
    filters: {
      status,
      search: debouncedSearch,
      tag: selectedTag?._id || undefined,
    },
  }), {
    keepPreviousData: true,
    enabled: !!token && !!activeTenantId
  })

  const items = data?.items || []
  const pagination = data?.pagination || { page: 1, pages: 1 }

  const tagQuery = useQuery(
    ['tag-filter', debouncedTagSearch],
    () => searchTags({ search: debouncedTagSearch || undefined, limit: 15 }),
    {
      enabled: isTagDropdownOpen,
      keepPreviousData: true,
    }
  )

  const tagOptions = useMemo(() => tagQuery.data?.tags ?? [], [tagQuery.data])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Durum</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="mt-1 block w-44 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="">Hepsi</option>
            <option value="draft">Taslak</option>
            <option value="scheduled">Zamanlanmış</option>
            <option value="published">Yayında</option>
            <option value="archived">Arşiv</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Ara</label>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Başlık veya özet..."
              className="mt-1 block w-72 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Etiket</label>
          <div className="relative w-64" ref={tagContainerRef}>
            <input
              type="search"
              value={tagInput}
              onChange={(event) => {
                setTagInput(event.target.value)
                if (!isTagDropdownOpen) {
                  setIsTagDropdownOpen(true)
                }
              }}
              onFocus={() => setIsTagDropdownOpen(true)}
              placeholder={selectedTag ? selectedTag.title || selectedTag.slug : 'Etiket ara'}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
            {selectedTag && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                {selectedTag.title || selectedTag.slug}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTag(null)
                    setTagInput('')
                    setPage(1)
                  }}
                  className="text-green-500 hover:text-green-700"
                >
                  ×
                </button>
              </div>
            )}
            {isTagDropdownOpen && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="max-h-56 overflow-y-auto text-sm">
                  {tagQuery.isLoading ? (
                    <div className="px-4 py-3 text-gray-500">Etiketler yükleniyor…</div>
                  ) : tagOptions.length === 0 ? (
                    <div className="px-4 py-3 text-gray-500">Sonuç bulunamadı.</div>
                  ) : (
                    tagOptions.map((tag) => {
                      const isActive = selectedTag && String(selectedTag._id) === String(tag._id)
                      return (
                        <button
                          key={tag._id}
                          type="button"
                          onClick={() => {
                            setSelectedTag(tag)
                            setTagInput(tag.title || tag.slug || '')
                            setIsTagDropdownOpen(false)
                            setPage(1)
                          }}
                          className={clsx(
                            'flex w-full items-start gap-2 px-4 py-2 text-left transition',
                            isActive
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-gray-100 text-gray-700'
                          )}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{tag.title || tag.slug}</div>
                            <div className="text-xs text-gray-500">/{tag.slug}</div>
                          </div>
                          {isActive && <span className="text-xs font-semibold text-blue-600">Seçili</span>}
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
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Link
            to="/contents/new"
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >Yeni İçerik</Link>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >Yenile</button>
        </div>
      </div>

      {isLoading && <div>Yükleniyor...</div>}
      {isError && <div className="text-red-600 text-sm">İçerikler yüklenirken hata oluştu.</div>}

      {!isLoading && !items.length && (
        <div className="text-sm text-gray-600 border rounded p-6 bg-white">Henüz içerik yok.</div>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Başlık</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700 w-40">Durum</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700 w-48">Güncellendi</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map(item => (
                <tr key={item._id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900 truncate max-w-xs">{item.title}</div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">/{item.slug}</div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs">
                    {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/contents/${item._id}`} className="text-blue-600 hover:underline">Düzenle</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <div>Sayfa {pagination.page} / {pagination.pages}</div>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 rounded border text-gray-700 disabled:opacity-40"
            >Önceki</button>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 rounded border text-gray-700 disabled:opacity-40"
            >Sonraki</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    draft: { label: 'Taslak', class: 'bg-gray-100 text-gray-700' },
    scheduled: { label: 'Zamanlanmış', class: 'bg-purple-100 text-purple-700' },
    published: { label: 'Yayında', class: 'bg-green-100 text-green-700' },
    archived: { label: 'Arşiv', class: 'bg-yellow-100 text-yellow-700' }
  }
  const meta = map[status] || { label: status || 'Bilinmiyor', class: 'bg-gray-100 text-gray-700' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.class}`}>{meta.label}</span>
}

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
