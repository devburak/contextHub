import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { fetchApiTokens, createApiToken, deleteApiToken } from '../lib/api/apiTokens.js'
import { useApiError } from '../lib/useApiError.js'
import { KeyIcon, TrashIcon, ClipboardDocumentIcon, CheckIcon, PlusIcon } from '@heroicons/react/24/outline'

const ROLE_OPTIONS = [
  { value: 'viewer', labelKey: 'apiToken.role_viewer' },
  { value: 'author', labelKey: 'apiToken.role_author' },
  { value: 'editor', labelKey: 'apiToken.role_editor' },
  { value: 'admin', labelKey: 'apiToken.role_admin' },
  { value: 'owner', labelKey: 'apiToken.role_owner' }
]

const ROLE_BADGE_LABEL_KEYS = {
  viewer: 'role.viewer',
  author: 'role.author',
  editor: 'role.editor',
  admin: 'role.admin',
  owner: 'role.owner'
}

const SCOPE_LABEL_KEYS = {
  read: 'apiToken.scope_read',
  write: 'apiToken.scope_write',
  delete: 'apiToken.scope_delete'
}

export default function ApiTokenManager({ tenantId }) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const describeError = useApiError()
  const [showModal, setShowModal] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenRole, setNewTokenRole] = useState('viewer')
  const [newTokenScopes, setNewTokenScopes] = useState(['read'])
  const [newTokenExpires, setNewTokenExpires] = useState(90)
  const [createdToken, setCreatedToken] = useState(null)
  const [copiedTokenId, setCopiedTokenId] = useState(null)
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const apiTokensQueryKey = ['api-tokens', { tenant: tenantId }]

  useEffect(() => {
    setShowModal(false)
    setCreatedToken(null)
    setCopiedTokenId(null)
    setFeedback({ type: '', message: '' })
  }, [tenantId])

  // Fetch API tokens
  const tokensQuery = useQuery({
    queryKey: apiTokensQueryKey,
    queryFn: fetchApiTokens,
    enabled: Boolean(tenantId),
    staleTime: 30000,
  })

  // Create token mutation
  const createTokenMutation = useMutation({
    mutationFn: createApiToken,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: apiTokensQueryKey })
      setCreatedToken(data.token)
      setNewTokenName('')
      setNewTokenRole('viewer')
      setNewTokenScopes(['read'])
      setNewTokenExpires(90)
      setFeedback({ type: 'success', message: t('apiToken.create_success') })
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: describeError(error, 'apiToken.create_failed') })
    }
  })

  // Delete token mutation
  const deleteTokenMutation = useMutation({
    mutationFn: deleteApiToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiTokensQueryKey })
      setFeedback({ type: 'success', message: t('apiToken.delete_success') })
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: describeError(error, 'apiToken.delete_failed') })
    }
  })

  const handleCreateToken = () => {
    if (!newTokenName.trim()) {
      setFeedback({ type: 'error', message: t('apiToken.name_required') })
      return
    }
    createTokenMutation.mutate({
      name: newTokenName.trim(),
      role: newTokenRole,
      scopes: newTokenScopes,
      expiresInDays: newTokenExpires,
    })
  }

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token.token || token.id)
    setCopiedTokenId(token.id)
    setTimeout(() => setCopiedTokenId(null), 2000)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setCreatedToken(null)
    setNewTokenName('')
    setNewTokenRole('viewer')
    setNewTokenScopes(['read'])
    setNewTokenExpires(90)
    setFeedback({ type: '', message: '' })
  }

  const handleToggleScope = (scope) => {
    setNewTokenScopes(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    )
  }

  const formatDate = (dateString) => {
    if (!dateString) return t('apiToken.never_expires')
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const tokens = tokensQuery.data?.tokens || []

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('apiToken.title')}</h2>
            <p className="text-sm text-gray-500">
              {t('apiToken.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            {t('apiToken.new')}
          </button>
        </div>
      </div>

      <div className="px-6 py-5">
        {feedback.message && (
          <div
            className={`mb-4 rounded-md px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {tokensQuery.isLoading ? (
          <div className="text-center py-8 text-gray-500">{t('apiToken.loading')}</div>
        ) : tokensQuery.isError ? (
          <div className="text-center py-8 text-red-600">{describeError(tokensQuery.error, 'apiToken.load_failed')}</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-12">
            <KeyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">{t('apiToken.empty_title')}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {t('apiToken.empty_hint')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <KeyIcon className="h-5 w-5 text-gray-400" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{token.name}</h4>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                          {t(ROLE_BADGE_LABEL_KEYS[token.role] || ROLE_BADGE_LABEL_KEYS.viewer)}
                        </span>
                        <span>{t('apiToken.scopes_summary', { scopes: token.scopes.join(', ') })}</span>
                        <span>•</span>
                        <span>{t('apiToken.last_used', { date: token.lastUsedAt ? formatDate(token.lastUsedAt) : t('apiToken.never_used') })}</span>
                        <span>•</span>
                        <span>{t('apiToken.expires', { date: formatDate(token.expiresAt) })}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyToken(token)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    {copiedTokenId === token.id ? (
                      <>
                        <CheckIcon className="h-3 w-3 text-green-600" />
                        {t('common.copied')}
                      </>
                    ) : (
                      <>
                        <ClipboardDocumentIcon className="h-3 w-3" />
                        {t('apiToken.copy_id')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(t('apiToken.delete_confirm'))) {
                        deleteTokenMutation.mutate(token.id)
                      }
                    }}
                    disabled={deleteTokenMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <TrashIcon className="h-3 w-3" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Token Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleCloseModal}></div>

            <div className="relative w-full max-w-lg transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
              <div className="bg-white px-6 py-5 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">
                  {createdToken ? t('apiToken.created_title') : t('apiToken.create_title')}
                </h3>
              </div>

              <div className="px-6 py-6 space-y-4">
                {createdToken ? (
                  <>
                    <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-yellow-800">{t('apiToken.warning_title')}</h3>
                          <div className="mt-2 text-sm text-yellow-700">
                            <p>{t('apiToken.warning_body')}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('apiToken.token_label')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={createdToken.token}
                          readOnly
                          className="flex-1 block w-full rounded-md border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyToken(createdToken)}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                        >
                          {copiedTokenId === createdToken.id ? (
                            <>
                              <CheckIcon className="h-4 w-4" />
                              {t('common.copied')}
                            </>
                          ) : (
                            <>
                              <ClipboardDocumentIcon className="h-4 w-4" />
                              {t('common.copy')}
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-gray-500">{t('apiToken.name_label')}</p>
                        <p className="text-sm font-medium text-gray-900">{createdToken.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('apiToken.role_label')}</p>
                        <p className="text-sm font-medium text-gray-900">
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                            {t(ROLE_BADGE_LABEL_KEYS[createdToken.role] || ROLE_BADGE_LABEL_KEYS.viewer)}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('apiToken.scopes_label')}</p>
                        <p className="text-sm font-medium text-gray-900">{createdToken.scopes.join(', ')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('common.created')}</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(createdToken.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('apiToken.expires_label')}</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(createdToken.expiresAt)}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('apiToken.name_label')} *
                      </label>
                      <input
                        type="text"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        placeholder={t('apiToken.name_placeholder')}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('apiToken.role_label')} *
                      </label>
                      <select
                        value={newTokenRole}
                        onChange={(e) => setNewTokenRole(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        <Trans
                          i18nKey="apiToken.role_hint"
                          values={{ role: 'Viewer', scope: 'read' }}
                          components={{ strong: <strong /> }}
                        />
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('apiToken.scopes_field_label')}
                      </label>
                      <div className="space-y-2">
                        {['read', 'write', 'delete'].map((scope) => (
                          <label key={scope} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={newTokenScopes.includes(scope)}
                              onChange={() => handleToggleScope(scope)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-gray-700 capitalize">{t(SCOPE_LABEL_KEYS[scope])}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('apiToken.expiry_label')}
                      </label>
                      <select
                        value={newTokenExpires}
                        onChange={(e) => setNewTokenExpires(Number(e.target.value))}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
                      >
                        <option value={30}>{t('apiToken.expiry_days', { count: 30 })}</option>
                        <option value={90}>{t('apiToken.expiry_days', { count: 90 })}</option>
                        <option value={180}>{t('apiToken.expiry_days', { count: 180 })}</option>
                        <option value={365}>{t('apiToken.expiry_one_year')}</option>
                        <option value={0}>{t('apiToken.expiry_unlimited')}</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  {createdToken ? t('common.close') : t('common.cancel')}
                </button>
                {!createdToken && (
                  <button
                    type="button"
                    onClick={handleCreateToken}
                    disabled={createTokenMutation.isPending || !newTokenName.trim() || newTokenScopes.length === 0}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createTokenMutation.isPending ? t('apiToken.creating') : t('apiToken.create_submit')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
