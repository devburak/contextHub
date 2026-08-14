import { cloneElement, useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { listContents } from '../../lib/api/contents'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { Link, useNavigate } from 'react-router-dom'
import { searchTags } from '../../lib/api/tags'
import { categoryAPI } from '../../lib/categoryAPI'
import clsx from 'clsx'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { adminPluginContentSearch } from '../../plugins/registry.jsx'

export default function ContentList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAuthenticated, activeTenantId, hasPermission, hasFeature } = useAuth()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false)
  const tagContainerRef = useRef(null)

  const debouncedTagSearch = useDebouncedValue(tagInput, 300)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
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
    'contents', { tenant: activeTenantId, page, status, category, search: debouncedSearch, tag: selectedTag?._id || null }
  ], () => listContents({
    page,
    filters: {
      status,
      category,
      search: debouncedSearch,
      tag: selectedTag?._id || undefined,
    },
  }), {
    keepPreviousData: true,
    enabled: isAuthenticated && !!activeTenantId
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

  const categoryQuery = useQuery({
    queryKey: ['categories', 'flat'],
    queryFn: categoryAPI.listFlat,
    enabled: isAuthenticated && !!activeTenantId,
  })

  const categoryOptions = useMemo(() => {
    if (!categoryQuery.data) return []
    return categoryQuery.data.map(cat => ({
      value: cat._id,
      label: `${'— '.repeat(cat.ancestors?.length || 0)}${cat.name}`
    }))
  }, [categoryQuery.data])

  const tagOptions = useMemo(() => tagQuery.data?.tags ?? [], [tagQuery.data])

  const filterInputClass = 'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-400'
  const availableSemanticSearch = adminPluginContentSearch.filter((item) => (
    (!item.permission || hasPermission(item.permission))
    && (!item.feature || hasFeature(item.feature))
  ))
  const hasLockedSemanticSearch = adminPluginContentSearch.some((item) => (
    (!item.permission || hasPermission(item.permission))
    && item.feature
    && !hasFeature(item.feature)
  ))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-medium text-gray-700">{t('common.status')}</label>
          <div className="relative mt-1 w-full sm:w-44">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className={clsx(filterInputClass, 'appearance-none pr-9')}
            >
              <option value="">{t('content.filter_all')}</option>
              <option value="draft">{t('status.draft')}</option>
              <option value="scheduled">{t('status.scheduled')}</option>
              <option value="published">{t('status.published')}</option>
              <option value="archived">{t('status.archived')}</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-medium text-gray-700">{t('content.category')}</label>
          <div className="relative mt-1 w-full sm:w-48">
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className={clsx(filterInputClass, 'appearance-none pr-9')}
            >
              <option value="">{t('content.filter_all')}</option>
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <label className="block text-sm font-medium text-gray-700">{t('common.search')}</label>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('content.search_placeholder')}
            className={clsx('mt-1', filterInputClass)}
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-medium text-gray-700">{t('content.tag')}</label>
          <div className="relative w-full sm:w-64" ref={tagContainerRef}>
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
              placeholder={selectedTag ? selectedTag.title || selectedTag.slug : t('content.tag_filter_placeholder')}
              className={clsx('mt-1', filterInputClass)}
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
                    <div className="px-4 py-3 text-gray-500">{t('content.tags_loading')}</div>
                  ) : tagOptions.length === 0 ? (
                    <div className="px-4 py-3 text-gray-500">{t('common.no_results')}</div>
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
                          {isActive && <span className="text-xs font-semibold text-blue-600">{t('content.selected')}</span>}
                        </button>
                      )
                    })
                  )}
                </div>
                {tagQuery.isFetching && !tagQuery.isLoading && (
                  <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                    {t('content.updating')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <Link
            to="/contents/new"
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >{t('content.new_content')}</Link>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >{t('common.refresh')}</button>
        </div>
      </div>

      {debouncedSearch.length >= 2 && availableSemanticSearch.map((contribution) => (
        <div key={contribution.id}>
          {cloneElement(contribution.element, {
            query: debouncedSearch,
            filters: { status, category, tag: selectedTag?._id || null },
            exactItemIds: items.map((item) => String(item._id)),
          })}
        </div>
      ))}

      {debouncedSearch.length >= 2 && hasLockedSemanticSearch && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('content.semantic_search_locked')}
        </div>
      )}

      {isLoading && <div>{t('common.loading')}</div>}
      {isError && <div className="text-red-600 text-sm">{t('content.list_load_failed')}</div>}

      {!isLoading && !items.length && (
        <div className="text-sm text-gray-600 border rounded p-6 bg-white">{t('content.empty')}</div>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full divide-y divide-gray-200 text-sm sm:min-w-[680px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">{t('common.title')}</th>
                <th className="hidden w-40 px-4 py-2 text-left font-semibold text-gray-700 sm:table-cell">{t('common.status')}</th>
                <th className="hidden w-48 px-4 py-2 text-left font-semibold text-gray-700 sm:table-cell">{t('common.updated')}</th>
                <th className="hidden px-4 py-2 sm:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map(item => {
                const editPath = `/contents/${item._id}`
                return (
                <tr
                  key={item._id}
                  role="link"
                  tabIndex={0}
                  aria-label={`${item.title} – ${t('common.edit')}`}
                  onClick={() => navigate(editPath)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      navigate(editPath)
                    }
                  }}
                  className="group cursor-pointer transition-colors hover:bg-blue-50/60 focus:outline-none focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                >
                  <td className="px-4 py-3 sm:py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900 sm:max-w-xs">{item.title}</div>
                        <div className="truncate text-xs text-gray-500 sm:max-w-xs">/{item.slug}</div>
                      </div>
                      <span className="inline-flex min-h-11 flex-none items-center gap-1 rounded-md bg-blue-50 px-3 text-sm font-semibold text-blue-700 group-hover:bg-blue-100 sm:hidden" aria-hidden="true">
                        {t('common.edit')} <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="hidden px-4 py-2 text-xs text-gray-600 sm:table-cell">
                    {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}
                  </td>
                  <td className="hidden px-4 py-2 text-right sm:table-cell">
                    <Link
                      to={editPath}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      className="inline-flex min-h-11 items-center rounded-md px-2 text-blue-600 hover:bg-blue-50 hover:underline"
                    >
                      {t('common.edit')}
                    </Link>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>{t('content.page_indicator', { current: pagination.page, total: pagination.pages })}</div>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="min-h-11 rounded border px-3 py-2 text-gray-700 disabled:opacity-40"
            >{t('common.previous')}</button>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage(p => p + 1)}
              className="min-h-11 rounded border px-3 py-2 text-gray-700 disabled:opacity-40"
            >{t('common.next')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const { t } = useTranslation()
  const map = {
    draft: { label: t('status.draft'), class: 'bg-gray-100 text-gray-700' },
    scheduled: { label: t('status.scheduled'), class: 'bg-purple-100 text-purple-700' },
    published: { label: t('status.published'), class: 'bg-green-100 text-green-700' },
    archived: { label: t('status.archived'), class: 'bg-yellow-100 text-yellow-700' }
  }
  const meta = map[status] || { label: status || t('content.status_unknown'), class: 'bg-gray-100 text-gray-700' }
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
