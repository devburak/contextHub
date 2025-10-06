import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { tenantAPI } from '../../lib/tenantAPI.js'
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
        <Link
          to="/varliklar/yeni"
          className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Yeni Varlık Ekle
        </Link>
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
              {tenantList.map((membership) => (
                <div
                  key={membership.tenantId || membership.id}
                  className={`border rounded-lg p-4 shadow-sm transition-colors ${
                    membership.tenantId === activeMembership?.tenantId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {membership.tenant?.name || 'Adsız Varlık'}
                      </h3>
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
