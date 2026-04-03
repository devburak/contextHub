import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { fetchDashboardActivities, fetchDashboardSummary, fetchApiStats } from '../lib/api/dashboard.js'
import { fetchTenantLimits, updateTenantSubscription } from '../lib/api/subscriptions.js'
import { tenantAPI } from '../lib/tenantAPI.js'
import RecentActivities from '../components/RecentActivities.jsx'
import SubscriptionPlanSelector from '../components/SubscriptionPlanSelector.jsx'
import i18n from '../i18n.js'

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
  const { user, role, memberships, activeTenantId } = useAuth()
  const isOwner = role === 'owner'
  const hasTenants = memberships && memberships.length > 0

  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const [apiStats, setApiStats] = useState(null)
  const [apiStatsLoading, setApiStatsLoading] = useState(false)

  const [tenantLimits, setTenantLimits] = useState(null)
  const [tenantLimitsLoading, setTenantLimitsLoading] = useState(false)

  const [tenantSettings, setTenantSettings] = useState(null)
  const [tenantSettingsLoading, setTenantSettingsLoading] = useState(false)

  const [activityItems, setActivityItems] = useState([])
  const [activityAvailableTypes, setActivityAvailableTypes] = useState([])
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [activitiesLoadingMore, setActivitiesLoadingMore] = useState(false)

  const [activityFilters, setActivityFilters] = useState(() => ({
    type: 'all',
    scope: isOwner ? 'tenant' : 'self',
  }))

  const [showPlanModal, setShowPlanModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [planUpdateLoading, setPlanUpdateLoading] = useState(false)
  const [planUpdateError, setPlanUpdateError] = useState(null)

  // Set default language to Turkish if not set
  useEffect(() => {
    if (!localStorage.getItem('language')) {
      localStorage.setItem('language', 'tr')
      i18n.changeLanguage('tr')
    }
  }, [])

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
      if (!hasTenants) {
        return
      }
      
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
  }, [activeTenantId, hasTenants])

  useEffect(() => {
    let cancelled = false

    async function loadApiStats() {
      if (!hasTenants) {
        return
      }
      
      setApiStatsLoading(true)
      try {
        const data = await fetchApiStats()
        if (!cancelled) {
          setApiStats(data)
        }
      } catch (error) {
        console.error('API istatistikleri alınamadı:', error)
        if (!cancelled) {
          setApiStats(null)
        }
      } finally {
        if (!cancelled) {
          setApiStatsLoading(false)
        }
      }
    }

    loadApiStats()

    return () => {
      cancelled = true
    }
  }, [activeTenantId, hasTenants])

  useEffect(() => {
    let cancelled = false

    async function loadTenantLimits() {
      if (!hasTenants) {
        return
      }
      
      setTenantLimitsLoading(true)
      try {
        const data = await fetchTenantLimits()
        if (!cancelled) {
          setTenantLimits(data)
        }
      } catch (error) {
        console.error('Tenant limitleri alınamadı:', error)
        if (!cancelled) {
          setTenantLimits(null)
        }
      } finally {
        if (!cancelled) {
          setTenantLimitsLoading(false)
        }
      }
    }

    loadTenantLimits()

    return () => {
      cancelled = true
    }
  }, [activeTenantId, hasTenants])

  // Fetch tenant settings for feature flags
  useEffect(() => {
    let cancelled = false

    async function loadTenantSettings() {
      if (!hasTenants) {
        return
      }
      
      setTenantSettingsLoading(true)
      try {
        const data = await tenantAPI.getSettings()
        if (!cancelled) {
          setTenantSettings(data)
        }
      } catch (error) {
        console.error('Tenant ayarları alınamadı:', error)
        if (!cancelled) {
          setTenantSettings(null)
        }
      } finally {
        if (!cancelled) {
          setTenantSettingsLoading(false)
        }
      }
    }

    loadTenantSettings()

    return () => {
      cancelled = true
    }
  }, [activeTenantId, hasTenants])

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

  const handlePlanChange = async () => {
    if (!selectedPlan || !activeTenantId) return

    setPlanUpdateLoading(true)
    setPlanUpdateError(null)

    try {
      await updateTenantSubscription(activeTenantId, { planSlug: selectedPlan })

      // Refresh tenant limits
      const limitsData = await fetchTenantLimits()
      setTenantLimits(limitsData)

      setShowPlanModal(false)
      setSelectedPlan(null)
    } catch (error) {
      console.error('Plan update failed:', error)
      setPlanUpdateError(error?.response?.data?.message || 'Plan güncellenemedi')
    } finally {
      setPlanUpdateLoading(false)
    }
  }

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

  // Feature flags
  const featureFlags = tenantSettings?.features || {}
  const showLimits = Boolean(featureFlags.limitShow)
  const showStatistics = Boolean(featureFlags.statisticShow)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Kontrol Paneli</h1>
        <p className="mt-2 text-gray-600">
          Hoş geldiniz, {user?.name || user?.firstName || 'misafir'}! Burada varlık performansınızın genel bir görünümünü bulabilirsiniz.
        </p>
      </div>

      {/* Tenant yoksa uyarı mesajı */}
      {!hasTenants && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Henüz Bir Varlığınız Yok
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  ContextHub'ı kullanmaya başlamak için bir varlık (organizasyon) oluşturmanız veya mevcut bir varlığa katılmanız gerekmektedir.
                </p>
              </div>
              <div className="mt-4">
                <div className="flex gap-3">
                  <a
                    href="/varliklar"
                    className="inline-flex items-center rounded-md bg-yellow-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-600"
                  >
                    <svg className="-ml-0.5 mr-1.5 h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Yeni Varlık Oluştur
                  </a>
                  <a
                    href="/varliklar"
                    className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    Varlıklarımı Görüntüle
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <dd className="text-lg font-semibold text-gray-900">
                    {apiStatsLoading ? '…' : (
                      apiStats?.enabled ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">4 Saat:</span>
                            <span className="font-semibold">{formatNumber(apiStats.fourHour ?? 0)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Gunluk:</span>
                            <span className="font-semibold">{formatNumber(apiStats.daily ?? apiStats.today ?? 0)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Haftalik:</span>
                            <span className="font-semibold text-blue-600">{formatNumber(apiStats.weekly)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Aylik:</span>
                            <span className="font-semibold text-purple-600">{formatNumber(apiStats.monthly)}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Devre dışı</span>
                      )
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Limit & Usage Section */}
      {hasTenants && showLimits && (
        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Limit & Kullanım</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Subscription Plan Card - Clickable */}
            {tenantLimits && (
              <button
                onClick={() => setShowPlanModal(true)}
                className="card text-left hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 hover:border-blue-300"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <dt className="text-sm font-medium text-gray-600">Mevcut Plan</dt>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      {tenantLimits.plan?.name || 'Free'}
                    </div>
                    {tenantLimits.plan?.price > 0 ? (
                      <p className="text-sm text-gray-600 font-medium">${tenantLimits.plan.price}/ay</p>
                    ) : (
                      <p className="text-sm text-green-600 font-medium">Ücretsiz</p>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-blue-200">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>Planı Değiştir</span>
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Storage Limit Card */}
            <div className="card">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <dt className="text-sm font-medium text-gray-500">Depolama</dt>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500 text-xs font-semibold text-white">
                    💾
                  </div>
                </div>
                {tenantLimitsLoading ? (
                  <div className="text-center text-gray-400">…</div>
                ) : tenantLimits ? (
                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {formatGigabytes(tenantLimits.usage.storage.current)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {tenantLimits.usage.storage.isUnlimited ? (
                          'Sınırsız'
                        ) : (
                          `/ ${formatGigabytes(tenantLimits.usage.storage.limit)}`
                        )}
                      </span>
                    </div>
                    {!tenantLimits.usage.storage.isUnlimited && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            tenantLimits.usage.storage.percentage > 90 ? 'bg-red-500' :
                            tenantLimits.usage.storage.percentage > 75 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, tenantLimits.usage.storage.percentage)}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      {tenantLimits.usage.storage.isUnlimited ? (
                        'Sınırsız depolama'
                      ) : (
                        `${formatGigabytes(tenantLimits.usage.storage.remaining)} kaldı`
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">Yüklenemedi</div>
                )}
              </div>
            </div>

            {/* API Requests Limit Card */}
            <div className="card">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <dt className="text-sm font-medium text-gray-500">API Çağrıları</dt>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500 text-xs font-semibold text-white">
                    📊
                  </div>
                </div>
                {tenantLimitsLoading ? (
                  <div className="text-center text-gray-400">…</div>
                ) : tenantLimits ? (
                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {formatNumber(tenantLimits.usage.requests.current)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {tenantLimits.usage.requests.isUnlimited ? (
                          'Sınırsız'
                        ) : (
                          `/ ${formatNumber(tenantLimits.usage.requests.limit)}`
                        )}
                      </span>
                    </div>
                    {!tenantLimits.usage.requests.isUnlimited && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            tenantLimits.usage.requests.percentage > 90 ? 'bg-red-500' :
                            tenantLimits.usage.requests.percentage > 75 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, tenantLimits.usage.requests.percentage)}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      {tenantLimits.usage.requests.isUnlimited ? (
                        'Sınırsız çağrı'
                      ) : (
                        `${formatNumber(tenantLimits.usage.requests.remaining)} kaldı (Bu ay)`
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">Yüklenemedi</div>
                )}
              </div>
            </div>

            {/* Users Limit Card */}
            <div className="card">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <dt className="text-sm font-medium text-gray-500">Kullanıcılar</dt>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 text-xs font-semibold text-white">
                    👥
                  </div>
                </div>
                {tenantLimitsLoading ? (
                  <div className="text-center text-gray-400">…</div>
                ) : tenantLimits ? (
                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {tenantLimits.usage.users.current}
                      </span>
                      <span className="text-sm text-gray-500">
                        {tenantLimits.usage.users.isUnlimited ? (
                          'Sınırsız'
                        ) : (
                          `/ ${tenantLimits.usage.users.limit}`
                        )}
                      </span>
                    </div>
                    {!tenantLimits.usage.users.isUnlimited && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            tenantLimits.usage.users.percentage > 90 ? 'bg-red-500' :
                            tenantLimits.usage.users.percentage > 75 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, tenantLimits.usage.users.percentage)}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      {tenantLimits.usage.users.isUnlimited ? (
                        'Sınırsız kullanıcı'
                      ) : (
                        `${tenantLimits.usage.users.remaining} slot kaldı`
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">Yüklenemedi</div>
                )}
              </div>
            </div>

            {/* Current Plan Card
            <div className="card">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <dt className="text-sm font-medium text-gray-500">Paket</dt>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-xs font-semibold text-white">
                    ⭐
                  </div>
                </div>
                {tenantLimitsLoading ? (
                  <div className="text-center text-gray-400">…</div>
                ) : tenantLimits ? (
                  <div>
                    <div className="mb-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {tenantLimits.plan.name}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-lg font-semibold text-emerald-600">
                        ${tenantLimits.plan.price}
                      </span>
                      <span className="text-sm text-gray-500">/ay</span>
                    </div>
                    {tenantLimits.plan.billingType === 'usage-based' && (
                      <p className="text-xs text-gray-500">
                        Kullandığınız kadar ödeyin
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">Yüklenemedi</div>
                )}
              </div>
            </div> */}
          </div>
        </div>
      )}

      {/* Statistics Section */}
      {showStatistics && (
        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900 mb-4">İstatistikler</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-sm font-semibold text-white">
                    K
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
                    <dd className="text-lg font-semibold text-gray-900">
                      {apiStatsLoading ? '…' : (
                        apiStats?.enabled ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">4 Saat:</span>
                              <span className="font-semibold">{formatNumber(apiStats.fourHour ?? 0)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">Gunluk:</span>
                              <span className="font-semibold">{formatNumber(apiStats.daily ?? apiStats.today ?? 0)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">Haftalik:</span>
                              <span className="font-semibold text-blue-600">{formatNumber(apiStats.weekly)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">Aylik:</span>
                              <span className="font-semibold text-purple-600">{formatNumber(apiStats.monthly)}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Devre dışı</span>
                        )
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Recent Activities Section */}
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

      {/* Kullanıcı Aktiviteleri */}
      <div className="mt-8">
        <RecentActivities limit={15} activeTenantId={activeTenantId} />
      </div>

      {/* Plan Change Modal */}
      {showPlanModal && tenantLimits && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={() => {
                setShowPlanModal(false)
                setSelectedPlan(null)
                setPlanUpdateError(null)
              }}
            ></div>

            <div className="relative w-full max-w-6xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
              <div className="bg-white px-6 py-3 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">Abonelik Planını Değiştir</h3>
                <p className="mt-1 text-sm text-gray-600">
                  İhtiyaçlarınıza uygun planı seçin. Plan değişiklikleri anında etkinleşir.
                </p>
              </div>

              <div className="px-6 py-3">
                {planUpdateError && (
                  <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-4">
                    <p className="text-sm text-red-800">{planUpdateError}</p>
                  </div>
                )}

                <SubscriptionPlanSelector
                  selectedPlan={selectedPlan || tenantLimits.plan?.slug}
                  onSelectPlan={setSelectedPlan}
                  currentPlan={tenantLimits.plan?.slug}
                  showPricing={true}
                  compact={false}
                />
              </div>

              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowPlanModal(false)
                    setSelectedPlan(null)
                    setPlanUpdateError(null)
                  }}
                  disabled={planUpdateLoading}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handlePlanChange}
                  disabled={planUpdateLoading || !selectedPlan || selectedPlan === tenantLimits.plan?.slug}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {planUpdateLoading ? 'Güncelleniyor...' : 'Planı Değiştir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
