import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { userAPI } from '../../lib/userAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { CheckBadgeIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline'

const STATUS_STYLES = {
  active: {
    label: 'Aktif',
    className: 'bg-green-50 text-green-700 ring-green-200',
    icon: CheckBadgeIcon
  },
  pending: {
    label: 'Davet Bekliyor',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
    icon: ClockIcon
  },
  inactive: {
    label: 'Pasif',
    className: 'bg-gray-50 text-gray-600 ring-gray-200',
    icon: XCircleIcon
  }
}

export default function Tenants() {
  const toast = useToast()
  const { memberships, activeMembership, updateMemberships, selectTenant } = useAuth()

  // Görevi bırakma state'leri
  const [leavingMembership, setLeavingMembership] = useState(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [password, setPassword] = useState('')
  const [transferEmail, setTransferEmail] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const tenantsQuery = useQuery({
    queryKey: ['tenants', 'list'],
    queryFn: async () => {
      const { tenants } = await tenantAPI.getTenants({ includeTokens: true })
      updateMemberships(tenants)
      return tenants
    }
  })

  const acceptInvitationMutation = useMutation({
    mutationFn: (tenantId) => tenantAPI.acceptInvitation(tenantId),
    onSuccess: ({ membership, tenant, token }) => {
      toast.success('Davet başarıyla kabul edildi.')
      tenantsQuery.refetch()

      if (membership?.tenantId && token) {
        selectTenant({ ...membership, tenant, token })
      }
    },
    onError: (error) => {
      const message = error.response?.data?.message || 'Davet kabul edilirken hata oluştu.'
      toast.error(message)
    }
  })

  const handleLeaveMembership = (membership, hasOtherOwners) => {
    const isOwner = membership.role === 'owner'
    
    // Debug: ownerCount bilgisini logla
    console.log('handleLeaveMembership called:', {
      membershipId: membership.id,
      tenantName: membership.tenant?.name,
      role: membership.role,
      ownerCount: membership.ownerCount,
      hasOtherOwners,
      isOwner
    })
    
    // Eğer sahip değilse direkt şifre modal aç
    if (!isOwner) {
      setLeavingMembership(membership)
      setShowPasswordModal(true)
      return
    }
    
    // Eğer sahipse ve başka sahip varsa direkt şifre modal aç
    if (isOwner && hasOtherOwners) {
      console.log('Opening password modal - has other owners')
      setLeavingMembership(membership)
      setShowPasswordModal(true)
      return
    }
    
    // Eğer sahipse ve başka sahip yoksa transfer modal aç
    if (isOwner && !hasOtherOwners) {
      console.log('Opening transfer modal - sole owner')
      setLeavingMembership(membership)
      setShowTransferModal(true)
      return
    }
  }

  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      toast.error('Lütfen şifrenizi girin')
      return
    }

    setIsProcessing(true)
    try {
      // Şifre doğrulama ve üyelikten ayrılma
      await userAPI.leaveMembership(leavingMembership.id, { password })
      
      toast.success(`${leavingMembership.tenant?.name || 'Varlık'} üyeliğinden ayrıldınız`)
      
      // Veriyi yenile
      await tenantsQuery.refetch()
      
      // Modal'ı kapat ve state'i temizle
      closeModals()
    } catch (error) {
      const message = error?.response?.data?.message || 'İşlem başarısız oldu'
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleTransferSubmit = async () => {
    if (!transferEmail.trim()) {
      toast.error('Lütfen devredilecek kişinin e-posta adresini girin')
      return
    }

    if (!password.trim()) {
      toast.error('Lütfen şifrenizi girin')
      return
    }

    setIsProcessing(true)
    try {
      // Sahiplik devri talebi gönder
      await userAPI.requestOwnershipTransfer(leavingMembership.tenantId, {
        email: transferEmail,
        password
      })
      
      toast.success(`${transferEmail} adresine sahiplik devri talebi gönderildi`)
      
      // Liste yenilenmeli (transfer tamamlanınca ownerCount güncellenecek)
      tenantsQuery.refetch()
      
      // Modal'ı kapat ve state'i temizle
      closeModals()
    } catch (error) {
      const message = error?.response?.data?.message || 'İşlem başarısız oldu'
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const closeModals = () => {
    setShowPasswordModal(false)
    setShowTransferModal(false)
    setPassword('')
    setTransferEmail('')
    setLeavingMembership(null)
  }

  const tenantList = tenantsQuery.data ?? memberships

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Varlık Yönetimi</h1>
          <p className="mt-2 text-sm text-gray-600">
            Aktif olduğun varlıkları görüntüle ve rollerini incele. Yeni bir varlık eklemek için aşağıdaki butonu kullanabilirsin.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => tenantsQuery.refetch()}
            className="inline-flex items-center gap-x-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Yenile
          </button>
          <Link
            to="/varliklar/yeni"
            className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Yeni Varlık Ekle
          </Link>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Varlıklarım</h2>
        </div>
        <div className="p-6">
          {tenantsQuery.isLoading ? (
            <div className="text-gray-500">Varlık listesi yükleniyor...</div>
          ) : tenantsQuery.isError ? (
            <div className="text-red-600 text-sm">
              Varlık listesi alınırken bir hata oluştu. Lütfen tekrar deneyin.
            </div>
          ) : tenantList.length === 0 ? (
            <div className="text-gray-600 text-sm">Henüz herhangi bir varlık erişimin bulunmuyor.</div>
          ) : (
            <div className="space-y-4">
              {tenantList.map((membership) => {
                const isOwner = membership.role === 'owner'
                // Backend'den gelen ownerCount'u kullan
                const ownerCount = membership.ownerCount || 0
                const hasOtherOwners = isOwner && ownerCount > 1
                
                return (
                  <div
                    key={membership.tenantId || membership.id}
                    className={`border rounded-lg p-4 shadow-sm transition-colors ${
                      membership.tenantId === activeMembership?.tenantId
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {membership.tenant?.name || 'Adsız Varlık'}
                          </h3>
                          {isOwner && (
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                              Sahip
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{membership.tenant?.slug}</p>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <span className="text-sm font-medium text-gray-700">
                          Rol: {membership.role}
                        </span>
                        <span className="text-xs uppercase tracking-wide text-gray-500">
                          {membership.tenant?.plan || 'Free'} planı
                        </span>
                        {(() => {
                          const statusInfo = STATUS_STYLES[membership.status]
                          if (!statusInfo) return null
                          const Icon = statusInfo.icon
                          return (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusInfo.className}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {statusInfo.label}
                            </span>
                          )
                        })()}
                      </div>
                    </div>

                    {/* Görevi Bırak Butonu - Sadece aktif üyelikler için */}
                    {membership.status === 'active' && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            {isOwner && !hasOtherOwners && (
                              <p className="text-xs text-amber-700">
                                ⚠️ Tek sahipsiniz. Görevi bırakmak için önce sahiplik devretmelisiniz. (Toplam owner: {ownerCount})
                              </p>
                            )}
                            {isOwner && hasOtherOwners && (
                              <p className="text-xs text-gray-600">
                                {ownerCount} owner var. Sahipliğinizi bırakabilirsiniz.
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleLeaveMembership(membership, hasOtherOwners)}
                            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
                          >
                            Görevi Bırak
                          </button>
                        </div>
                      </div>
                    )}

                    {membership.status === 'pending' && (
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-gray-600">
                          Bu varlığa erişmek için daveti kabul etmeniz gerekiyor.
                        </p>
                        <button
                          type="button"
                          onClick={() => acceptInvitationMutation.mutate(membership.tenantId)}
                          disabled={acceptInvitationMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
                        >
                          {acceptInvitationMutation.isPending ? 'Kabul ediliyor...' : 'Daveti Kabul Et'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Şifre Doğrulama Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={closeModals}></div>
            
            <div className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
              <div className="bg-white px-6 py-5">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">Şifrenizi Onaylayın</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      <strong>{leavingMembership?.tenant?.name || 'Varlık'}</strong> üyeliğinden ayrılmak için şifrenizi girin.
                    </p>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700">Şifre</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                        placeholder="Mevcut şifreniz"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModals}
                  disabled={isProcessing}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handlePasswordSubmit}
                  disabled={isProcessing || !password.trim()}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {isProcessing ? 'İşleniyor...' : 'Görevi Bırak'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sahiplik Devri Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={closeModals}></div>
            
            <div className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
              <div className="bg-white px-6 py-5">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">Sahiplik Devri Talebi</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      <strong>{leavingMembership?.tenant?.name || 'Varlık'}</strong> varlığının tek sahibisiniz. 
                      Görevi bırakmadan önce sahipliği devretmeniz gerekmektedir.
                    </p>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Yeni Sahip E-posta</label>
                        <input
                          type="email"
                          value={transferEmail}
                          onChange={(e) => setTransferEmail(e.target.value)}
                          placeholder="ornek@email.com"
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Bu kişiye sahiplik devri talebi gönderilecektir. Kabul ettikten sonra görevi bırakabilirsiniz.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Şifreniz</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleTransferSubmit()}
                          placeholder="Mevcut şifreniz"
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModals}
                  disabled={isProcessing}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleTransferSubmit}
                  disabled={isProcessing || !password.trim() || !transferEmail.trim()}
                  className="inline-flex items-center rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                >
                  {isProcessing ? 'Gönderiliyor...' : 'Devir Talebi Gönder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
