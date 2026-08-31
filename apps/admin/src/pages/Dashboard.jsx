import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext.jsx'
import { fetchDashboardActivities, fetchDashboardSummary, fetchApiStats } from '../lib/api/dashboard.js'
import { fetchTenantLimits } from '../lib/api/subscriptions.js'
import { tenantAPI } from '../lib/tenantAPI.js'
import RecentActivities from '../components/RecentActivities.jsx'

const ACTIVITY_PAGE_SIZE = 10

const activityTypeConfig = {
  content: {
    labelKey: 'dashboard.activity_type_content',
    pluralKey: 'nav.contents',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    iconClass: 'bg-emerald-500 text-white',
  },
  media: {
    labelKey: 'nav.media',
    pluralKey: 'nav.media',
    badgeClass: 'bg-sky-100 text-sky-700',
    iconClass: 'bg-sky-500 text-white',
  },
  form: {
    labelKey: 'dashboard.activity_type_form',
    pluralKey: 'nav.forms',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    iconClass: 'bg-indigo-500 text-white',
  },
}

const statusKeyDictionary = {
  content: {
    draft: 'status.draft',
    published: 'status.published',
    scheduled: 'status.scheduled',
    archived: 'status.archived',
  },
  media: {
    active: 'status.active',
    archived: 'status.archived',
  },
  form: {
    draft: 'status.draft',
    published: 'status.published',
    archived: 'status.archived',
  },
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

export default function Dashboard() {
  const { t, i18n } = useTranslation()
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

  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
  const gigabyteFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    [i18n.language]
  )
  const datetimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.language]
  )

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
    const statusKey = statusKeyDictionary[type]?.[status]
    return statusKey ? t(statusKey) : status
  }

  function getTypeMeta(type) {
    const config = activityTypeConfig[type]
    if (!config) {
      return {
        label: type,
        plural: type,
        symbol: type?.charAt(0)?.toLocaleUpperCase(i18n.language) || '?',
        badgeClass: 'bg-gray-100 text-gray-600',
        iconClass: 'bg-gray-200 text-gray-700',
      }
    }

    const label = t(config.labelKey)
    return {
      label,
      plural: t(config.pluralKey),
      symbol: label.charAt(0).toLocaleUpperCase(i18n.language),
      badgeClass: config.badgeClass,
      iconClass: config.iconClass,
    }
  }

  function buildActivityDetails(item) {
    const { entityType, metadata = {} } = item
    const details = []

    const actorName = item.actor?.name || t('dashboard.system_actor')
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

  const activityTypeOptions = useMemo(() => {
    const baseTypes = activityAvailableTypes.length
      ? Array.from(new Set(activityAvailableTypes))
      : Object.keys(activityTypeConfig)

    const options = baseTypes.map((value) => {
      const config = activityTypeConfig[value]
      return {
        value,
        label: config ? t(config.pluralKey || config.labelKey) : value,
      }
    })

    return [{ value: 'all', label: t('dashboard.filter_all') }, ...options]
  }, [activityAvailableTypes, t])

  const summaryTotals = summary?.totals || {}
  const mediaTotals = summaryTotals.media || {}

  // Feature flags
  const featureFlags = tenantSettings?.features || {}
  const showLimits = Boolean(featureFlags.limitShow)
  const showStatistics = Boolean(featureFlags.statisticShow)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.dashboard')}</h1>
        <p className="mt-2 text-gray-600">
          {t('dashboard.welcome', {
            name: user?.name || user?.firstName || t('dashboard.guest'),
          })}
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
                {t('dashboard.no_tenant_title')}
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  {t('dashboard.no_tenant_description')}
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
                    {t('nav.create_tenant')}
                  </a>
                  <a
                    href="/varliklar"
                    className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    {t('dashboard.view_my_tenants')}
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
                  {t('dashboard.badge_users')}
                </div>
              </div>
              <div className="ml-5 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {t('dashboard.total_users')}
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
                  {t('dashboard.badge_contents')}
                </div>
              </div>
              <div className="ml-5 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {t('dashboard.total_contents')}
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
                  {t('dashboard.badge_media')}
                </div>
              </div>
              <div className="ml-5 flex-1">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  {t('dashboard.media_files')}
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900">
                  {summaryLoading
                    ? '…'
                    : t('dashboard.media_file_count', { value: formatNumber(mediaTotals.count) })
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
                  {t('dashboard.badge_api')}
                </div>
              </div>
              <div className="ml-5 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {t('dashboard.api_calls')}
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {apiStatsLoading ? '…' : (
                      apiStats?.enabled ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">{t('dashboard.api_four_hour')}:</span>
                            <span className="font-semibold">{formatNumber(apiStats.fourHour ?? 0)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">{t('dashboard.api_daily')}:</span>
                            <span className="font-semibold">{formatNumber(apiStats.daily ?? apiStats.today ?? 0)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">{t('dashboard.api_weekly')}:</span>
                            <span className="font-semibold text-blue-600">{formatNumber(apiStats.weekly)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">{t('dashboard.api_monthly')}:</span>
                            <span className="font-semibold text-purple-600">{formatNumber(apiStats.monthly)}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">{t('status.disabled')}</span>
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
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('dashboard.limits_usage')}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Subscription Plan Card - Clickable */}
            {tenantLimits && (
              <button
                onClick={() => window.location.assign('/faturalandirma')}
                className="card text-left hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 hover:border-blue-300"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <dt className="text-sm font-medium text-gray-600">{t('dashboard.current_plan')}</dt>
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
                      <p className="text-sm text-gray-600 font-medium">
                        {t('dashboard.price_per_month', { price: tenantLimits.plan.price })}
                      </p>
                    ) : (
                      <p className="text-sm text-green-600 font-medium">{t('dashboard.free_plan')}</p>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-blue-200">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>{t('dashboard.change_plan')}</span>
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
                  <dt className="text-sm font-medium text-gray-500">{t('dashboard.storage')}</dt>
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
                          t('dashboard.unlimited')
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
                        t('dashboard.unlimited_storage')
                      ) : (
                        t('dashboard.storage_remaining', {
                          value: formatGigabytes(tenantLimits.usage.storage.remaining),
                        })
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">{t('dashboard.load_failed')}</div>
                )}
              </div>
            </div>

            {/* API Requests Limit Card */}
            <div className="card">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <dt className="text-sm font-medium text-gray-500">{t('dashboard.api_calls')}</dt>
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
                          t('dashboard.unlimited')
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
                        t('dashboard.unlimited_requests')
                      ) : (
                        t('dashboard.requests_remaining', {
                          value: formatNumber(tenantLimits.usage.requests.remaining),
                        })
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">{t('dashboard.load_failed')}</div>
                )}
              </div>
            </div>

            {/* Users Limit Card */}
            <div className="card">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <dt className="text-sm font-medium text-gray-500">{t('nav.users')}</dt>
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
                          t('dashboard.unlimited')
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
                        t('dashboard.unlimited_users')
                      ) : (
                        t('dashboard.user_slots_remaining', {
                          value: tenantLimits.usage.users.remaining,
                        })
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">{t('dashboard.load_failed')}</div>
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
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('dashboard.statistics')}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-sm font-semibold text-white">
                    {t('dashboard.badge_users')}
                  </div>
                </div>
                <div className="ml-5 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {t('dashboard.total_users')}
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
                    {t('dashboard.badge_contents')}
                  </div>
                </div>
                <div className="ml-5 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {t('dashboard.total_contents')}
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
                    {t('dashboard.badge_media')}
                  </div>
                </div>
                <div className="ml-5 flex-1">
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {t('dashboard.media_files')}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-900">
                    {summaryLoading
                      ? '…'
                      : t('dashboard.media_file_count', { value: formatNumber(mediaTotals.count) })
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
                    {t('dashboard.badge_api')}
                  </div>
                </div>
                <div className="ml-5 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {t('dashboard.api_calls')}
                    </dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {apiStatsLoading ? '…' : (
                        apiStats?.enabled ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">{t('dashboard.api_four_hour')}:</span>
                              <span className="font-semibold">{formatNumber(apiStats.fourHour ?? 0)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">{t('dashboard.api_daily')}:</span>
                              <span className="font-semibold">{formatNumber(apiStats.daily ?? apiStats.today ?? 0)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">{t('dashboard.api_weekly')}:</span>
                              <span className="font-semibold text-blue-600">{formatNumber(apiStats.weekly)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">{t('dashboard.api_monthly')}:</span>
                              <span className="font-semibold text-purple-600">{formatNumber(apiStats.monthly)}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">{t('status.disabled')}</span>
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
              <h3 className="text-lg font-medium text-gray-900">{t('dashboard.recent_activities')}</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex flex-col text-sm text-gray-500">
                  <span className="font-medium text-gray-600">{t('common.type')}</span>
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
                    <span className="font-medium text-gray-600">{t('dashboard.activity_scope')}</span>
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
                      <option value="tenant">{t('dashboard.activity_scope_tenant')}</option>
                      <option value="self">{t('dashboard.activity_scope_self')}</option>
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
                  {t('dashboard.no_activities')}
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
                                  {item.title || t('dashboard.untitled_record')}
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
                        {activitiesLoadingMore ? t('common.loading') : t('common.show_more')}
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

    </div>
  )
}
