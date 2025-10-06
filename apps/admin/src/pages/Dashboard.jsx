import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { fetchDashboardActivities, fetchDashboardSummary } from '../lib/api/dashboard.js'

const ACTIVITY_PAGE_SIZE = 10

const numberFormatter = new Intl.NumberFormat('tr-TR')
const gigabyteFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
const datetimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const activityTypeConfig = {
  content: {
    label: 'İçerik',
    plural: 'İçerikler',
    symbol: 'İ',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    iconClass: 'bg-emerald-500 text-white',
  },
  media: {
    label: 'Medya',
    plural: 'Medya',
    symbol: 'M',
    badgeClass: 'bg-sky-100 text-sky-700',
    iconClass: 'bg-sky-500 text-white',
  },
  form: {
    label: 'Form',
    plural: 'Formlar',
    symbol: 'F',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    iconClass: 'bg-indigo-500 text-white',
  },
}

const statusDictionary = {
  content: {
    draft: 'Taslak',
    published: 'Yayınlandı',
    scheduled: 'Planlandı',
    archived: 'Arşivlendi',
  },
  media: {
    active: 'Aktif',
    archived: 'Arşivlendi',
  },
  form: {
    draft: 'Taslak',
    published: 'Yayında',
    archived: 'Arşivlendi',
  },
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '—'
  }
  return numberFormatter.format(value)
}

function formatGigabytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 GB'
  }
  const gigabytes = bytes / (1024 ** 3)
  const precision = gigabytes >= 10 ? 1 : 2
  return `${gigabyteFormatter.format(Number(gigabytes.toFixed(precision)))} GB`
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const precision = value >= 10 ? 1 : 2
  return `${Number(value.toFixed(precision))} ${units[unitIndex]}`
}

function formatTimestamp(isoString) {
  if (!isoString) {
    return ''
  }
  try {
    return datetimeFormatter.format(new Date(isoString))
  } catch (error) {
    return isoString
  }
}

function getStatusLabel(type, status) {
  if (!status) {
    return null
  }
  return statusDictionary[type]?.[status] || status
}

function getTypeMeta(type) {
  return activityTypeConfig[type] || {
    label: type,
    plural: type,
    symbol: type?.charAt(0)?.toUpperCase() || '?',
    badgeClass: 'bg-gray-100 text-gray-600',
    iconClass: 'bg-gray-200 text-gray-700',
  }
}

function buildActivityDetails(item) {
  const { entityType, metadata = {} } = item
  const details = []

  const actorName = item.actor?.name || 'Sistem'
  details.push(actorName)

  const statusLabel = getStatusLabel(entityType, metadata.status)
  if (statusLabel) {
    details.push(statusLabel)
  }

  if (entityType === 'media' && Number.isFinite(metadata.size)) {
    const readableSize = formatFileSize(metadata.size)
    if (readableSize) {
      details.push(readableSize)
    }
  }

  if (metadata.slug && entityType !== 'media') {
    details.push(`/${metadata.slug}`)
  }

  return details.join(' • ')
}

export default function Dashboard() {
  const { user, role } = useAuth()
  const isOwner = role === 'owner'

  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const [activityItems, setActivityItems] = useState([])
  const [activityAvailableTypes, setActivityAvailableTypes] = useState([])
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [activitiesLoadingMore, setActivitiesLoadingMore] = useState(false)

  const [activityFilters, setActivityFilters] = useState(() => ({
    type: 'all',
    scope: isOwner ? 'tenant' : 'self',
  }))

  useEffect(() => {
    setActivityFilters((prev) => {
      if (isOwner && prev.scope !== 'tenant') {
        return { ...prev, scope: 'tenant' }
      }
      if (!isOwner && prev.scope !== 'self') {
        return { ...prev, scope: 'self' }
      }
      return prev
    })
  }, [isOwner])

  useEffect(() => {
    let cancelled = false

    async function loadSummary() {
      setSummaryLoading(true)
      try {
        const data = await fetchDashboardSummary()
        if (!cancelled) {
          setSummary(data)
        }
      } catch (error) {
        console.error('Kontrol paneli özeti alınamadı:', error)
        if (!cancelled) {
          setSummary(null)
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false)
        }
      }
    }

    loadSummary()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadActivities() {
      setActivitiesLoading(true)
      try {
        const typeParam = activityFilters.type === 'all' ? undefined : activityFilters.type
        const scopeParam = isOwner ? activityFilters.scope : 'self'

        const data = await fetchDashboardActivities({
          type: typeParam,
          scope: scopeParam,
          limit: ACTIVITY_PAGE_SIZE,
          offset: 0,
        })

        if (!cancelled) {
          setActivityItems(Array.isArray(data?.items) ? data.items : [])
          setActivityHasMore(Boolean(data?.pagination?.hasMore))
          if (Array.isArray(data?.availableTypes)) {
            setActivityAvailableTypes(data.availableTypes)
          }
        }
      } catch (error) {
        console.error('Son aktiviteler yüklenemedi:', error)
        if (!cancelled) {
          setActivityItems([])
          setActivityHasMore(false)
        }
      } finally {
        if (!cancelled) {
          setActivitiesLoading(false)
        }
      }
    }

    loadActivities()

    return () => {
      cancelled = true
    }
  }, [activityFilters.type, activityFilters.scope, isOwner])

  const handleLoadMoreActivities = async () => {
    if (activitiesLoadingMore || !activityHasMore) {
      return
    }

    setActivitiesLoadingMore(true)
    try {
      const typeParam = activityFilters.type === 'all' ? undefined : activityFilters.type
      const scopeParam = isOwner ? activityFilters.scope : 'self'

      const data = await fetchDashboardActivities({
        type: typeParam,
        scope: scopeParam,
        limit: ACTIVITY_PAGE_SIZE,
        offset: activityItems.length,
      })

      setActivityItems((prev) => [
        ...prev,
        ...((Array.isArray(data?.items) ? data.items : [])),
      ])
      setActivityHasMore(Boolean(data?.pagination?.hasMore))
      if (Array.isArray(data?.availableTypes) && data.availableTypes.length) {
        setActivityAvailableTypes(data.availableTypes)
      }
    } catch (error) {
      console.error('Son aktiviteler devamı alınamadı:', error)
    } finally {
      setActivitiesLoadingMore(false)
    }
  }

  const activityTypeOptions = useMemo(() => {
    const baseTypes = activityAvailableTypes.length
      ? Array.from(new Set(activityAvailableTypes))
      : Object.keys(activityTypeConfig)

    const options = baseTypes.map((value) => ({
      value,
      label: activityTypeConfig[value]?.plural || activityTypeConfig[value]?.label || value,
    }))

    return [{ value: 'all', label: 'Tümü' }, ...options]
  }, [activityAvailableTypes])

  const summaryTotals = summary?.totals || {}
  const mediaTotals = summaryTotals.media || {}

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Kontrol Paneli</h1>
        <p className="mt-2 text-gray-600">
          Hoş geldiniz, {user?.name || user?.firstName || 'misafir'}! Burada varlık performansınızın genel bir görünümünü bulabilirsiniz.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-sm font-semibold text-white">
                  U
                </div>
              </div>
              <div className="ml-5 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Toplam Kullanıcı
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {summaryLoading ? '…' : formatNumber(summaryTotals.users)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500 text-sm font-semibold text-white">
                  İ
                </div>
              </div>
              <div className="ml-5 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Toplam İçerik
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {summaryLoading ? '…' : formatNumber(summaryTotals.contents)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500 text-sm font-semibold text-white">
                  M
                </div>
              </div>
              <div className="ml-5 flex-1">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Medya Dosyaları
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900">
                  {summaryLoading
                    ? '…'
                    : `${formatNumber(mediaTotals.count)} dosya`
                  }
                </dd>
                <p className="mt-1 text-sm text-gray-500">
                  {summaryLoading ? '…' : formatGigabytes(mediaTotals.totalSize)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500 text-sm font-semibold text-white">
                  A
                </div>
              </div>
              <div className="ml-5 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    API Çağrıları
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">—</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="card">
          <div className="px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-medium text-gray-900">Son Aktiviteler</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex flex-col text-sm text-gray-500">
                  <span className="font-medium text-gray-600">Tür</span>
                  <select
                    className="mt-1 block w-48 rounded-md border border-gray-300 bg-white py-1.5 pl-3 pr-10 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={activityFilters.type}
                    onChange={(event) => {
                      setActivityFilters((prev) => ({
                        ...prev,
                        type: event.target.value,
                      }))
                    }}
                  >
                    {activityTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {isOwner && (
                  <label className="flex flex-col text-sm text-gray-500">
                    <span className="font-medium text-gray-600">Görünüm</span>
                    <select
                      className="mt-1 block w-48 rounded-md border border-gray-300 bg-white py-1.5 pl-3 pr-10 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={activityFilters.scope}
                      onChange={(event) => {
                        setActivityFilters((prev) => ({
                          ...prev,
                          scope: event.target.value === 'tenant' ? 'tenant' : 'self',
                        }))
                      }}
                    >
                      <option value="tenant">Tüm ekip</option>
                      <option value="self">Sadece ben</option>
                    </select>
                  </label>
                )}
              </div>
            </div>

            <div className="mt-5">
              {activitiesLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="animate-pulse rounded-md bg-gray-100 px-4 py-3" />
                  ))}
                </div>
              ) : activityItems.length === 0 ? (
                <div className="text-sm text-gray-500">
                  Henüz aktivite bulunmuyor.
                </div>
              ) : (
                <div>
                  <ul className="divide-y divide-gray-100">
                    {activityItems.map((item) => {
                      const meta = getTypeMeta(item.entityType)
                      const details = buildActivityDetails(item)
                      return (
                        <li key={item.id} className="py-4 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${meta.iconClass}`}>
                              {meta.symbol}
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900">
                                  {item.title || 'İsimsiz kayıt'}
                                </p>
                                <span className="text-xs text-gray-500">
                                  {formatTimestamp(item.timestamp)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${meta.badgeClass}`}>
                                  {meta.label}
                                </span>
                                {details && <span>{details}</span>}
                              </div>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {activityHasMore && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={handleLoadMoreActivities}
                        className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        {activitiesLoadingMore ? 'Yükleniyor…' : 'Daha fazla göster'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
