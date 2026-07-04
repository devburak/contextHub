import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { fetchTenantLimits, updateTenantSubscription } from '../../lib/api/subscriptions.js'
import {
  listCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition
} from '../../lib/api/customFieldDefinitions'
import { useAuth } from '../../contexts/AuthContext.jsx'
import SubscriptionPlanSelector from '../../components/SubscriptionPlanSelector.jsx'
import ApiTokenManager from '../../components/ApiTokenManager.jsx'
import TenantTabs from '../../components/TenantTabs.jsx'

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
  edgeGateway: {
    publicReadEnabled: true,
    allowLocalhost: true,
    allowedOrigins: [],
    allowedOriginsText: ''
  },
  features: {},
  metadata: {}
}

const FIELD_INPUT_CLASS = 'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
const FIELD_INPUT_WITH_MARGIN_CLASS = `mt-1 ${FIELD_INPUT_CLASS}`
const CUSTOM_FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'multi-select', label: 'Multi-select' },
  { value: 'url', label: 'URL' },
  { value: 'json', label: 'JSON' },
  { value: 'reference', label: 'Reference' },
]

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

const normalizeOriginsText = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

const parseOriginsText = (value) => Array.from(new Set(
  String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
))

const formatCountUsage = (metric) => {
  const current = metric?.current ?? 0
  if (metric?.isUnlimited) {
    return `${current} / ∞`
  }
  return `${current} / ${metric?.limit ?? 0}`
}

const formatStorageUsage = (metric) => {
  const current = Number(metric?.current ?? 0)
  if (metric?.isUnlimited) {
    return `${(current / (1024 ** 3)).toFixed(2)} GB / ∞`
  }
  const limit = Number(metric?.limit ?? 0)
  return `${(current / (1024 ** 3)).toFixed(2)} GB / ${(limit / (1024 ** 3)).toFixed(0)} GB`
}

const formatRequestUsage = (metric) => {
  const current = Number(metric?.current ?? 0)
  if (metric?.isUnlimited) {
    return `${(current / 1000).toFixed(1)}K / ∞`
  }
  const limit = Number(metric?.limit ?? 0)
  return `${(current / 1000).toFixed(1)}K / ${(limit / 1000).toFixed(0)}K`
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
    edgeGateway: {
      ...EMPTY_STATE.edgeGateway,
      publicReadEnabled: settings.edgeGateway?.publicReadEnabled ?? EMPTY_STATE.edgeGateway.publicReadEnabled,
      allowLocalhost: settings.edgeGateway?.allowLocalhost ?? EMPTY_STATE.edgeGateway.allowLocalhost,
      allowedOrigins: settings.edgeGateway?.allowedOrigins || EMPTY_STATE.edgeGateway.allowedOrigins,
      allowedOriginsText: normalizeOriginsText(settings.edgeGateway?.allowedOrigins)
    },
    features: { ...(settings.features || {}) },
    metadata: settings.metadata || {}
  }
}

const buildPayload = (state, secretFlags, secretEditState, metadataText) => {
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
    edgeGateway: {
      publicReadEnabled: Boolean(state.edgeGateway.publicReadEnabled),
      allowLocalhost: Boolean(state.edgeGateway.allowLocalhost),
      allowedOrigins: parseOriginsText(state.edgeGateway.allowedOriginsText)
    },
    features: Object.fromEntries(
      Object.entries(state.features || {}).map(([key, value]) => [key, Boolean(value)])
    ),
    metadata
  }

  if (secretFlags.smtpPassword) {
    payload.smtp.password = null
  } else if (secretEditState.smtpPassword && state.smtp.password) {
    payload.smtp.password = state.smtp.password
  }

  if (secretFlags.webhookSecret) {
    payload.webhook.secret = null
  } else if (state.webhook.secret) {
    payload.webhook.secret = state.webhook.secret
  }

  return payload
}

function CustomFieldDefinitionsSettings({ tenantId }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState({
    key: '',
    label: '',
    type: 'text',
    required: false,
    public: false,
    filterable: false,
    searchable: false,
    optionsText: ''
  })
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const optionTypes = new Set(['select', 'multi-select'])

  const definitionsQuery = useQuery({
    queryKey: ['customFieldDefinitions', { tenant: tenantId }],
    queryFn: listCustomFieldDefinitions,
    enabled: Boolean(tenantId)
  })

  const resetDraft = () => {
    setDraft({
      key: '',
      label: '',
      type: 'text',
      required: false,
      public: false,
      filterable: false,
      searchable: false,
      optionsText: ''
    })
  }

  const parseOptions = () => draft.optionsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, value] = line.includes('|') ? line.split('|').map((part) => part.trim()) : [line, line]
      return { label, value }
    })

  const invalidateDefinitions = () => {
    queryClient.invalidateQueries({ queryKey: ['customFieldDefinitions'] })
  }

  const createMutation = useMutation({
    mutationFn: (payload) => createCustomFieldDefinition(payload),
    onMutate: () => setFeedback({ type: '', message: '' }),
    onSuccess: () => {
      invalidateDefinitions()
      resetDraft()
      setFeedback({ type: 'success', message: 'Custom field tanımı oluşturuldu.' })
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || 'Custom field tanımı oluşturulamadı.'
      setFeedback({ type: 'error', message })
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateCustomFieldDefinition({ id, payload }),
    onMutate: () => setFeedback({ type: '', message: '' }),
    onSuccess: () => {
      invalidateDefinitions()
      setFeedback({ type: 'success', message: 'Custom field tanımı güncellendi.' })
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || 'Custom field tanımı güncellenemedi.'
      setFeedback({ type: 'error', message })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (definitionId) => deleteCustomFieldDefinition(definitionId),
    onMutate: () => setFeedback({ type: '', message: '' }),
    onSuccess: () => {
      invalidateDefinitions()
      setFeedback({ type: 'success', message: 'Custom field tanımı silindi.' })
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || 'Custom field tanımı silinemedi.'
      setFeedback({ type: 'error', message })
    }
  })

  const isMutating = createMutation.isLoading || createMutation.isPending || updateMutation.isLoading || updateMutation.isPending || deleteMutation.isLoading || deleteMutation.isPending
  const definitions = definitionsQuery.data || []

  const handleCreate = () => {
    createMutation.mutate({
      key: draft.key,
      label: draft.label || draft.key,
      type: draft.type,
      required: draft.required,
      public: draft.public,
      filterable: draft.filterable,
      searchable: draft.searchable,
      options: parseOptions()
    })
  }

  const toggleDefinitionFlag = (definition, key, value) => {
    updateMutation.mutate({
      id: definition._id,
      payload: {
        ...definition,
        [key]: value
      }
    })
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">İçerik Custom Field Tanımları</h2>
        <p className="text-sm text-gray-500">İçerik editöründe doldurulacak tenant bazlı alanları, public API ve filtre davranışlarını buradan yönet.</p>
      </div>
      <div className="space-y-5 px-6 py-5">
        {feedback.message && (
          <div className={`rounded-md border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {feedback.message}
          </div>
        )}

        {definitionsQuery.isLoading ? (
          <div className="text-sm text-gray-500">Custom field tanımları yükleniyor...</div>
        ) : definitionsQuery.isError ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>Custom field tanımları alınamadı.</span>
            <button type="button" onClick={() => definitionsQuery.refetch()} className="font-semibold text-red-700 hover:text-red-600">Tekrar dene</button>
          </div>
        ) : definitions.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">Henüz custom field tanımı yok.</div>
        ) : (
          <div className="space-y-3">
            {definitions.map((definition) => (
              <div key={definition._id || definition.key} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{definition.label}</h3>
                      {definition.required && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">zorunlu</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-gray-500">
                      <span className="rounded bg-white px-1.5 py-0.5">{definition.key}</span>
                      <span className="rounded bg-white px-1.5 py-0.5">{definition.type}</span>
                      {definition.public && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">public</span>}
                      {definition.filterable && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">filterable</span>}
                      {definition.searchable && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">searchable</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.confirm('Bu custom field tanımı silinsin mi?') && deleteMutation.mutate(definition._id)}
                    disabled={isMutating}
                    className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Sil
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-700 sm:grid-cols-4">
                  {[['public', 'Public API'], ['filterable', 'Filtrelenebilir'], ['searchable', 'Aranabilir'], ['required', 'Zorunlu']].map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(definition[key])}
                        onChange={(event) => toggleDefinitionFlag(definition, key, event.target.checked)}
                        disabled={isMutating}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Alan Tanımı Ekle</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="text" value={draft.key} onChange={(event) => setDraft((prev) => ({ ...prev, key: event.target.value }))} className={FIELD_INPUT_CLASS} placeholder="key: author, source, readingTime" />
            <input type="text" value={draft.label} onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))} className={FIELD_INPUT_CLASS} placeholder="Etiket" />
            <select value={draft.type} onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))} className={FIELD_INPUT_CLASS}>
              {CUSTOM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            {optionTypes.has(draft.type) && (
              <textarea value={draft.optionsText} onChange={(event) => setDraft((prev) => ({ ...prev, optionsText: event.target.value }))} rows={3} className={`${FIELD_INPUT_CLASS} sm:col-span-2`} placeholder={'Seçenekler\nEtiket|value'} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 sm:grid-cols-4">
            {[['required', 'Zorunlu'], ['public', 'Public API'], ['filterable', 'Filtrelenebilir'], ['searchable', 'Aranabilir']].map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2">
                <input type="checkbox" checked={Boolean(draft[key])} onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                {label}
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isMutating || !draft.key.trim()}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isLoading || createMutation.isPending ? 'Ekleniyor...' : 'Alan Ekle'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function TenantSettings() {
  const queryClient = useQueryClient()
  const { activeMembership, updateMemberships } = useAuth()
  const activeTenantId = activeMembership?.tenantId || null
  const tenantSettingsQueryKey = ['tenants', 'settings', { tenant: activeTenantId }]
  const tenantLimitsQueryKey = ['tenant-limits', { tenant: activeTenantId }]

  const settingsQuery = useQuery({
    queryKey: tenantSettingsQueryKey,
    queryFn: tenantAPI.getSettings,
    enabled: Boolean(activeTenantId)
  })

  // Fetch current tenant limits and plan
  const limitsQuery = useQuery({
    queryKey: tenantLimitsQueryKey,
    queryFn: fetchTenantLimits,
    enabled: Boolean(activeTenantId),
    staleTime: 30000, // 30 seconds
  })

  const [formState, setFormState] = useState(JSON.parse(JSON.stringify(EMPTY_STATE)))
  const [metadataText, setMetadataText] = useState('{}')
  const [secretFlags, setSecretFlags] = useState({ smtpPassword: false, webhookSecret: false })
  const [secretEditState, setSecretEditState] = useState({ smtpPassword: false, webhookSecret: false })
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [featureKeyInput, setFeatureKeyInput] = useState('')
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [showPlanModal, setShowPlanModal] = useState(false)

  useEffect(() => {
    setFormState(JSON.parse(JSON.stringify(EMPTY_STATE)))
    setMetadataText('{}')
    setSecretFlags({ smtpPassword: false, webhookSecret: false })
    setSecretEditState({ smtpPassword: false, webhookSecret: false })
    setFeedback({ type: '', message: '' })
    setFeatureKeyInput('')
    setSelectedPlan(null)
    setShowPlanModal(false)
  }, [activeTenantId])

  useEffect(() => {
    if (settingsQuery.data) {
      const merged = mergeWithDefaults(settingsQuery.data)
      setFormState(merged)
      setMetadataText(JSON.stringify(settingsQuery.data.metadata || {}, null, 2) || '{}')
      setSecretFlags({ smtpPassword: false, webhookSecret: false })
      setSecretEditState({ smtpPassword: false, webhookSecret: false })
    }
  }, [settingsQuery.data])

  const updateMutation = useMutation({
    mutationFn: tenantAPI.updateSettings,
    onMutate: () => {
      setFeedback({ type: '', message: '' })
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(tenantSettingsQueryKey, settings)
      const merged = mergeWithDefaults(settings)
      setFormState(merged)
      setMetadataText(JSON.stringify(settings.metadata || {}, null, 2) || '{}')
      setSecretFlags({ smtpPassword: false, webhookSecret: false })
      setSecretEditState({ smtpPassword: false, webhookSecret: false })
      setFeedback({ type: 'success', message: 'Ayarlar başarıyla kaydedildi.' })
    },
    onError: (error) => {
      const apiMessage = error?.response?.data?.message || error?.response?.data?.error
      setFeedback({ type: 'error', message: apiMessage || 'Ayarlar kaydedilirken bir hata oluştu.' })
    }
  })

  const updatePlanMutation = useMutation({
    mutationFn: ({ tenantId, planSlug }) => updateTenantSubscription(tenantId, { planSlug }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: tenantLimitsQueryKey })
      queryClient.invalidateQueries({ queryKey: ['tenants', 'list'] })
      try {
        const { tenants } = await tenantAPI.getTenants({ includeTokens: true })
        updateMemberships(tenants)
        queryClient.setQueryData(['tenants', 'list'], tenants)
      } catch (error) {
        console.error('Tenant listesi plan değişikliği sonrası yenilenemedi:', error)
      }
      setShowPlanModal(false)
      setSelectedPlan(null)
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
    if (!secretEditState.smtpPassword) {
      return
    }
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

  const startSmtpPasswordEdit = () => {
    setSecretFlags((prev) => ({ ...prev, smtpPassword: false }))
    setSecretEditState((prev) => ({ ...prev, smtpPassword: true }))
    setFormState((prev) => ({
      ...prev,
      smtp: {
        ...prev.smtp,
        password: ''
      }
    }))
  }

  const cancelSmtpPasswordEdit = () => {
    setSecretEditState((prev) => ({ ...prev, smtpPassword: false }))
    setFormState((prev) => ({
      ...prev,
      smtp: {
        ...prev.smtp,
        password: ''
      }
    }))
  }

  const resetSmtpPassword = () => {
    setSecretFlags((prev) => ({ ...prev, smtpPassword: true }))
    setSecretEditState((prev) => ({ ...prev, smtpPassword: false }))
    setFormState((prev) => ({
      ...prev,
      smtp: {
        ...prev.smtp,
        password: '',
        hasPassword: false
      }
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!activeTenantId) {
      setFeedback({ type: 'error', message: 'Aktif tenant bulunamadı.' })
      return
    }
    try {
      const payload = buildPayload(formState, secretFlags, secretEditState, metadataText)
      updateMutation.mutate(payload)
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  const handlePlanChange = () => {
    if (!selectedPlan || !activeTenantId) return
    updatePlanMutation.mutate({
      tenantId: activeTenantId,
      planSlug: selectedPlan
    })
  }

  const currentPlan = limitsQuery.data?.plan?.slug || 'free'

  // Advanced Metadata için canlı JSON denetimi: metin geçerli bir JSON nesnesi değilse
  // alanı işaretle ve kaydı engelle. Boş metin = temizleme, izinli.
  let metadataError = ''
  {
    const metadataTrimmed = metadataText.trim()
    if (metadataTrimmed) {
      try {
        const parsed = JSON.parse(metadataTrimmed)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          metadataError = 'Metadata bir JSON nesnesi olmalı (ör. { "anahtar": "değer" }).'
        }
      } catch {
        metadataError = 'Geçersiz JSON formatı.'
      }
    }
  }

  if (!activeTenantId || settingsQuery.isLoading) {
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
      <TenantTabs active="settings" />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tenant Ayarları</h1>
        <p className="mt-2 text-sm text-gray-600">
          SMTP, limitler ve özellikler gibi tenant düzeyindeki yapılandırmaları buradan yönetebilirsin.
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit} autoComplete="off">
        <input type="text" name="tenant-settings-username" autoComplete="username" className="hidden" tabIndex="-1" aria-hidden="true" />
        <input type="password" name="tenant-settings-password" autoComplete="current-password" className="hidden" tabIndex="-1" aria-hidden="true" />
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
                      {formatCountUsage(limitsQuery.data?.usage?.users)}
                    </p>
                  </div>

                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-xs font-medium text-purple-600 uppercase">Depolama</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {formatStorageUsage(limitsQuery.data?.usage?.storage)}
                    </p>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                    <p className="text-xs font-medium text-emerald-600 uppercase">API İstekleri</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {formatRequestUsage(limitsQuery.data?.usage?.requests)}
                    </p>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs font-medium text-amber-600 uppercase">Owners</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {formatCountUsage(limitsQuery.data?.usage?.owners)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* API Token Management Section */}
        <ApiTokenManager tenantId={activeTenantId} />

        <CustomFieldDefinitionsSettings tenantId={activeTenantId} />

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Edge API ve CORS</h2>
            <p className="text-sm text-gray-500">Cloudflare Worker üzerinden geçen public API erişimi ve tarayıcı origin izinlerini tenant bazında yönet.</p>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={formState.edgeGateway.publicReadEnabled}
                  onChange={handleCheckboxChange('edgeGateway', 'publicReadEnabled')}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Public read aktif</span>
                  <span className="mt-1 block text-xs text-gray-500">Kapalıyken Worker tenant için public okuma isteklerini origin'e geçirmeden reddeder.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={formState.edgeGateway.allowLocalhost}
                  onChange={handleCheckboxChange('edgeGateway', 'allowLocalhost')}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Localhost geliştirme izni</span>
                  <span className="mt-1 block text-xs text-gray-500">localhost ve 127.0.0.1 origin'leri sadece geliştirme/test için kabul edilir.</span>
                </span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Allowed Origins</label>
              <textarea
                rows="5"
                value={formState.edgeGateway.allowedOriginsText}
                onChange={handleInputChange('edgeGateway', 'allowedOriginsText')}
                placeholder={'https://kesk.org.tr\nhttps://www.kesk.org.tr\nhttps://*.example.com'}
                className={`${FIELD_INPUT_WITH_MARGIN_CLASS} font-mono`}
              />
              <p className="mt-2 text-xs text-gray-500">
                Her satıra bir origin yaz. Wildcard sadece alt domainleri kapsar; ana domain için ayrıca kayıt gir.
              </p>
            </div>
          </div>
        </section>

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
                name="smtp-host"
                autoComplete="off"
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
                name="smtp-port"
                autoComplete="off"
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
                name="smtp-username"
                autoComplete="off"
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
                name="smtp-from-name"
                autoComplete="off"
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
                name="smtp-from-email"
                autoComplete="off"
                value={formState.smtp.fromEmail}
                onChange={handleInputChange('smtp', 'fromEmail')}
                placeholder="no-reply@domain.com"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Parola</label>
              <input
                id="smtp-credential-secret"
                name="smtp-credential-secret"
                type="password"
                autoComplete="new-password"
                readOnly={!secretEditState.smtpPassword}
                disabled={!secretEditState.smtpPassword}
                value={formState.smtp.password}
                onChange={handlePasswordChange}
                placeholder={formState.smtp.hasPassword ? '••••••' : 'Parola girin'}
                className={`${FIELD_INPUT_WITH_MARGIN_CLASS} disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
              />
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {secretFlags.smtpPassword
                    ? 'Kaydedildiğinde parola temizlenecek.'
                    : secretEditState.smtpPassword
                      ? 'Yeni parola kaydedilecek.'
                      : formState.smtp.hasPassword
                        ? 'Kaydetmediğin sürece mevcut parola korunur.'
                      : 'Parola girilmedi.'}
                </span>
                <div className="flex items-center gap-3">
                  {secretEditState.smtpPassword ? (
                    <button
                      type="button"
                      onClick={cancelSmtpPasswordEdit}
                      className="font-medium text-gray-600 hover:text-gray-500"
                    >
                      İptal
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startSmtpPasswordEdit}
                      className="font-medium text-blue-600 hover:text-blue-500"
                    >
                      {formState.smtp.hasPassword ? 'Parolayı değiştir' : 'Parola ekle'}
                    </button>
                  )}
                  {(formState.smtp.hasPassword || secretEditState.smtpPassword || secretFlags.smtpPassword) && (
                    <button
                      type="button"
                      onClick={resetSmtpPassword}
                      className="font-medium text-blue-600 hover:text-blue-500"
                    >
                      Parolayı temizle
                    </button>
                  )}
                </div>
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
              aria-invalid={Boolean(metadataError)}
              className={`${FIELD_INPUT_WITH_MARGIN_CLASS}${
                metadataError
                  ? ' border-red-300 focus:border-red-400 focus:ring-red-300'
                  : metadataText.trim()
                    ? ' border-green-300 focus:border-green-400 focus:ring-green-300'
                    : ''
              }`}
            />
            {metadataError ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-red-600">
                <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {metadataError}
              </p>
            ) : metadataText.trim() ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600">
                <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Geçerli JSON.
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">Boş — kaydedildiğinde metadata temizlenecek.</p>
            )}
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
                setSecretEditState({ smtpPassword: false, webhookSecret: false })
                setFeedback({ type: '', message: '' })
              }
            }}
            className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Sıfırla
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending || Boolean(metadataError)}
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
