import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tenantAPI } from '../../lib/tenantAPI.js'

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
  const settingsQuery = useQuery({
    queryKey: ['tenants', 'settings'],
    queryFn: tenantAPI.getSettings
  })

  const [formState, setFormState] = useState(JSON.parse(JSON.stringify(EMPTY_STATE)))
  const [metadataText, setMetadataText] = useState('{}')
  const [secretFlags, setSecretFlags] = useState({ smtpPassword: false, webhookSecret: false })
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [featureKeyInput, setFeatureKeyInput] = useState('')
  const [customLimitInput, setCustomLimitInput] = useState({ key: '', value: '' })

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

  const customLimitEntries = useMemo(() => Object.entries(formState.limits.custom || {}), [formState.limits.custom])

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

  const handleCustomLimitChange = (key) => (event) => {
    const value = event.target.value
    setFormState((prev) => ({
      ...prev,
      limits: {
        ...prev.limits,
        custom: {
          ...prev.limits.custom,
          [key]: value
        }
      }
    }))
  }

  const removeCustomLimit = (key) => {
    setFormState((prev) => {
      const next = { ...prev.limits.custom }
      delete next[key]
      return {
        ...prev,
        limits: {
          ...prev.limits,
          custom: next
        }
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

  const handleAddCustomLimit = () => {
    const key = customLimitInput.key.trim()
    if (!key) return
    setFormState((prev) => ({
      ...prev,
      limits: {
        ...prev.limits,
        custom: {
          ...prev.limits.custom,
          [key]: customLimitInput.value
        }
      }
    }))
    setCustomLimitInput({ key: '', value: '' })
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
            <h2 className="text-lg font-semibold text-gray-900">Kullanım Limitleri</h2>
            <p className="text-sm text-gray-500">Plan ve paketlere göre içerik, medya ve kullanıcı limitlerini yönet.</p>
          </div>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">İçerik Limiti</label>
              <input
                type="number"
                min="0"
                value={formState.limits.entries}
                onChange={handleInputChange('limits', 'entries')}
                placeholder="Sınırsız için boş bırak"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Medya Limiti</label>
              <input
                type="number"
                min="0"
                value={formState.limits.media}
                onChange={handleInputChange('limits', 'media')}
                placeholder="Sınırsız için boş bırak"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Kullanıcı Limiti</label>
              <input
                type="number"
                min="0"
                value={formState.limits.users}
                onChange={handleInputChange('limits', 'users')}
                placeholder="Sınırsız için boş bırak"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">API Çağrı Limiti</label>
              <input
                type="number"
                min="0"
                value={formState.limits.apiCalls}
                onChange={handleInputChange('limits', 'apiCalls')}
                placeholder="Sınırsız için boş bırak"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Aylık E-posta Limiti</label>
              <input
                type="number"
                min="0"
                value={formState.limits.emailPerMonth}
                onChange={handleInputChange('limits', 'emailPerMonth')}
                placeholder="Sınırsız için boş bırak"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
          </div>
          <div className="border-t border-gray-200 px-6 py-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Özel Limitler</h3>
              <p className="text-xs text-gray-500">Örneğin günlük form gönderimi limiti gibi özel alanlar ekleyebilirsin.</p>
            </div>
            {customLimitEntries.length > 0 && (
              <div className="space-y-3">
                {customLimitEntries.map(([key, value]) => (
                  <div key={key} className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">{key}</label>
                      <input
                        type="number"
                        min="0"
                        value={value}
                        onChange={handleCustomLimitChange(key)}
                        className={FIELD_INPUT_WITH_MARGIN_CLASS}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustomLimit(key)}
                      className="self-end text-xs font-medium text-red-600 hover:text-red-500"
                    >
                      Kaldır
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                type="text"
                placeholder="Limit anahtarı (örn. formSubmissions)"
                value={customLimitInput.key}
                onChange={(event) => setCustomLimitInput((prev) => ({ ...prev, key: event.target.value }))}
                className={FIELD_INPUT_CLASS}
              />
              <input
                type="number"
                min="0"
                placeholder="Değer"
                value={customLimitInput.value}
                onChange={(event) => setCustomLimitInput((prev) => ({ ...prev, value: event.target.value }))}
                className={FIELD_INPUT_CLASS}
              />
              <button
                type="button"
                onClick={handleAddCustomLimit}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Ekle
              </button>
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
    </div>
  )
}
