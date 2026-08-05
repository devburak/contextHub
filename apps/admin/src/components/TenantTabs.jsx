import { NavLink } from 'react-router-dom'
import { LockClosedIcon } from '@heroicons/react/20/solid'
import { useAuth } from '../contexts/AuthContext.jsx'
import { adminPluginTenantTabs } from '../plugins/registry.jsx'

const TABS = [
  { id: 'settings', label: 'Genel Ayarlar', to: '/varliklar/ayarlar' },
  { id: 'webhooks', label: 'Webhooks', to: '/varliklar/webhooks' }
]

export default function TenantTabs({ active }) {
  const { hasPermission, hasFeature } = useAuth()
  const tabs = [...TABS, ...adminPluginTenantTabs]
    .filter((tab) => !tab.permission || hasPermission(tab.permission))

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-6" aria-label="Tenant tabs">
        {tabs.map((tab) => {
          const locked = Boolean(tab.feature && !hasFeature(tab.feature))
          return (
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
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {locked && <LockClosedIcon className="h-3.5 w-3.5 text-amber-500" aria-label="Plan yükseltme gerekli" />}
            </span>
          </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
