import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ArrowPathIcon,
  BuildingOfficeIcon 
} from '@heroicons/react/24/outline'
import Footer from '../../components/Footer.jsx'

export default function AcceptTransfer() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { updateMemberships, selectTenant } = useAuth()
  
  const token = searchParams.get('token')
  const tenantId = searchParams.get('tenant')
  
  const [error, setError] = useState('')
  const [tenantName, setTenantName] = useState('')

  const acceptTransferMutation = useMutation({
    mutationFn: ({ token, tenantId }) => tenantAPI.acceptOwnershipTransfer(token, tenantId),
    onSuccess: async (response) => {
      const { membership, tenant } = response.data || response
      
      setTenantName(tenant?.name || 'Varlık')
      
      // Tüm tenant listesini yeniden çek (ownerCount güncellenmiş olacak)
      try {
        const { tenants } = await tenantAPI.getTenants({ includeTokens: true })
        updateMemberships(tenants)
        
        // Query cache'i invalidate et
        queryClient.invalidateQueries({ queryKey: ['tenants', 'list'] })
        
        // 3 saniye sonra varlıklar sayfasına yönlendir
        setTimeout(() => {
          navigate('/varliklar')
        }, 3000)
      } catch (err) {
        console.error('Failed to refresh memberships:', err)
        // Yine de yönlendir
        setTimeout(() => {
          navigate('/varliklar')
        }, 3000)
      }
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Sahiplik devri kabul edilirken bir hata oluştu'
      setError(message)
    }
  })

  useEffect(() => {
    // Sayfa yüklendiğinde otomatik olarak transfer işlemini başlat
    if (token && tenantId && !acceptTransferMutation.isPending && !acceptTransferMutation.isSuccess && !error) {
      acceptTransferMutation.mutate({ token, tenantId })
    }
  }, [token, tenantId])

  // Token veya tenant ID yoksa
  if (!token || !tenantId) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full">
            <div className="bg-white shadow-lg rounded-lg p-8">
              <div className="text-center">
                <XCircleIcon className="mx-auto h-16 w-16 text-red-500" />
                <h2 className="mt-4 text-2xl font-bold text-gray-900">
                  Geçersiz Bağlantı
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Sahiplik devri bağlantısı geçersiz veya eksik bilgi içeriyor.
                </p>
                <div className="mt-6">
                  <Link
                    to="/varliklar"
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    <BuildingOfficeIcon className="h-5 w-5" />
                    Varlıklara Git
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // Yükleniyor durumu
  if (acceptTransferMutation.isPending) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full">
            <div className="bg-white shadow-lg rounded-lg p-8">
              <div className="text-center">
                <ArrowPathIcon className="mx-auto h-16 w-16 text-blue-500 animate-spin" />
                <h2 className="mt-4 text-2xl font-bold text-gray-900">
                  Sahiplik Devri İşleniyor
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Lütfen bekleyin...
                </p>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // Hata durumu
  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full">
            <div className="bg-white shadow-lg rounded-lg p-8">
              <div className="text-center">
                <XCircleIcon className="mx-auto h-16 w-16 text-red-500" />
                <h2 className="mt-4 text-2xl font-bold text-gray-900">
                  İşlem Başarısız
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  {error}
                </p>
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => {
                      setError('')
                      acceptTransferMutation.mutate({ token, tenantId })
                    }}
                    className="w-full inline-flex justify-center items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    <ArrowPathIcon className="h-5 w-5" />
                    Tekrar Dene
                  </button>
                  <Link
                    to="/varliklar"
                    className="w-full inline-flex justify-center items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200"
                  >
                    <BuildingOfficeIcon className="h-5 w-5" />
                    Varlıklara Git
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // Başarılı durumu
  if (acceptTransferMutation.isSuccess) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full">
            <div className="bg-white shadow-lg rounded-lg p-8">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <CheckCircleIcon className="h-12 w-12 text-green-600" />
                </div>
                <h2 className="mt-4 text-2xl font-bold text-gray-900">
                  Sahiplik Devri Tamamlandı!
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  <strong>{tenantName}</strong> varlığının sahipliği başarıyla size devredildi.
                </p>
                <p className="mt-4 text-xs text-gray-500">
                  Varlıklar sayfasına yönlendiriliyorsunuz...
                </p>
                <div className="mt-6">
                  <Link
                    to="/varliklar"
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    <BuildingOfficeIcon className="h-5 w-5" />
                    Varlıklara Git
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return null
}
