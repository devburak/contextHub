import { useAuth } from '../../contexts/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import Footer from '../../components/Footer.jsx'

export default function TenantSelection() {
  const { user, memberships, selectTenant, logout } = useAuth()
  const navigate = useNavigate()

  const handleSelect = (membership) => {
    const success = selectTenant(membership)
    if (success) {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-3xl w-full bg-white shadow-lg rounded-lg p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Varlık Seçimi</h1>
            <p className="mt-2 text-sm text-gray-600">
              Hoş geldin {user?.firstName || user?.name || 'kullanıcı'}. Lütfen devam etmek istediğin varlığı seç.
            </p>
          </div>

          {memberships.length === 0 ? (
            <div className="text-center text-gray-600">
              Aktif bir varlık erişimin bulunmuyor. Yöneticiyle iletişime geç veya yeni bir varlık oluştur.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {memberships.map((membership) => (
                <div
                  key={membership.tenantId}
                  className="border border-gray-200 rounded-lg p-4 shadow-sm bg-gray-50"
                >
                  <h2 className="text-lg font-semibold text-gray-900">
                    {membership.tenant?.name || 'Adsız Varlık'}
                  </h2>
                  <p className="text-sm text-gray-500">Rol: {membership.role}</p>
                  <button
                    onClick={() => handleSelect(membership)}
                    className="mt-4 w-full inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Bu varlıkla devam et
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Farklı bir hesapla giriş yap
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
