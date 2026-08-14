import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LockClosedIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext.jsx'

export function FeatureRoute({ children, feature }) {
  const { hasFeature, activeMembership } = useAuth()
  const { t } = useTranslation()
  if (!feature || hasFeature(feature)) return children

  const planName = activeMembership?.tenant?.planName || activeMembership?.tenant?.plan || 'Free'
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="rounded-lg bg-amber-100 p-2 text-amber-700">
          <LockClosedIcon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{t('route.feature_locked_title')}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('route.feature_locked_body', { plan: planName })}
          </p>
          <Link
            to="/varliklar/ayarlar"
            className="mt-4 inline-flex rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
          >
            {t('route.view_plans')}
          </Link>
        </div>
      </div>
    </div>
  )
}
