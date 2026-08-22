import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { useApiError } from '../../lib/useApiError.js'
import { fetchTenantLimits } from '../../lib/api/subscriptions.js'
import {
  listCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition
} from '../../lib/api/customFieldDefinitions'
import { collectionsApi } from '../../lib/api/collections.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
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
// `value` alan tipinin sistemdeki tanımlayıcısıdır ve çevrilmez; yalnızca
// görünen etiket render sırasında `t()` ile çözülür.
const CUSTOM_FIELD_TYPES = [
  { value: 'text', labelKey: 'tenantSettings.field_type_text' },
  { value: 'number', labelKey: 'tenantSettings.field_type_number' },
  { value: 'boolean', labelKey: 'tenantSettings.field_type_boolean' },
  { value: 'date', labelKey: 'tenantSettings.field_type_date' },
  { value: 'select', labelKey: 'tenantSettings.field_type_select' },
  { value: 'multi-select', labelKey: 'tenantSettings.field_type_multi_select' },
  { value: 'url', labelKey: 'tenantSettings.field_type_url' },
  { value: 'json', labelKey: 'tenantSettings.field_type_json' },
  { value: 'reference', labelKey: 'tenantSettings.field_type_reference' },
  { value: 'multi-reference', labelKey: 'tenantSettings.field_type_multi_reference' },
]

// Alan bayrağı kutucuklarının sırası ekrana göre değişiyor; etiketler anahtar olarak tutulur.
const CUSTOM_FIELD_FLAG_KEYS = {
  public: 'tenantSettings.flag_public',
  filterable: 'tenantSettings.flag_filterable',
  searchable: 'tenantSettings.flag_searchable',
  required: 'common.required'
}

// buildPayload React ağacının dışında çalıştığı için hatayı çeviri anahtarıyla fırlatır.
const METADATA_INVALID_JSON_ERROR = 'tenantSettings.metadata_invalid_json'

const REFERENCE_FIELD_TYPES = new Set(['reference', 'multi-reference'])

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
      throw new Error(METADATA_INVALID_JSON_ERROR)
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
  const { t } = useTranslation()
  const describeError = useApiError()
  const [draft, setDraft] = useState({
    key: '',
    label: '',
    type: 'text',
    required: false,
    public: false,
    filterable: false,
    searchable: false,
    optionsText: '',
    referenceCollectionKey: ''
  })
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const optionTypes = new Set(['select', 'multi-select'])

  const definitionsQuery = useQuery({
    queryKey: ['customFieldDefinitions', { tenant: tenantId }],
    queryFn: listCustomFieldDefinitions,
    enabled: Boolean(tenantId)
  })

  const collectionTypesQuery = useQuery({
    queryKey: ['collectionTypes', { tenant: tenantId }],
    queryFn: () => collectionsApi.listCollectionTypes(),
    enabled: Boolean(tenantId)
  })
  const collectionTypes = collectionTypesQuery.data || []

  const resetDraft = () => {
    setDraft({
      key: '',
      label: '',
      type: 'text',
      required: false,
      public: false,
      filterable: false,
      searchable: false,
      optionsText: '',
      referenceCollectionKey: ''
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
      setFeedback({ type: 'success', message: t('tenantSettings.custom_field_created') })
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: describeError(error, 'tenantSettings.custom_field_create_failed') })
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateCustomFieldDefinition({ id, payload }),
    onMutate: () => setFeedback({ type: '', message: '' }),
    onSuccess: () => {
      invalidateDefinitions()
      setFeedback({ type: 'success', message: t('tenantSettings.custom_field_updated') })
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: describeError(error, 'tenantSettings.custom_field_update_failed') })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (definitionId) => deleteCustomFieldDefinition(definitionId),
    onMutate: () => setFeedback({ type: '', message: '' }),
    onSuccess: () => {
      invalidateDefinitions()
      setFeedback({ type: 'success', message: t('tenantSettings.custom_field_deleted') })
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: describeError(error, 'tenantSettings.custom_field_delete_failed') })
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
      options: parseOptions(),
      referenceCollectionKey: REFERENCE_FIELD_TYPES.has(draft.type) ? draft.referenceCollectionKey : ''
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
        <h2 className="text-lg font-semibold text-gray-900">{t('tenantSettings.custom_fields_title')}</h2>
        <p className="text-sm text-gray-500">{t('tenantSettings.custom_fields_desc')}</p>
      </div>
      <div className="space-y-5 px-6 py-5">
        {feedback.message && (
          <div className={`rounded-md border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {feedback.message}
          </div>
        )}

        {definitionsQuery.isLoading ? (
          <div className="text-sm text-gray-500">{t('tenantSettings.custom_fields_loading')}</div>
        ) : definitionsQuery.isError ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{t('tenantSettings.custom_fields_error')}</span>
            <button type="button" onClick={() => definitionsQuery.refetch()} className="font-semibold text-red-700 hover:text-red-600">{t('common.retry')}</button>
          </div>
        ) : definitions.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">{t('tenantSettings.custom_fields_empty')}</div>
        ) : (
          <div className="space-y-3">
            {definitions.map((definition) => (
              <div key={definition._id || definition.key} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{definition.label}</h3>
                      {definition.required && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">{t('tenantSettings.badge_required')}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-gray-500">
                      <span className="rounded bg-white px-1.5 py-0.5">{definition.key}</span>
                      <span className="rounded bg-white px-1.5 py-0.5">{definition.type}</span>
                      {definition.referenceCollectionKey && (
                        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">→ {definition.referenceCollectionKey}</span>
                      )}
                      {definition.public && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{t('tenantSettings.flag_public')}</span>}
                      {definition.filterable && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{t('tenantSettings.flag_filterable')}</span>}
                      {definition.searchable && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">{t('tenantSettings.flag_searchable')}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.confirm(t('tenantSettings.custom_field_delete_confirm')) && deleteMutation.mutate(definition._id)}
                    disabled={isMutating}
                    className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {t('common.delete')}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-700 sm:grid-cols-4">
                  {['public', 'filterable', 'searchable', 'required'].map((key) => (
                    <label key={key} className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(definition[key])}
                        onChange={(event) => toggleDefinitionFlag(definition, key, event.target.checked)}
                        disabled={isMutating}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      {t(CUSTOM_FIELD_FLAG_KEYS[key])}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('tenantSettings.add_field_title')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="text" value={draft.key} onChange={(event) => setDraft((prev) => ({ ...prev, key: event.target.value }))} className={FIELD_INPUT_CLASS} placeholder={t('tenantSettings.field_key_placeholder')} />
            <input type="text" value={draft.label} onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))} className={FIELD_INPUT_CLASS} placeholder={t('tenantSettings.field_label_placeholder')} />
            <select value={draft.type} onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))} className={FIELD_INPUT_CLASS}>
              {CUSTOM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{t(type.labelKey)}</option>)}
            </select>
            {optionTypes.has(draft.type) && (
              <textarea value={draft.optionsText} onChange={(event) => setDraft((prev) => ({ ...prev, optionsText: event.target.value }))} rows={3} className={`${FIELD_INPUT_CLASS} sm:col-span-2`} placeholder={t('tenantSettings.field_options_placeholder')} />
            )}
            {REFERENCE_FIELD_TYPES.has(draft.type) && (
              <select
                value={draft.referenceCollectionKey}
                onChange={(event) => setDraft((prev) => ({ ...prev, referenceCollectionKey: event.target.value }))}
                className={`${FIELD_INPUT_CLASS} sm:col-span-2`}
              >
                <option value="">{t('tenantSettings.reference_collection_placeholder')}</option>
                {collectionTypes.map((collection) => (
                  <option key={collection.key} value={collection.key}>
                    {collection.name?.tr || collection.name?.en || collection.key}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 sm:grid-cols-4">
            {['required', 'public', 'filterable', 'searchable'].map((key) => (
              <label key={key} className="inline-flex items-center gap-2">
                <input type="checkbox" checked={Boolean(draft[key])} onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                {t(CUSTOM_FIELD_FLAG_KEYS[key])}
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isMutating || !draft.key.trim() || (REFERENCE_FIELD_TYPES.has(draft.type) && !draft.referenceCollectionKey)}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isLoading || createMutation.isPending ? t('tenantSettings.adding_field') : t('tenantSettings.add_field')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function TenantSettings() {
  const queryClient = useQueryClient()
  const { activeMembership } = useAuth()
  const { t } = useTranslation()
  const describeError = useApiError()
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

  useEffect(() => {
    setFormState(JSON.parse(JSON.stringify(EMPTY_STATE)))
    setMetadataText('{}')
    setSecretFlags({ smtpPassword: false, webhookSecret: false })
    setSecretEditState({ smtpPassword: false, webhookSecret: false })
    setFeedback({ type: '', message: '' })
    setFeatureKeyInput('')
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
      setFeedback({ type: 'success', message: t('tenantSettings.settings_saved') })
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: describeError(error, 'tenantSettings.save_failed') })
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
      setFeedback({ type: 'error', message: t('tenantSettings.no_active_tenant') })
      return
    }
    try {
      const payload = buildPayload(formState, secretFlags, secretEditState, metadataText)
      updateMutation.mutate(payload)
    } catch (error) {
      // buildPayload çeviri anahtarı fırlatır; beklenmeyen hatalarda ham mesaj gösterilir.
      setFeedback({ type: 'error', message: t(error.message, { defaultValue: error.message }) })
    }
  }

  // Advanced Metadata için canlı JSON denetimi: metin geçerli bir JSON nesnesi değilse
  // alanı işaretle ve kaydı engelle. Boş metin = temizleme, izinli.
  let metadataError = ''
  {
    const metadataTrimmed = metadataText.trim()
    if (metadataTrimmed) {
      try {
        const parsed = JSON.parse(metadataTrimmed)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          metadataError = t('tenantSettings.metadata_must_be_object')
        }
      } catch {
        metadataError = t('tenantSettings.metadata_invalid_json')
      }
    }
  }

  if (!activeTenantId || settingsQuery.isLoading) {
    return <div className="text-sm text-gray-500">{t('tenantSettings.loading')}</div>
  }

  if (settingsQuery.isError) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">{t('tenantSettings.load_error')}</div>
        <button
          type="button"
          onClick={() => settingsQuery.refetch()}
          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <TenantTabs active="settings" />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('tenantSettings.title')}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {t('tenantSettings.subtitle')}
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
            <h2 className="text-lg font-semibold text-gray-900">{t('tenantSettings.subscription_title')}</h2>
            <p className="text-sm text-gray-500">{t('tenantSettings.subscription_desc')}</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {limitsQuery.isLoading ? (
              <div className="text-center text-gray-500 py-4">{t('tenantSettings.plan_loading')}</div>
            ) : limitsQuery.isError ? (
              <div className="text-center text-red-600 py-4">{t('tenantSettings.plan_load_error')}</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-gray-50 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{t('tenantSettings.current_plan')}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{limitsQuery.data?.plan?.name || 'Free'}</p>
                    {limitsQuery.data?.plan?.price > 0 && (
                      <p className="text-sm text-gray-600 mt-1">
                        {t('tenantSettings.plan_price_monthly', { price: limitsQuery.data.plan.price })}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => window.location.assign('/faturalandirma')}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    {t('tenantSettings.change_plan')}
                  </button>
                </div>

                {/* Current Usage Stats */}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs font-medium text-blue-600 uppercase">{t('tenantSettings.usage_users')}</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {formatCountUsage(limitsQuery.data?.usage?.users)}
                    </p>
                  </div>

                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-xs font-medium text-purple-600 uppercase">{t('tenantSettings.usage_storage')}</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {formatStorageUsage(limitsQuery.data?.usage?.storage)}
                    </p>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                    <p className="text-xs font-medium text-emerald-600 uppercase">{t('tenantSettings.usage_requests')}</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {formatRequestUsage(limitsQuery.data?.usage?.requests)}
                    </p>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs font-medium text-amber-600 uppercase">{t('tenantSettings.usage_owners')}</p>
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
            <h2 className="text-lg font-semibold text-gray-900">{t('tenantSettings.edge_title')}</h2>
            <p className="text-sm text-gray-500">{t('tenantSettings.edge_desc')}</p>
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
                  <span className="block text-sm font-medium text-gray-900">{t('tenantSettings.public_read_label')}</span>
                  <span className="mt-1 block text-xs text-gray-500">{t('tenantSettings.public_read_hint')}</span>
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
                  <span className="block text-sm font-medium text-gray-900">{t('tenantSettings.allow_localhost_label')}</span>
                  <span className="mt-1 block text-xs text-gray-500">{t('tenantSettings.allow_localhost_hint')}</span>
                </span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.allowed_origins_label')}</label>
              <textarea
                rows="5"
                value={formState.edgeGateway.allowedOriginsText}
                onChange={handleInputChange('edgeGateway', 'allowedOriginsText')}
                placeholder={'https://kesk.org.tr\nhttps://www.kesk.org.tr\nhttps://*.example.com'}
                className={`${FIELD_INPUT_WITH_MARGIN_CLASS} font-mono`}
              />
              <p className="mt-2 text-xs text-gray-500">
                {t('tenantSettings.allowed_origins_hint')}
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('tenantSettings.smtp_title')}</h2>
              <p className="text-sm text-gray-500">{t('tenantSettings.smtp_desc')}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span>{t('status.active')}</span>
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
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.smtp_host_label')}</label>
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
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.smtp_port_label')}</label>
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
                {t('tenantSettings.smtp_secure_label')}
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.smtp_username_label')}</label>
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
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.smtp_from_name_label')}</label>
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
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.smtp_from_email_label')}</label>
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
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.smtp_password_label')}</label>
              <input
                id="smtp-credential-secret"
                name="smtp-credential-secret"
                type="password"
                autoComplete="new-password"
                readOnly={!secretEditState.smtpPassword}
                disabled={!secretEditState.smtpPassword}
                value={formState.smtp.password}
                onChange={handlePasswordChange}
                placeholder={formState.smtp.hasPassword ? '••••••' : t('tenantSettings.smtp_password_placeholder')}
                className={`${FIELD_INPUT_WITH_MARGIN_CLASS} disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
              />
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {secretFlags.smtpPassword
                    ? t('tenantSettings.smtp_password_will_clear')
                    : secretEditState.smtpPassword
                      ? t('tenantSettings.smtp_password_will_save')
                      : formState.smtp.hasPassword
                        ? t('tenantSettings.smtp_password_kept')
                      : t('tenantSettings.smtp_password_empty')}
                </span>
                <div className="flex items-center gap-3">
                  {secretEditState.smtpPassword ? (
                    <button
                      type="button"
                      onClick={cancelSmtpPasswordEdit}
                      className="font-medium text-gray-600 hover:text-gray-500"
                    >
                      {t('common.cancel')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startSmtpPasswordEdit}
                      className="font-medium text-blue-600 hover:text-blue-500"
                    >
                      {formState.smtp.hasPassword ? t('tenantSettings.smtp_password_change') : t('tenantSettings.smtp_password_add')}
                    </button>
                  )}
                  {(formState.smtp.hasPassword || secretEditState.smtpPassword || secretFlags.smtpPassword) && (
                    <button
                      type="button"
                      onClick={resetSmtpPassword}
                      className="font-medium text-blue-600 hover:text-blue-500"
                    >
                      {t('tenantSettings.smtp_password_clear')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('tenantSettings.branding_title')}</h2>
            <p className="text-sm text-gray-500">{t('tenantSettings.branding_desc')}</p>
          </div>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.site_name_label')}</label>
              <input
                type="text"
                value={formState.branding.siteName}
                onChange={handleInputChange('branding', 'siteName')}
                placeholder={t('tenantSettings.site_name_placeholder')}
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.logo_url_label')}</label>
              <input
                type="url"
                value={formState.branding.logoUrl}
                onChange={handleInputChange('branding', 'logoUrl')}
                placeholder="https://cdn.domain.com/logo.png"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.primary_color_label')}</label>
              <input
                type="text"
                value={formState.branding.primaryColor}
                onChange={handleInputChange('branding', 'primaryColor')}
                placeholder="#1D4ED8"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.secondary_color_label')}</label>
              <input
                type="text"
                value={formState.branding.secondaryColor}
                onChange={handleInputChange('branding', 'secondaryColor')}
                placeholder="#9333EA"
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">{t('tenantSettings.short_description_label')}</label>
              <textarea
                rows="3"
                value={formState.branding.description}
                onChange={handleInputChange('branding', 'description')}
                placeholder={t('tenantSettings.short_description_placeholder')}
                className={FIELD_INPUT_WITH_MARGIN_CLASS}
              />
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('tenantSettings.features_title')}</h2>
            <p className="text-sm text-gray-500">{t('tenantSettings.features_desc')}</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {Object.keys(formState.features).length === 0 ? (
              <div className="text-sm text-gray-500">{t('tenantSettings.features_empty')}</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(formState.features).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{key}</p>
                      <p className="text-xs text-gray-500">{t('tenantSettings.feature_hint')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <span>{value ? t('status.active') : t('status.inactive')}</span>
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
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                placeholder={t('tenantSettings.feature_key_placeholder')}
                value={featureKeyInput}
                onChange={(event) => setFeatureKeyInput(event.target.value)}
                className={FIELD_INPUT_CLASS}
              />
              <button
                type="button"
                onClick={handleAddFeature}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                {t('tenantSettings.add_feature')}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('tenantSettings.metadata_title')}</h2>
            <p className="text-sm text-gray-500">{t('tenantSettings.metadata_desc')}</p>
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
                {t('tenantSettings.metadata_valid')}
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">{t('tenantSettings.metadata_empty_hint')}</p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              {t('tenantSettings.metadata_example', { example: '{ "defaultLocale": "tr-TR", "theme": "dark" }' })}
            </p>
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
            {t('tenantSettings.reset')}
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending || Boolean(metadataError)}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {updateMutation.isPending ? t('common.saving') : t('tenantSettings.save')}
          </button>
        </div>
      </form>

    </div>
  )
}
