import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApiTokens, createApiToken, deleteApiToken } from '../lib/api/apiTokens.js'
import { KeyIcon, TrashIcon, ClipboardDocumentIcon, CheckIcon, PlusIcon } from '@heroicons/react/24/outline'

export default function ApiTokenManager() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenRole, setNewTokenRole] = useState('editor')
  const [newTokenScopes, setNewTokenScopes] = useState(['read'])
  const [newTokenExpires, setNewTokenExpires] = useState(90)
  const [createdToken, setCreatedToken] = useState(null)
  const [copiedTokenId, setCopiedTokenId] = useState(null)
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  // Fetch API tokens
  const tokensQuery = useQuery({
    queryKey: ['api-tokens'],
    queryFn: fetchApiTokens,
    staleTime: 30000,
  })

  // Create token mutation
  const createTokenMutation = useMutation({
    mutationFn: createApiToken,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
      setCreatedToken(data.token)
      setNewTokenName('')
      setNewTokenRole('editor')
      setNewTokenScopes(['read'])
      setNewTokenExpires(90)
      setFeedback({ type: 'success', message: 'API token başarıyla oluşturuldu!' })
    },
    onError: (error) => {
      const apiMessage = error?.response?.data?.message || error?.response?.data?.error
      setFeedback({ type: 'error', message: apiMessage || 'Token oluşturulamadı.' })
    }
  })

  // Delete token mutation
  const deleteTokenMutation = useMutation({
    mutationFn: deleteApiToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
      setFeedback({ type: 'success', message: 'API token başarıyla silindi!' })
    },
    onError: (error) => {
      const apiMessage = error?.response?.data?.message || error?.response?.data?.error
      setFeedback({ type: 'error', message: apiMessage || 'Token silinemedi.' })
    }
  })

  const handleCreateToken = () => {
    if (!newTokenName.trim()) {
      setFeedback({ type: 'error', message: 'Token adı gereklidir.' })
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
    setNewTokenRole('editor')
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
    if (!dateString) return 'Süresiz'
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
            <h2 className="text-lg font-semibold text-gray-900">API Token Yönetimi</h2>
            <p className="text-sm text-gray-500">
              Uygulamalarınızın API'ye erişmesi için tokenlar oluşturun. Content as a Service olarak içeriklerinizi sunabilirsiniz.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Yeni Token
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
          <div className="text-center py-8 text-gray-500">Tokenlar yükleniyor...</div>
        ) : tokensQuery.isError ? (
          <div className="text-center py-8 text-red-600">Tokenlar yüklenirken hata oluştu.</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-12">
            <KeyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Henüz token yok</h3>
            <p className="mt-1 text-sm text-gray-500">
              Başlamak için yeni bir API token oluşturun.
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
                          {token.role || 'editor'}
                        </span>
                        <span>Scopes: {token.scopes.join(', ')}</span>
                        <span>•</span>
                        <span>Son kullanım: {token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Hiç kullanılmadı'}</span>
                        <span>•</span>
                        <span>Süre: {formatDate(token.expiresAt)}</span>
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
                        Kopyalandı
                      </>
                    ) : (
                      <>
                        <ClipboardDocumentIcon className="h-3 w-3" />
                        ID Kopyala
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Bu tokeni silmek istediğinize emin misiniz?')) {
                        deleteTokenMutation.mutate(token.id)
                      }
                    }}
                    disabled={deleteTokenMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <TrashIcon className="h-3 w-3" />
                    Sil
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
                  {createdToken ? 'Token Oluşturuldu' : 'Yeni API Token'}
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
                          <h3 className="text-sm font-medium text-yellow-800">Önemli Uyarı!</h3>
                          <div className="mt-2 text-sm text-yellow-700">
                            <p>Bu tokeni güvenli bir yerde saklayın. Tekrar görüntüleyemezsiniz!</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Token
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
                              Kopyalandı
                            </>
                          ) : (
                            <>
                              <ClipboardDocumentIcon className="h-4 w-4" />
                              Kopyala
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                      <div>
                        <p className="text-xs text-gray-500">Token Adı</p>
                        <p className="text-sm font-medium text-gray-900">{createdToken.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Role</p>
                        <p className="text-sm font-medium text-gray-900">
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                            {createdToken.role || 'editor'}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Scopes</p>
                        <p className="text-sm font-medium text-gray-900">{createdToken.scopes.join(', ')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Oluşturulma</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(createdToken.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Süre Bitişi</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(createdToken.expiresAt)}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Token Adı *
                      </label>
                      <input
                        type="text"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        placeholder="Örn: Production App"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role *
                      </label>
                      <select
                        value={newTokenRole}
                        onChange={(e) => setNewTokenRole(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
                      >
                        <option value="viewer">Viewer - Sadece okuma</option>
                        <option value="author">Author - Kendi içeriklerini yönetir</option>
                        <option value="editor">Editor - Tüm içerikleri yönetir (Önerilen)</option>
                        <option value="admin">Admin - Yönetim yetkisi</option>
                        <option value="owner">Owner - Tam yetki</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Migration işlemleri için <strong>Editor</strong> rolü önerilir.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        İzinler (Scopes)
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
                            <span className="ml-2 text-sm text-gray-700 capitalize">{scope}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Geçerlilik Süresi (Gün)
                      </label>
                      <select
                        value={newTokenExpires}
                        onChange={(e) => setNewTokenExpires(Number(e.target.value))}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
                      >
                        <option value={30}>30 Gün</option>
                        <option value={90}>90 Gün</option>
                        <option value={180}>180 Gün</option>
                        <option value={365}>1 Yıl</option>
                        <option value={0}>Sınırsız</option>
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
                  {createdToken ? 'Kapat' : 'İptal'}
                </button>
                {!createdToken && (
                  <button
                    type="button"
                    onClick={handleCreateToken}
                    disabled={createTokenMutation.isPending || !newTokenName.trim() || newTokenScopes.length === 0}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createTokenMutation.isPending ? 'Oluşturuluyor...' : 'Token Oluştur'}
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
