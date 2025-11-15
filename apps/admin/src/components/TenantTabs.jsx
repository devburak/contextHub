import { NavLink } from 'react-router-dom'

const TABS = [
  { id: 'settings', label: 'Genel Ayarlar', to: '/varliklar/ayarlar' },
  { id: 'webhooks', label: 'Webhooks', to: '/varliklar/webhooks' }
]

export default function TenantTabs({ active }) {
  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-6" aria-label="Tenant tabs">
        {TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.to}
            className={({ isActive }) => {
              const selected = active === tab.id || isActive
              return `pb-3 text-sm font-medium border-b-2 ${
                selected ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`
            }}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
