import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { useApiError } from '../../lib/useApiError.js'
import { userAPI } from '../../lib/userAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { CheckBadgeIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline'

// Etiketler render sırasında `t()` ile çözülür; modül seviyesinde yalnızca anahtar tutulur.
const STATUS_STYLES = {
  active: {
    labelKey: 'status.active',
    className: 'bg-green-50 text-green-700 ring-green-200',
    icon: CheckBadgeIcon
  },
  pending: {
    labelKey: 'tenant.status_pending_invite',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
    icon: ClockIcon
  },
  inactive: {
    labelKey: 'status.inactive',
    className: 'bg-gray-50 text-gray-600 ring-gray-200',
    icon: XCircleIcon
  }
}

export default function Tenants() {
  const toast = useToast()
  const { memberships, activeMembership, updateMemberships, selectTenant } = useAuth()
  const { t } = useTranslation()
  const describeError = useApiError()

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
      const { tenants } = await tenantAPI.getTenants()
      updateMemberships(tenants)
      return tenants
    }
  })

  const acceptInvitationMutation = useMutation({
    mutationFn: (tenantId) => tenantAPI.acceptInvitation(tenantId),
    onSuccess: async ({ membership, tenant }) => {
      toast.success(t('tenant.invite_accepted'))
      await tenantsQuery.refetch()

      if (membership?.tenantId) {
        await selectTenant({ ...membership, tenant })
      }
    },
    onError: (error) => {
      toast.error(describeError(error, 'tenant.invite_accept_failed'))
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
      toast.error(t('tenant.password_required'))
      return
    }

    setIsProcessing(true)
    try {
      // Şifre doğrulama ve üyelikten ayrılma
      await userAPI.leaveMembership(leavingMembership.id, { password })

      toast.success(t('tenant.left_success', { name: leavingMembership.tenant?.name || t('tenant.unnamed') }))
      
      // Veriyi yenile
      await tenantsQuery.refetch()
      
      // Modal'ı kapat ve state'i temizle
      closeModals()
    } catch (error) {
      toast.error(describeError(error, 'tenant.action_failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleTransferSubmit = async () => {
    if (!transferEmail.trim()) {
      toast.error(t('tenant.transfer_email_required'))
      return
    }

    if (!password.trim()) {
      toast.error(t('tenant.password_required'))
      return
    }

    setIsProcessing(true)
    try {
      // Sahiplik devri talebi gönder
      await userAPI.requestOwnershipTransfer(leavingMembership.tenantId, {
        email: transferEmail,
        password
      })
      
      toast.success(t('tenant.transfer_requested', { email: transferEmail }))
      
      // Liste yenilenmeli (transfer tamamlanınca ownerCount güncellenecek)
      tenantsQuery.refetch()
      
      // Modal'ı kapat ve state'i temizle
      closeModals()
    } catch (error) {
      toast.error(describeError(error, 'tenant.action_failed'))
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
          <h1 className="text-2xl font-bold text-gray-900">{t('tenant.management_title')}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('tenant.management_subtitle')}
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
            {t('common.refresh')}
          </button>
          <Link
            to="/varliklar/yeni"
            className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {t('tenant.add_new')}
          </Link>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('tenant.my_tenants')}</h2>
        </div>
        <div className="p-6">
          {tenantsQuery.isLoading ? (
            <div className="text-gray-500">{t('tenant.list_loading')}</div>
          ) : tenantsQuery.isError ? (
            <div className="text-red-600 text-sm">
              {t('tenant.list_error')}
            </div>
          ) : tenantList.length === 0 ? (
            <div className="text-gray-600 text-sm">{t('tenant.list_empty')}</div>
          ) : (
            <div className="space-y-4">
              {tenantList.map((membership) => {
                const isOwner = membership.role === 'owner'
                // Backend'den gelen ownerCount'u kullan
                const ownerCount = membership.ownerCount || 0
                const hasOtherOwners = isOwner && ownerCount > 1
                const planLabel = membership.tenant?.planName || membership.tenant?.currentPlan?.name || membership.tenant?.plan || 'Free'
                
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
                            {membership.tenant?.name || t('tenant.unnamed')}
                          </h3>
                          {isOwner && (
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                              {t('role.owner')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{membership.tenant?.slug}</p>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <span className="text-sm font-medium text-gray-700">
                          {t('tenant.role_label', {
                            // Rol adı özel (custom) olabilir; bilinen bir rol değilse ham değeri göster.
                            role: t(`role.${membership.role}`, { defaultValue: membership.role }),
                          })}
                        </span>
                        <span className="text-xs uppercase tracking-wide text-gray-500">
                          {t('tenant.plan_label', { plan: planLabel })}
                        </span>
                        {(() => {
                          const statusInfo = STATUS_STYLES[membership.status]
                          if (!statusInfo) return null
                          const Icon = statusInfo.icon
                          return (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusInfo.className}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {t(statusInfo.labelKey)}
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
                                ⚠️ {t('tenant.sole_owner_warning', { count: ownerCount })}
                              </p>
                            )}
                            {isOwner && hasOtherOwners && (
                              <p className="text-xs text-gray-600">
                                {t('tenant.other_owners_hint', { count: ownerCount })}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleLeaveMembership(membership, hasOtherOwners)}
                            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
                          >
                            {t('tenant.leave')}
                          </button>
                        </div>
                      </div>
                    )}

                    {membership.status === 'pending' && (
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-gray-600">
                          {t('tenant.pending_invite_hint')}
                        </p>
                        <button
                          type="button"
                          onClick={() => acceptInvitationMutation.mutate(membership.tenantId)}
                          disabled={acceptInvitationMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
                        >
                          {acceptInvitationMutation.isPending ? t('tenant.accepting_invite') : t('tenant.accept_invite')}
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
                    <h3 className="text-lg font-semibold text-gray-900">{t('tenant.confirm_password_title')}</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      <Trans
                        i18nKey="tenant.leave_password_prompt"
                        values={{ name: leavingMembership?.tenant?.name || t('tenant.unnamed') }}
                        components={{ strong: <strong /> }}
                      />
                    </p>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700">{t('tenant.your_password_label')}</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                        placeholder={t('tenant.current_password_placeholder')}
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
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handlePasswordSubmit}
                  disabled={isProcessing || !password.trim()}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {isProcessing ? t('tenant.processing') : t('tenant.leave')}
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
                    <h3 className="text-lg font-semibold text-gray-900">{t('tenant.transfer_title')}</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      <Trans
                        i18nKey="tenant.transfer_prompt"
                        values={{ name: leavingMembership?.tenant?.name || t('tenant.unnamed') }}
                        components={{ strong: <strong /> }}
                      />
                    </p>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">{t('tenant.transfer_email_label')}</label>
                        <input
                          type="email"
                          value={transferEmail}
                          onChange={(e) => setTransferEmail(e.target.value)}
                          placeholder={t('tenant.transfer_email_placeholder')}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          {t('tenant.transfer_email_hint')}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">{t('tenant.your_password_label')}</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleTransferSubmit()}
                          placeholder={t('tenant.current_password_placeholder')}
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
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleTransferSubmit}
                  disabled={isProcessing || !password.trim() || !transferEmail.trim()}
                  className="inline-flex items-center rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                >
                  {isProcessing ? t('tenant.transfer_sending') : t('tenant.transfer_submit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
