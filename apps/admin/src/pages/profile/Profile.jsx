import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { userAPI } from '../../lib/userAPI.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { PERMISSION_LABELS } from '../../constants/permissionLabels.js'
import DeleteAccountModal from '../../components/DeleteAccountModal.jsx'

export default function Profile() {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { updateUserProfile, roleMeta, permissions, logout, memberships } = useAuth()
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  
  // Görevi bırakma state'leri
  const [leavingMembership, setLeavingMembership] = useState(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [password, setPassword] = useState('')
  const [transferEmail, setTransferEmail] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: userAPI.getCurrentUser
  })

  // Debug için
  useEffect(() => {
    if (data) {
      console.log('Profile data:', data)
      console.log('All memberships:', data.allMemberships)
    }
  }, [data])

  const profile = data?.user
  const currentMembership = data?.currentMembership

  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: ''
    }
  })

  useEffect(() => {
    if (profile) {
      reset({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: profile.email || ''
      })
    }
  }, [profile, reset])

  const onSubmit = async (values) => {
    try {
      const response = await userAPI.updateProfile(values)
      const updatedUser = {
        ...(profile || {}),
        ...response.user
      }
      updateUserProfile(updatedUser)
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] })
      toast.success('Profiliniz güncellendi')
    } catch (error) {
      const message = error?.response?.data?.message || 'Profil güncellenemedi'
      toast.error(message)
    }
  }

  const handleDeleteAccount = async () => {
    setShowDeleteModal(true)
  }

  const confirmDeleteAccount = async () => {
    setIsDeleting(true)
    try {
      await userAPI.deleteAccount()
      toast.success('Hesabınız başarıyla silindi. Güle güle...')
      setTimeout(() => {
        logout()
        navigate('/auth/login')
      }, 1500)
    } catch (error) {
      const message = error?.response?.data?.message || 'Hesap silinemedi'
      toast.error(message)
      setIsDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const handleLeaveMembership = (membership, hasOtherOwners) => {
    const isOwner = membership.role === 'owner'
    
    // Eğer sahip değilse direkt şifre modal aç
    if (!isOwner) {
      setLeavingMembership(membership)
      setShowPasswordModal(true)
      return
    }
    
    // Eğer sahipse ve başka sahip varsa direkt şifre modal aç
    if (isOwner && hasOtherOwners) {
      setLeavingMembership(membership)
      setShowPasswordModal(true)
      return
    }
    
    // Eğer sahipse ve başka sahip yoksa transfer modal aç
    if (isOwner && !hasOtherOwners) {
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
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] })
      
      // Modal'ı kapat ve state'i temizle
      setShowPasswordModal(false)
      setPassword('')
      setLeavingMembership(null)
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
      
      // Modal'ı kapat ve state'i temizle
      setShowTransferModal(false)
      setTransferEmail('')
      setPassword('')
      setLeavingMembership(null)
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

  const renderPermissions = (list = []) => {
    if (!list.length) {
      return <p className="text-sm text-gray-500">Bu rol için atanmış yetki yok.</p>
    }

    return (
      <div className="flex flex-wrap gap-2">
        {list.map((permission, index) => (
          <span
            key={`${permission}-${index}`}
            className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
          >
            {PERMISSION_LABELS[permission] || permission}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl">
        <div className="border-b border-gray-200 pb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Profil Ayarları</h1>
          <p className="mt-1 text-sm text-gray-500">Kişisel bilgilerinizi yönetin ve mevcut rolünüzü görüntüleyin.</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h2 className="text-sm font-medium text-gray-700">Kişisel Bilgiler</h2>
              </div>

              {isLoading ? (
                <div className="p-6 text-sm text-gray-500">Bilgiler yükleniyor...</div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Ad</label>
                      <input
                        type="text"
                        {...register('firstName', { required: true })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Soyad</label>
                      <input
                        type="text"
                        {...register('lastName', { required: true })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">E-posta</label>
                    <input
                      type="email"
                      {...register('email', { required: true })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                    <button
                      type="submit"
                      disabled={formState.isSubmitting || !formState.isDirty}
                      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {formState.isSubmitting ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h2 className="text-sm font-medium text-gray-700">Aktif Rol</h2>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{roleMeta?.name || currentMembership?.role || 'Bilinmiyor'}</p>
                  <p className="text-xs text-gray-500">Seviye: {roleMeta?.level ?? currentMembership?.level ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Yetkiler</p>
                  {renderPermissions(permissions || currentMembership?.permissions)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h2 className="text-sm font-medium text-gray-700">Varlık Üyeliklerim</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {(data?.allMemberships || []).map((membership) => {
                  const isOwner = membership.role === 'owner'
                  // Backend'den gelen ownerCount'u kullan
                  const ownerCount = membership.ownerCount || 0
                  const hasOtherOwners = isOwner && ownerCount > 1
                  
                  return (
                    <div
                      key={membership.id || `${membership.tenantId}-${membership.role}`}
                      className="p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{membership.tenant?.name || 'Varlık'}</p>
                            {isOwner && (
                              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                                Sahip
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-gray-500">Rol: {membership.roleMeta?.name || membership.role}</p>
                          <p className="text-xs text-gray-400">Yetki sayısı: {membership.permissions?.length || 0}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLeaveMembership(membership, hasOtherOwners)}
                          className="ml-4 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
                        >
                          Görevi Bırak
                        </button>
                      </div>
                      {isOwner && !hasOtherOwners && (
                        <div className="mt-3 rounded-md bg-amber-50 p-2">
                          <p className="text-xs text-amber-800">
                            ⚠️ Bu varlığın tek sahibisiniz. Görevi bırakmak için önce başka bir kullanıcıya sahiplik devretmeniz gerekmektedir. (Toplam owner: {ownerCount})
                          </p>
                        </div>
                      )}
                      {isOwner && hasOtherOwners && (
                        <div className="mt-3 rounded-md bg-green-50 p-2">
                          <p className="text-xs text-green-800">
                            ✓ {ownerCount} owner var. Sahipliğinizi bırakabilirsiniz.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!data?.allMemberships?.length && (
                  <div className="p-4 text-sm text-gray-500">Hiç varlık üyeliğiniz bulunmuyor.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tehlikeli Alan - Hesap Silme */}
        <div className="mt-8">
          <div className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-sm">
            <div className="border-b border-red-200 bg-red-50 px-4 py-3">
              <h2 className="text-sm font-medium text-red-800">Tehlikeli Alan</h2>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-900">Hesabı Kalıcı Olarak Sil</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Hesabınızı sildiğinizde, tüm kişisel bilgileriniz ve varlık üyelikleriniz kalıcı olarak silinecektir. 
                    Bu işlem geri alınamaz.
                  </p>
                  {(memberships || []).some(m => m.role === 'owner') && (
                    <div className="mt-3 rounded-md bg-yellow-50 p-3">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-yellow-800">
                            <strong>Uyarı:</strong> Sahip olduğunuz varlıklar var. Hesabınızı silmeden önce bu varlıkları 
                            başka bir kullanıcıya devretmeniz veya silmeniz gerekmektedir.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                      className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="-ml-0.5 mr-1.5 h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                      {isDeleting ? 'Siliniyor...' : 'Hesabımı Sil'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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

      {/* Hesap Silme Modal */}
      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteAccount}
        isDeleting={isDeleting}
        ownedTenants={(memberships || []).filter(m => m.role === 'owner')}
      />
    </div>
  )
}
