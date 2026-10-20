import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import { useApiError } from '../../lib/useApiError.js'

export default function WebhookDeliveries({ tenantId, userId }) {
  const { t } = useTranslation()
  const toast = useToast()
  const describeError = useApiError()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['webhook-deliveries', tenantId, userId],
    queryFn: () => tenantAPI.getWebhookDeliveries(tenantId), enabled: Boolean(tenantId), refetchInterval: 10000 })
  const replay = useMutation({ mutationFn: (id) => tenantAPI.replayWebhookDelivery(tenantId, id),
    onSuccess: () => {
      toast.success(t('tenantWebhooks.bulk_retried', { count: 1 }))
      client.invalidateQueries({ queryKey: ['webhook-deliveries', tenantId] })
      client.invalidateQueries({ queryKey: ['tenant-webhook-queue', tenantId] })
    }, onError: (error) => toast.error(describeError(error, 'tenantWebhooks.action_failed')) })
  return <section className="rounded-lg border border-gray-200 bg-white p-4 shadow">
    <div className="flex items-center justify-between">
      <h2 className="font-semibold text-gray-900">{t('tenantWebhooks.delivery_history')}</h2>
      <button type="button" onClick={() => query.refetch()} className="text-sm text-blue-600">{t('common.refresh')}</button>
    </div>
    {query.isError && <p className="mt-3 text-sm text-red-600">{t('tenantWebhooks.queue_error')}</p>}
    {query.isLoading && <p className="mt-3 text-sm text-gray-500">{t('tenantWebhooks.queue_loading')}</p>}
    {query.data?.items?.length === 0 && <p className="mt-3 text-sm text-gray-500">{t('tenantWebhooks.no_deliveries')}</p>}
    <div className="mt-3 max-h-[36rem] space-y-3 overflow-y-auto">
      {(query.data?.items || []).map((item) => <details key={item.id} className="rounded-md border border-gray-200 p-3">
        <summary className="cursor-pointer text-sm text-gray-800">
          {item.type} · {item.status} · HTTP {item.lastHttpStatus ?? '—'} · {item.lastDurationMs ?? '—'} ms
        </summary>
        <p className="mt-2 break-all text-xs text-gray-500">{item.eventId} · {item.webhookId}</p>
        {item.lastError && <p className="mt-2 text-sm text-red-600">{item.lastError}</p>}
        {item.nextRetryAt && <p className="mt-2 text-xs text-gray-500">{t('tenantWebhooks.next_attempt', { date: new Date(item.nextRetryAt).toLocaleString() })}</p>}
        {(item.attempts || []).map((attempt, index) => <div key={index} className="mt-3 border-t border-gray-100 pt-2">
          <p className="text-xs text-gray-600">{new Date(attempt.at).toLocaleString()} · HTTP {attempt.status ?? '—'} · {attempt.durationMs} ms</p>
          {attempt.requestBody && <><p className="mt-2 text-xs font-medium">{t('tenantWebhooks.request_preview')}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-xs">{attempt.requestBody}</pre></>}
          {attempt.responseBody && <><p className="mt-2 text-xs font-medium">{t('tenantWebhooks.response_preview')}</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-xs">{attempt.responseBody}</pre></>}
        </div>)}
        <button type="button" disabled={replay.isLoading || !['done', 'failed', 'dead'].includes(item.status)} onClick={() => replay.mutate(item.id)} className="mt-3 rounded border border-blue-300 px-3 py-1 text-sm text-blue-700 disabled:opacity-40">{t('tenantWebhooks.replay')}</button>
      </details>)}
    </div>
  </section>
}
