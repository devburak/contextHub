import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import TenantTabs from '../../components/TenantTabs.jsx'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { useApiError } from '../../lib/useApiError.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'

const DEFAULT_VALUES = {
  url: '',
  isActive: true,
  events: ['*'],
  secret: ''
}

function SecretPreview({ secret, onClose }) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!secret) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [secret])

  if (!secret) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 overflow-y-auto p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">{t('tenantWebhooks.secret_title')}</h3>
        <p className="mt-2 text-sm text-gray-600">
          {t('tenantWebhooks.secret_desc')}
        </p>
        <div className="mt-4 rounded-md bg-gray-100 p-3 font-mono text-sm break-all">{secret}</div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            {t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}

function WebhookFormModal({ isOpen, mode, initialData, availableEventTypes, onClose, onSubmit, isSubmitting }) {
  const { register, handleSubmit, reset, watch, setValue } = useForm({ defaultValues: DEFAULT_VALUES })
  const { t } = useTranslation()

  useEffect(() => {
    if (isOpen) {
      reset({
        ...DEFAULT_VALUES,
        ...initialData,
        events: initialData?.events && initialData.events.length ? initialData.events : ['*'],
        secret: initialData?.secret || ''
      })
    }
  }, [isOpen, initialData, reset])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const selectedEventsRaw = watch('events')
  const selectedEvents = Array.isArray(selectedEventsRaw) ? selectedEventsRaw : ['*']
  const listensAll = selectedEvents.includes('*')
  const hasCustomEvents = !listensAll && selectedEvents.length > 0
  const isEventSelectionValid = listensAll || hasCustomEvents

  const toggleAllEvents = () => {
    if (listensAll) {
      setValue('events', [])
      return
    }
    setValue('events', ['*'])
  }

  const toggleEvent = (eventType) => () => {
    const next = new Set(listensAll ? [] : selectedEvents)
    if (next.has(eventType)) {
      next.delete(eventType)
    } else {
      next.add(eventType)
    }
    setValue('events', Array.from(next))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 overflow-y-auto p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === 'edit' ? t('tenantWebhooks.edit_title') : t('tenantWebhooks.create_title')}
          </h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            {t('common.close')}
          </button>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('tenantWebhooks.url_label')}</label>
            <input
              type="url"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="https://example.com/webhook"
              {...register('url', { required: true })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('tenantWebhooks.active_label')}</label>
            <div className="mt-2 flex items-center space-x-2">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" {...register('isActive')} />
              <span className="text-sm text-gray-600">{t('tenantWebhooks.active_hint')}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('tenantWebhooks.events_label')}</label>
            <p className="mt-1 text-xs text-gray-500">{t('tenantWebhooks.events_hint')}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center space-x-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={listensAll}
                  onChange={toggleAllEvents}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{t('tenantWebhooks.all_events_option')}</span>
              </label>
              {availableEventTypes.map((eventType) => (
                <label key={eventType} className="flex cursor-pointer items-center space-x-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(eventType)}
                    onChange={toggleEvent(eventType)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{eventType}</span>
                </label>
              ))}
            </div>
            {!isEventSelectionValid && (
              <p className="mt-2 text-sm text-red-600">{t('tenantWebhooks.events_required')}</p>
            )}
          </div>

          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('tenantWebhooks.secret_optional_label')}</label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={t('tenantWebhooks.secret_placeholder')}
                {...register('secret')}
              />
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TenantWebhooks() {
  const { activeMembership } = useAuth()
  const tenantId = activeMembership?.tenantId
  const queryClient = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  const describeError = useApiError()

  const [modalState, setModalState] = useState({ open: false, mode: 'create', webhook: null })
  const [secretPreview, setSecretPreview] = useState(null)

  const webhooksQuery = useQuery({
    queryKey: ['tenant-webhooks', tenantId],
    queryFn: () => tenantAPI.getWebhooks(tenantId),
    enabled: Boolean(tenantId)
  })

  const queueQuery = useQuery({
    queryKey: ['tenant-webhook-queue', tenantId],
    queryFn: () => tenantAPI.getWebhookQueue(tenantId, { limit: 20 }),
    enabled: Boolean(tenantId)
  })

  const availableEventTypes = useMemo(() => webhooksQuery.data?.availableEventTypes || [], [webhooksQuery.data])
  const webhooks = webhooksQuery.data?.webhooks || []
  const queueData = queueQuery.data
  const pendingDomainEvents = queueData?.domainEvents?.items || []
  const pendingOutboxItems = queueData?.outbox?.pendingItems || []
  const failedOutboxItems = queueData?.outbox?.failedItems || []
  const deadOutboxItems = queueData?.outbox?.deadItems || []
  const formatDateTime = (value) => {
    if (!value) return '-'
    try {
      return new Date(value).toLocaleString('tr-TR')
    } catch (error) {
      return '-'
    }
  }

  const openCreateModal = () => setModalState({ open: true, mode: 'create', webhook: null })
  const openEditModal = (webhook) => setModalState({ open: true, mode: 'edit', webhook })
  const closeModal = () => setModalState({ open: false, mode: 'create', webhook: null })

  const createMutation = useMutation({
    mutationFn: (payload) => tenantAPI.createWebhook(tenantId, payload),
    onSuccess: ({ webhook, secret }) => {
      toast.success(t('tenantWebhooks.created'))
      setSecretPreview(secret)
      queryClient.invalidateQueries({ queryKey: ['tenant-webhooks', tenantId] })
      closeModal()
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenantWebhooks.create_failed'))
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => tenantAPI.updateWebhook(tenantId, id, payload),
    onSuccess: () => {
      toast.success(t('tenantWebhooks.updated'))
      queryClient.invalidateQueries({ queryKey: ['tenant-webhooks', tenantId] })
      closeModal()
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenantWebhooks.update_failed'))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => tenantAPI.deleteWebhook(tenantId, id),
    onSuccess: () => {
      toast.success(t('tenantWebhooks.deleted'))
      queryClient.invalidateQueries({ queryKey: ['tenant-webhooks', tenantId] })
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenantWebhooks.delete_failed'))
    }
  })

  const rotateMutation = useMutation({
    mutationFn: (id) => tenantAPI.rotateWebhookSecret(tenantId, id),
    onSuccess: ({ secret }) => {
      toast.success(t('tenantWebhooks.secret_rotated'))
      setSecretPreview(secret)
      queryClient.invalidateQueries({ queryKey: ['tenant-webhooks', tenantId] })
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenantWebhooks.secret_rotate_failed'))
    }
  })

  const handleDelete = (webhook) => {
    if (!webhook) return
    if (window.confirm(t('tenantWebhooks.delete_confirm'))) {
      deleteMutation.mutate(webhook.id)
    }
  }

  const handleRotateSecret = (webhook) => {
    if (!webhook) return
    if (window.confirm(t('tenantWebhooks.rotate_confirm'))) {
      rotateMutation.mutate(webhook.id)
    }
  }

  const handleSubmit = (values) => {
    const eventsArray = Array.isArray(values.events) ? values.events : ['*']
    const normalizedEvents = eventsArray.includes('*') ? ['*'] : eventsArray.filter(Boolean)

    if (!normalizedEvents.length) {
      toast.error(t('tenantWebhooks.events_required'))
      return
    }

    const payload = {
      url: values.url,
      isActive: values.isActive,
      events: normalizedEvents,
      secret: values.secret
    }

    if (modalState.mode === 'edit' && modalState.webhook) {
      updateMutation.mutate({ id: modalState.webhook.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const triggerMutation = useMutation({
    mutationFn: () => tenantAPI.triggerTenantWebhooks(tenantId, {}),
    onSuccess: (result) => {
      const eventsProcessed = result?.result?.eventsResult?.processed ?? 0
      const webhooksDispatched = result?.result?.dispatchResult?.processed ?? 0
      const retried = result?.result?.retryResult?.retried ?? 0
      toast.success(
        t('tenantWebhooks.queue_triggered', {
          events: eventsProcessed,
          webhooks: webhooksDispatched,
          retried
        })
      )
      queueQuery.refetch()
      if (eventsProcessed || webhooksDispatched || retried) {
        queryClient.invalidateQueries({ queryKey: ['tenant-webhooks', tenantId] })
      }
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenantWebhooks.queue_trigger_failed'))
    }
  })

  const testMutation = useMutation({
    mutationFn: ({ id }) => tenantAPI.sendTestWebhook(tenantId, id),
    onSuccess: () => {
      toast.success(t('tenantWebhooks.test_sent'))
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenantWebhooks.test_failed'))
    }
  })

  const bulkRetryAllMutation = useMutation({
    mutationFn: () => tenantAPI.bulkRetryAllFailed(tenantId),
    onSuccess: (result) => {
      toast.success(t('tenantWebhooks.bulk_retried', { count: result.retried ?? 0 }))
      queueQuery.refetch()
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenantWebhooks.action_failed'))
    }
  })

  const bulkDeleteAllMutation = useMutation({
    mutationFn: () => tenantAPI.bulkDeleteAllFailed(tenantId),
    onSuccess: (result) => {
      toast.success(t('tenantWebhooks.bulk_deleted', { count: result.deleted ?? 0 }))
      queueQuery.refetch()
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenantWebhooks.action_failed'))
    }
  })

  const handleManualTrigger = () => {
    triggerMutation.mutate()
  }

  const handleTestWebhook = (webhook) => {
    if (!webhook) return
    testMutation.mutate({ id: webhook.id })
  }

  const refreshQueue = () => queueQuery.refetch()

  const handleBulkRetryAll = () => {
    if (window.confirm(t('tenantWebhooks.bulk_retry_confirm'))) {
      bulkRetryAllMutation.mutate()
    }
  }

  const handleBulkDeleteAll = () => {
    if (window.confirm(t('tenantWebhooks.bulk_delete_confirm'))) {
      bulkDeleteAllMutation.mutate()
    }
  }

  const isTestingWebhook = (webhookId) => testMutation.isPending && testMutation.variables?.id === webhookId

  return (
    <div className="space-y-6">
      <TenantTabs active="webhooks" />
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('tenantWebhooks.title')}</h1>
        <p className="mt-1 text-sm text-gray-600">
          <Trans
            i18nKey="tenantWebhooks.description"
            components={{ code: <code className="rounded bg-gray-100 px-1 py-0.5" /> }}
          />
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('tenantWebhooks.queue_title')}</h2>
            <p className="text-sm text-gray-600">{t('tenantWebhooks.queue_desc')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshQueue}
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('common.refresh')}
            </button>
            <button
              type="button"
              onClick={handleManualTrigger}
              disabled={triggerMutation.isPending}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {triggerMutation.isPending ? t('tenantWebhooks.running') : t('tenantWebhooks.run_pending')}
            </button>
            {((queueData?.outbox?.totalFailed ?? 0) > 0 || (queueData?.outbox?.totalDead ?? 0) > 0) && (
              <>
                <button
                  type="button"
                  onClick={handleBulkRetryAll}
                  disabled={bulkRetryAllMutation.isPending}
                  className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
                >
                  {bulkRetryAllMutation.isPending ? t('tenantWebhooks.processing') : t('tenantWebhooks.retry_all')}
                </button>
                <button
                  type="button"
                  onClick={handleBulkDeleteAll}
                  disabled={bulkDeleteAllMutation.isPending}
                  className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
                >
                  {bulkDeleteAllMutation.isPending ? t('common.deleting') : t('tenantWebhooks.delete_failed_jobs')}
                </button>
              </>
            )}
          </div>
        </div>
        {queueQuery.isError ? (
          <div className="px-4 py-6 text-sm text-red-500">{t('tenantWebhooks.queue_error')}</div>
        ) : queueQuery.isLoading ? (
          <div className="px-4 py-6 text-sm text-gray-500">{t('tenantWebhooks.queue_loading')}</div>
        ) : (
          <div className="grid gap-6 px-4 py-6 lg:grid-cols-2">
            <div className="rounded-md border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t('tenantWebhooks.domain_events')}</p>
                  <p className="text-xs text-gray-500">{t('tenantWebhooks.pending_event_count')}</p>
                </div>
                <span className="text-xl font-semibold text-gray-900">{queueData?.domainEvents?.totalPending ?? 0}</span>
              </div>
              <div className="mt-4 max-h-60 space-y-3 overflow-y-auto">
                {pendingDomainEvents.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('tenantWebhooks.no_pending_events')}</p>
                ) : (
                  pendingDomainEvents.map((item) => (
                    <div key={item.id || item.occurredAt} className="rounded-md border border-gray-100 p-3">
                      <p className="text-sm font-medium text-gray-900">{item.type}</p>
                      <p className="text-xs text-gray-500">
                        {t('tenantWebhooks.created_at_retry', {
                          date: formatDateTime(item.createdAt),
                          count: item.retryCount ?? 0
                        })}
                      </p>
                      {item.lastError && (
                        <p className="mt-1 text-xs text-red-500">
                          {t('tenantWebhooks.error_prefix', { message: item.lastError })}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-md border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t('tenantWebhooks.outbox')}</p>
                  <p className="text-xs text-gray-500">{t('tenantWebhooks.outbox_desc')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold text-gray-900">{queueData?.outbox?.totalPending ?? 0}</p>
                  {(queueData?.outbox?.totalFailed ?? 0) > 0 && (
                    <p className="text-xs font-semibold text-amber-600">
                      {t('tenantWebhooks.failed_count', { count: queueData?.outbox?.totalFailed ?? 0 })}
                    </p>
                  )}
                  {(queueData?.outbox?.totalDead ?? 0) > 0 && (
                    <p className="text-xs font-semibold text-red-600">
                      {t('tenantWebhooks.dead_count', { count: queueData?.outbox?.totalDead ?? 0 })}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                    <span>{t('tenantWebhooks.pending_jobs')}</span>
                    <span>{pendingOutboxItems.length}</span>
                  </div>
                  <div className="mt-2 max-h-40 space-y-3 overflow-y-auto">
                    {pendingOutboxItems.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('tenantWebhooks.no_pending_jobs')}</p>
                    ) : (
                      pendingOutboxItems.map((item) => (
                        <div key={item.id || item.eventId} className="rounded-md border border-gray-100 p-3">
                          <p className="text-sm font-medium text-gray-900">{item.type}</p>
                          <p className="text-xs text-gray-500">
                            {t('tenantWebhooks.created_at_retry', {
                              date: formatDateTime(item.createdAt),
                              count: item.retryCount ?? 0
                            })}
                          </p>
                          {item.lastError && (
                            <p className="mt-1 text-xs text-red-500">
                              {t('tenantWebhooks.last_error_prefix', { message: item.lastError })}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-amber-600">
                    <span>{t('tenantWebhooks.failed_jobs')}</span>
                    <span>{failedOutboxItems.length}</span>
                  </div>
                  <div className="mt-2 max-h-40 space-y-3 overflow-y-auto">
                    {failedOutboxItems.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('tenantWebhooks.no_failed_jobs')}</p>
                    ) : (
                      failedOutboxItems.map((item) => (
                        <div key={item.id || item.eventId} className="rounded-md border border-amber-100 bg-amber-50/60 p-3">
                          <p className="text-sm font-medium text-amber-800">{item.type}</p>
                          <p className="text-xs text-amber-700">
                            {t('tenantWebhooks.last_attempt_retry', {
                              date: formatDateTime(item.updatedAt),
                              count: item.retryCount ?? 0
                            })}
                            {item.errorType && (
                              <span className="ml-1">{t('tenantWebhooks.error_type_suffix', { type: item.errorType })}</span>
                            )}
                            {item.lastHttpStatus && (
                              <span className="ml-1">{t('tenantWebhooks.http_status_suffix', { status: item.lastHttpStatus })}</span>
                            )}
                          </p>
                          {item.nextRetryAt && (
                            <p className="text-xs text-amber-600">
                              {t('tenantWebhooks.next_attempt', { date: formatDateTime(item.nextRetryAt) })}
                            </p>
                          )}
                          {item.lastError && (
                            <p className="mt-1 text-xs text-amber-600">
                              {t('tenantWebhooks.error_prefix', { message: item.lastError })}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-red-700">
                    <span>{t('tenantWebhooks.dead_jobs')}</span>
                    <span>{deadOutboxItems.length}</span>
                  </div>
                  <div className="mt-2 max-h-40 space-y-3 overflow-y-auto">
                    {deadOutboxItems.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('tenantWebhooks.no_dead_jobs')}</p>
                    ) : (
                      deadOutboxItems.map((item) => (
                        <div key={item.id || item.eventId} className="rounded-md border border-red-200 bg-red-50 p-3">
                          <p className="text-sm font-medium text-red-900">{item.type}</p>
                          <p className="text-xs text-red-700">
                            {t('tenantWebhooks.last_attempt_retry', {
                              date: formatDateTime(item.updatedAt),
                              count: item.retryCount ?? 0
                            })}
                            {item.errorType && (
                              <span className="ml-1">{t('tenantWebhooks.error_type_suffix', { type: item.errorType })}</span>
                            )}
                            {item.lastHttpStatus && (
                              <span className="ml-1">{t('tenantWebhooks.http_status_suffix', { status: item.lastHttpStatus })}</span>
                            )}
                          </p>
                          {item.lastError && (
                            <p className="mt-1 text-xs text-red-600">
                              {t('tenantWebhooks.error_prefix', { message: item.lastError })}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {t('tenantWebhooks.create_title')}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
        {webhooksQuery.isLoading ? (
          <div className="p-6 text-sm text-gray-500">{t('tenantWebhooks.loading')}</div>
        ) : webhooks.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">{t('tenantWebhooks.empty')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('tenantWebhooks.col_url')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('tenantWebhooks.col_active')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('tenantWebhooks.col_events')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {webhooks.map((webhook) => (
                <tr key={webhook.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{webhook.url}</td>
                  <td className="px-4 py-3 text-sm">
                    {webhook.isActive ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold text-green-800">{t('status.active')}</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-600">{t('status.inactive')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {webhook.events.includes('*') ? t('tenantWebhooks.all_events') : webhook.events.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(webhook)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestWebhook(webhook)}
                        disabled={isTestingWebhook(webhook.id)}
                        className="rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                      >
                        {isTestingWebhook(webhook.id) ? t('tenantWebhooks.testing') : t('tenantWebhooks.send_test')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRotateSecret(webhook)}
                        className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50"
                      >
                        {t('tenantWebhooks.rotate_secret')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(webhook)}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <WebhookFormModal
        isOpen={modalState.open}
        mode={modalState.mode}
        initialData={modalState.webhook}
        onClose={closeModal}
        onSubmit={handleSubmit}
        availableEventTypes={availableEventTypes}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
      <SecretPreview secret={secretPreview} onClose={() => setSecretPreview(null)} />
    </div>
  )
}
