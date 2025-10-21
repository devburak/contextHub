import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { fetchTenantLimits, updateTenantSubscription } from '../../lib/api/subscriptions.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import SubscriptionPlanSelector from '../../components/SubscriptionPlanSelector.jsx'
import ApiTokenManager from '../../components/ApiTokenManager.jsx'

const EMPTY_STATE = {
  smtp: {
    enabled: false,
    host: '',
    port: '',
    secure: true,
    username: '',
    fromName: '',
    fromEmail: '',
    hasPassword: false,
    password: ''
  },
  webhook: {
    enabled: false,
    url: '',
    hasSecret: false,
    secret: ''
  },
  branding: {
    siteName: '',
    logoUrl: '',
    primaryColor: '',
    secondaryColor: '',
    description: ''
  },
  limits: {
    entries: '',
    media: '',
    users: '',
    apiCalls: '',
    emailPerMonth: '',
    custom: {}
  },
  features: {},
  metadata: {}
}

const FIELD_INPUT_CLASS = 'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
const FIELD_INPUT_WITH_MARGIN_CLASS = `mt-1 ${FIELD_INPUT_CLASS}`

const toStringValue = (value) => {
  if (value === undefined || value === null) {
    return ''
  }
  return String(value)
}

const sanitizeNumberInput = (value) => {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const mergeWithDefaults = (settings) => {
  if (!settings) {
    return JSON.parse(JSON.stringify(EMPTY_STATE))
  }

  return {
    smtp: {
      ...EMPTY_STATE.smtp,
      enabled: Boolean(settings.smtp?.enabled),
      host: settings.smtp?.host ?? EMPTY_STATE.smtp.host,
      port: toStringValue(settings.smtp?.port),
      secure: settings.smtp?.secure ?? EMPTY_STATE.smtp.secure,
      username: settings.smtp?.username ?? EMPTY_STATE.smtp.username,
      fromName: settings.smtp?.fromName ?? EMPTY_STATE.smtp.fromName,
      fromEmail: settings.smtp?.fromEmail ?? EMPTY_STATE.smtp.fromEmail,
      hasPassword: Boolean(settings.smtp?.hasPassword),
      password: ''
    },
    webhook: {
      ...EMPTY_STATE.webhook,
      enabled: Boolean(settings.webhook?.enabled),
      url: settings.webhook?.url ?? EMPTY_STATE.webhook.url,
      hasSecret: Boolean(settings.webhook?.hasSecret),
      secret: ''
    },
    branding: {
      ...EMPTY_STATE.branding,
      siteName: settings.branding?.siteName ?? EMPTY_STATE.branding.siteName,
      logoUrl: settings.branding?.logoUrl ?? EMPTY_STATE.branding.logoUrl,
      primaryColor: settings.branding?.primaryColor ?? EMPTY_STATE.branding.primaryColor,
      secondaryColor: settings.branding?.secondaryColor ?? EMPTY_STATE.branding.secondaryColor,
      description: settings.branding?.description ?? EMPTY_STATE.branding.description
    },
    limits: {
      entries: toStringValue(settings.limits?.entries),
      media: toStringValue(settings.limits?.media),
      users: toStringValue(settings.limits?.users),
      apiCalls: toStringValue(settings.limits?.apiCalls),
      emailPerMonth: toStringValue(settings.limits?.emailPerMonth),
      custom: Object.fromEntries(
        Object.entries(settings.limits?.custom || {}).map(([key, value]) => [key, toStringValue(value)])
      )
    },
    features: { ...(settings.features || {}) },
    metadata: settings.metadata || {}
  }
}

const buildPayload = (state, secretFlags, metadataText) => {
  let metadata = {}
  if (metadataText.trim().length) {
    try {
      metadata = JSON.parse(metadataText)
    } catch (error) {
      throw new Error('Metadata JSON formatı geçersiz')
    }
  }

  const payload = {
    smtp: {
      enabled: state.smtp.enabled,
      host: state.smtp.host?.trim() ?? '',
      port: sanitizeNumberInput(state.smtp.port),
      secure: state.smtp.secure,
      username: state.smtp.username?.trim() ?? '',
      fromName: state.smtp.fromName?.trim() ?? '',
      fromEmail: state.smtp.fromEmail?.trim() ?? ''
    },
    webhook: {
      enabled: state.webhook.enabled,
      url: state.webhook.url?.trim() ?? ''
    },
    branding: {
      siteName: state.branding.siteName?.trim() ?? '',
      logoUrl: state.branding.logoUrl?.trim() ?? '',
      primaryColor: state.branding.primaryColor?.trim() ?? '',
      secondaryColor: state.branding.secondaryColor?.trim() ?? '',
      description: state.branding.description?.trim() ?? ''
    },
    limits: {
      entries: sanitizeNumberInput(state.limits.entries),
      media: sanitizeNumberInput(state.limits.media),
      users: sanitizeNumberInput(state.limits.users),
      apiCalls: sanitizeNumberInput(state.limits.apiCalls),
      emailPerMonth: sanitizeNumberInput(state.limits.emailPerMonth),
      custom: Object.fromEntries(
        Object.entries(state.limits.custom || {}).map(([key, value]) => [key, sanitizeNumberInput(value)])
      )
    },
    features: Object.fromEntries(
      Object.entries(state.features || {}).map(([key, value]) => [key, Boolean(value)])
    ),
    metadata
  }

  if (secretFlags.smtpPassword) {
    payload.smtp.password = null
  } else if (state.smtp.password) {
    payload.smtp.password = state.smtp.password
  }

  if (secretFlags.webhookSecret) {
    payload.webhook.secret = null
  } else if (state.webhook.secret) {
    payload.webhook.secret = state.webhook.secret
  }

  return payload
}

export default function TenantSettings() {
  const queryClient = useQueryClient()
  const { activeMembership } = useAuth()

  const settingsQuery = useQuery({
    queryKey: ['tenants', 'settings'],
    queryFn: tenantAPI.getSettings
  })

  // Fetch current tenant limits and plan
  const limitsQuery = useQuery({
    queryKey: ['tenant-limits'],
    queryFn: fetchTenantLimits,
    staleTime: 30000, // 30 seconds
  })

  const [formState, setFormState] = useState(JSON.parse(JSON.stringify(EMPTY_STATE)))
  const [metadataText, setMetadataText] = useState('{}')
  const [secretFlags, setSecretFlags] = useState({ smtpPassword: false, webhookSecret: false })
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [featureKeyInput, setFeatureKeyInput] = useState('')
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [showPlanModal, setShowPlanModal] = useState(false)

  useEffect(() => {
    if (settingsQuery.data) {
      const merged = mergeWithDefaults(settingsQuery.data)
      setFormState(merged)
      setMetadataText(JSON.stringify(settingsQuery.data.metadata || {}, null, 2) || '{}')
      setSecretFlags({ smtpPassword: false, webhookSecret: false })
    }
  }, [settingsQuery.data])

  const updateMutation = useMutation({
    mutationFn: tenantAPI.updateSettings,
    onMutate: () => {
      setFeedback({ type: '', message: '' })
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['tenants', 'settings'], settings)
      const merged = mergeWithDefaults(settings)
      setFormState(merged)
      setMetadataText(JSON.stringify(settings.metadata || {}, null, 2) || '{}')
      setSecretFlags({ smtpPassword: false, webhookSecret: false })
      setFeedback({ type: 'success', message: 'Ayarlar başarıyla kaydedildi.' })
    },
    onError: (error) => {
      const apiMessage = error?.response?.data?.message || error?.response?.data?.error
      setFeedback({ type: 'error', message: apiMessage || 'Ayarlar kaydedilirken bir hata oluştu.' })
    }
  })

  const updatePlanMutation = useMutation({
    mutationFn: ({ tenantId, planSlug }) => updateTenantSubscription(tenantId, { planSlug }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-limits'] })
      setShowPlanModal(false)
      setFeedback({ type: 'success', message: 'Abonelik planı başarıyla güncellendi!' })
    },
    onError: (error) => {
      const apiMessage = error?.response?.data?.message || error?.response?.data?.error
      setFeedback({ type: 'error', message: apiMessage || 'Plan güncellenemedi.' })
    }
  })

  const handleInputChange = (section, field) => (event) => {
    const value = event.target.value
    setFormState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }))
  }

  const handleCheckboxChange = (section, field) => (event) => {
    const checked = event.target.checked
    setFormState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: checked
      }
    }))
  }

  const handleSecureChange = (event) => {
    const checked = event.target.checked
    setFormState((prev) => ({
      ...prev,
      smtp: {
        ...prev.smtp,
        secure: checked
      }
    }))
  }

  const handleFeatureToggle = (key) => (event) => {
    const checked = event.target.checked
    setFormState((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: checked
      }
    }))
  }

  const removeFeature = (key) => {
    setFormState((prev) => {
      const nextFeatures = { ...prev.features }
      delete nextFeatures[key]
      return {
        ...prev,
        features: nextFeatures
      }
    })
  }

  const handleAddFeature = () => {
    const trimmed = featureKeyInput.trim()
    if (!trimmed) return
    setFormState((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [trimmed]: true
      }
    }))
    setFeatureKeyInput('')
  }

  const handlePasswordChange = (event) => {
    const value = event.target.value
    setFormState((prev) => ({
      ...prev,
      smtp: {
        ...prev.smtp,
        password: value
      }
    }))
    if (value) {
      setSecretFlags((prev) => ({ ...prev, smtpPassword: false }))
    }
  }

  const handleSecretChange = (event) => {
    const value = event.target.value
    setFormState((prev) => ({
      ...prev,
      webhook: {
        ...prev.webhook,
        secret: value
      }
    }))
    if (value) {
      setSecretFlags((prev) => ({ ...prev, webhookSecret: false }))
    }
  }

  const resetSmtpPassword = () => {
    setSecretFlags((prev) => ({ ...prev, smtpPassword: true }))
    setFormState((prev) => ({
      ...prev,
      smtp: {
        ...prev.smtp,
        password: '',
        hasPassword: false
      }
    }))
  }

  const resetWebhookSecret = () => {
    setSecretFlags((prev) => ({ ...prev, webhookSecret: true }))
    setFormState((prev) => ({
      ...prev,
      webhook: {
        ...prev.webhook,
        secret: '',
        hasSecret: false
      }
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    try {
      const payload = buildPayload(formState, secretFlags, metadataText)
      updateMutation.mutate(payload)
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  const handlePlanChange = () => {
    if (!selectedPlan || !activeMembership?.tenantId) return
    updatePlanMutation.mutate({
      tenantId: activeMembership.tenantId,
      planSlug: selectedPlan
    })
  }

  const currentPlan = limitsQuery.data?.plan?.slug || 'free'

  if (settingsQuery.isLoading) {
    return <div className="text-sm text-gray-500">Ayarlar yükleniyor...</div>
  }

  if (settingsQuery.isError) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">Ayarlar alınırken bir hata oluştu. Lütfen tekrar deneyin.</div>
        <button
          type="button"
          onClick={() => settingsQuery.refetch()}
          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Yeniden dene
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tenant Ayarları</h1>
        <p className="mt-2 text-sm text-gray-600">
          SMTP, webhook, limitler ve özellikler gibi tenant düzeyindeki yapılandırmaları buradan yönetebilirsin.
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {feedback.message && (
          <div
            className={`rounded-md px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {/* Subscription Plan Section */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Abonelik Planı</h2>
            <p className="text-sm text-gray-500">Varlığınızın abonelik planını görüntüleyin ve değiştirin. Plan değişiklikleri limitlerinizi anında günceller.</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {limitsQuery.isLoading ? (
              <div className="text-center text-gray-500 py-4">Plan bilgileri yükleniyor...</div>
            ) : limitsQuery.isError ? (
              <div className="text-center text-red-600 py-4">Plan bilgileri alınamadı.</div>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Mevcut Plan</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{limitsQuery.data?.plan?.name || 'Free'}</p>
                    {limitsQuery.data?.plan?.price > 0 && (
                      <p className="text-sm text-gray-600 mt-1">${limitsQuery.data.plan.price}/ay</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPlanModal(true)}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    Planı Değiştir
                  </button>
                </div>

                {/* Current Usage Stats */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs font-medium text-blue-600 uppercase">Kullanıcılar</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {limitsQuery.data?.usage?.users?.current || 0} / {
                        limitsQuery.data?.usage?.users?.isUnlimited
                          ? '∞'
                          : (limitsQuery.data?.usage?.users?.limit || 0)
                      }
                    </p>
                  </div>

                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-xs font-medium text-purple-600 uppercase">Depolama</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {(limitsQuery.data?.usage?.storage?.current / (1024**3)).toFixed(2)} GB / {
                        limitsQuery.data?.usage?.storage?.isUnlimited
                          ? '∞'
                          : `${(limitsQuery.data?.usage?.storage?.limit / (1024**3)).toFixed(0)} GB`
                      }
                    </p>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                    <p className="text-xs font-medium text-emerald-600 uppercase">API İstekleri</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {(limitsQuery.data?.usage?.requests?.current / 1000).toFixed(1)}K / {
                        limitsQuery.data?.usage?.requests?.isUnlimited
                          ? '∞'
                          : `${(limitsQuery.data?.usage?.requests?.limit / 1000).toFixed(0)}K`
                      }
                    </p>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs font-medium text-amber-600 uppercase">Owners</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {limitsQuery.data?.usage?.owners?.current || 0} / {
                        limitsQuery.data?.usage?.owners?.isUnlimited
                          ? '∞'
                          : (limitsQuery.data?.usage?.owners?.limit || 0)
                      }
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* API Token Management Section */}
        <ApiTokenManager />

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">SMTP Ayarları</h2>
              <p className="text-sm text-gray-500">Sistem e-postalarını kendi SMTP servisinden göndermek için bu alanı yapılandır.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span>Aktif</span>
              <input
                type="checkbox"
                checked={formState.smtp.enabled}
                onChange={handleCheckboxChange('smtp', 'enabled')}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Sunucu Adresi</label>
              <input
                type="text"
                value={formState.smtp.host}
                onChange={handleInputChange('smtp', 'host')}
                placeholder="smtp.mailprovider.com"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Port</label>
              <input
                type="number"
                min="0"
                value={formState.smtp.port}
                onChange={handleInputChange('smtp', 'port')}
                placeholder="587"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <input
                id="smtp-secure"
                type="checkbox"
                checked={formState.smtp.secure}
                onChange={handleSecureChange}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="smtp-secure" className="text-sm text-gray-700">
                TLS/SSL bağlantısı kullan
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Kullanıcı Adı</label>
              <input
                type="text"
                value={formState.smtp.username}
                onChange={handleInputChange('smtp', 'username')}
                placeholder="smtp-user"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Gönderen Adı</label>
              <input
                type="text"
                value={formState.smtp.fromName}
                onChange={handleInputChange('smtp', 'fromName')}
                placeholder="ContextHub"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Gönderen E-posta</label>
              <input
                type="email"
                value={formState.smtp.fromEmail}
                onChange={handleInputChange('smtp', 'fromEmail')}
                placeholder="no-reply@domain.com"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Parola</label>
              <input
                type="password"
                value={formState.smtp.password}
                onChange={handlePasswordChange}
                placeholder={formState.smtp.hasPassword ? '••••••' : 'Parola girin'}
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {secretFlags.smtpPassword
                    ? 'Kaydedildiğinde parola temizlenecek.'
                    : formState.smtp.hasPassword
                      ? 'Kaydetmediğin sürece mevcut parola korunur.'
                      : 'Parola girilmedi.'}
                </span>
                <button
                  type="button"
                  onClick={resetSmtpPassword}
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  Parolayı temizle
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Webhook Ayarları</h2>
              <p className="text-sm text-gray-500">İçerik değişiklikleri gibi olayları dış sistemlere bildirmek için webhook URL ve gizli anahtarını ayarla.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span>Aktif</span>
              <input
                type="checkbox"
                checked={formState.webhook.enabled}
                onChange={handleCheckboxChange('webhook', 'enabled')}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Webhook URL</label>
              <input
                type="url"
                value={formState.webhook.url}
                onChange={handleInputChange('webhook', 'url')}
                placeholder="https://example.com/webhooks/contexthub"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Gizli Anahtar</label>
              <input
                type="password"
                value={formState.webhook.secret}
                onChange={handleSecretChange}
                placeholder={formState.webhook.hasSecret ? '••••••' : 'Yeni gizli anahtar girin'}
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {secretFlags.webhookSecret
                    ? 'Kaydedildiğinde gizli anahtar temizlenecek.'
                    : formState.webhook.hasSecret
                      ? 'Kaydetmediğin sürece mevcut gizli anahtar korunur.'
                      : 'Gizli anahtar ayarlanmadı.'}
                </span>
                <button
                  type="button"
                  onClick={resetWebhookSecret}
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  Gizli anahtarı temizle
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Marka Bilgileri</h2>
            <p className="text-sm text-gray-500">Panelde ve yayınlanan içeriklerde kullanılacak marka bilgilerini düzenle.</p>
          </div>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Site Adı</label>
              <input
                type="text"
                value={formState.branding.siteName}
                onChange={handleInputChange('branding', 'siteName')}
                placeholder="Ör. Firma Portalı"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Logo URL</label>
              <input
                type="url"
                value={formState.branding.logoUrl}
                onChange={handleInputChange('branding', 'logoUrl')}
                placeholder="https://cdn.domain.com/logo.png"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Birincil Renk</label>
              <input
                type="text"
                value={formState.branding.primaryColor}
                onChange={handleInputChange('branding', 'primaryColor')}
                placeholder="#1D4ED8"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">İkincil Renk</label>
              <input
                type="text"
                value={formState.branding.secondaryColor}
                onChange={handleInputChange('branding', 'secondaryColor')}
                placeholder="#9333EA"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Kısa Açıklama</label>
              <textarea
                rows="3"
                value={formState.branding.description}
                onChange={handleInputChange('branding', 'description')}
                placeholder="Tenant hakkında kısa bir açıklama"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Özellik Bayrakları</h2>
            <p className="text-sm text-gray-500">Tenant bazlı özellikleri etkinleştir veya devre dışı bırak. Yeni anahtarlar ekleyerek sistemi genişletebilirsin.</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {Object.keys(formState.features).length === 0 ? (
              <div className="text-sm text-gray-500">Henüz tanımlı bir özellik bulunmuyor.</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(formState.features).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{key}</p>
                      <p className="text-xs text-gray-500">Özelliği aktif ettiğinde ilgili modüller tanımlanan kontrolleri kullanabilir.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <span>{value ? 'Aktif' : 'Pasif'}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={handleFeatureToggle(key)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeFeature(key)}
                        className="text-xs font-medium text-red-600 hover:text-red-500"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                placeholder="Özellik anahtarı (örn. contentScheduling)"
                value={featureKeyInput}
                onChange={(event) => setFeatureKeyInput(event.target.value)}
                className={FIELD_INPUT_CLASS}
              />
              <button
                type="button"
                onClick={handleAddFeature}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Özellik Ekle
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Gelişmiş Metadata</h2>
            <p className="text-sm text-gray-500">JSON formatında saklanan ekstra yapılandırmaları düzenleyebilirsin. Boş bırakmak için tüm içeriği sil.</p>
          </div>
          <div className="px-6 py-5">
            <textarea
              rows="6"
              value={metadataText}
              onChange={(event) => setMetadataText(event.target.value)}
              className={FIELD_INPUT_WITH_MARGIN_CLASS}
            />
            <p className="mt-2 text-xs text-gray-500">Örnek: {`{ "defaultLocale": "tr-TR", "theme": "dark" }`}</p>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={updateMutation.isPending}
            onClick={() => {
              if (settingsQuery.data) {
                const merged = mergeWithDefaults(settingsQuery.data)
                setFormState(merged)
                setMetadataText(JSON.stringify(settingsQuery.data.metadata || {}, null, 2) || '{}')
                setSecretFlags({ smtpPassword: false, webhookSecret: false })
                setFeedback({ type: '', message: '' })
              }
            }}
            className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Sıfırla
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {updateMutation.isPending ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
          </button>
        </div>
      </form>

      {/* Plan Change Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={() => setShowPlanModal(false)}></div>

            <div className="relative w-full max-w-6xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
              <div className="bg-white px-6 py-5 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">Abonelik Planını Değiştir</h3>
                <p className="mt-1 text-sm text-gray-600">
                  İhtiyaçlarınıza uygun planı seçin. Plan değişiklikleri anında etkinleşir.
                </p>
              </div>

              <div className="px-6 py-6">
                <SubscriptionPlanSelector
                  selectedPlan={selectedPlan || currentPlan}
                  onSelectPlan={setSelectedPlan}
                  currentPlan={currentPlan}
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
                  }}
                  disabled={updatePlanMutation.isPending}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handlePlanChange}
                  disabled={updatePlanMutation.isPending || !selectedPlan || selectedPlan === currentPlan}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {updatePlanMutation.isPending ? 'Güncelleniyor...' : 'Planı Değiştir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
