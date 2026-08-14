import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { activitiesAPI } from '../lib/api.js'
import { useApiError } from '../lib/useApiError.js'
import {
  UserIcon,
  KeyIcon,
  UserPlusIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'

// Aktivite türü API'den kod olarak gelir; her kod tek bir cümle anahtarına eşlenir.
// Kod sözlükte yoksa sunucunun yazdığı açıklamaya düşülür.
const activityDescriptionKeys = {
  'user.login': 'activities.action_user_login',
  'user.login.failed': 'activities.action_user_login_failed',
  'user.login.blocked': 'activities.action_user_login_blocked',
  'user.logout': 'activities.action_user_logout',
  'user.register': 'activities.action_user_register',
  'user.password.forgot': 'activities.action_user_password_forgot',
  'user.password.reset': 'activities.action_user_password_reset',
  'user.password.change': 'activities.action_user_password_change',
  'user.profile.update': 'activities.action_user_profile_update',
  'user.delete': 'activities.action_user_delete',
  'user.email.verified': 'activities.action_user_email_verified',
  'user.email.verification.failed': 'activities.action_user_email_verification_failed',
  'user.email.verification.resend': 'activities.action_user_email_verification_resend',
  'session.created': 'activities.action_session_created',
  'session.refreshed': 'activities.action_session_refreshed',
  'session.revoked': 'activities.action_session_revoked',
  'session.revoked.all': 'activities.action_session_revoked_all',
  'session.tenant.switched': 'activities.action_session_tenant_switched',
  'tenant.ownership.transfer': 'activities.action_tenant_ownership_transfer',
  'api_token.created': 'activities.action_api_token_created',
  'api_token.updated': 'activities.action_api_token_updated',
  'api_token.deleted': 'activities.action_api_token_deleted',
  'api_token.used': 'activities.action_api_token_used'
}

const activityIcons = {
  'user.login': { icon: ArrowRightOnRectangleIcon, color: 'text-green-600', bg: 'bg-green-100' },
  'user.logout': { icon: ArrowRightOnRectangleIcon, color: 'text-gray-600', bg: 'bg-gray-100' },
  'user.register': { icon: UserPlusIcon, color: 'text-blue-600', bg: 'bg-blue-100' },
  'user.password.forgot': { icon: KeyIcon, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  'user.password.reset': { icon: KeyIcon, color: 'text-purple-600', bg: 'bg-purple-100' },
  'user.password.change': { icon: KeyIcon, color: 'text-indigo-600', bg: 'bg-indigo-100' },
  'user.profile.update': { icon: UserIcon, color: 'text-blue-600', bg: 'bg-blue-100' },
  'user.delete': { icon: UserIcon, color: 'text-red-600', bg: 'bg-red-100' },
  'tenant.ownership.transfer': { icon: ShieldCheckIcon, color: 'text-amber-600', bg: 'bg-amber-100' },
}

const formatRelativeTime = (date, t) => {
  const now = new Date()
  const diff = now - new Date(date)
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return t('activities.days_ago', { count: days })
  } else if (hours > 0) {
    return t('activities.hours_ago', { count: hours })
  } else if (minutes > 0) {
    return t('activities.minutes_ago', { count: minutes })
  } else {
    return t('activities.just_now')
  }
}

export default function RecentActivities({ limit = 10, activeTenantId }) {
  const { t } = useTranslation()
  const describeError = useApiError()
  const { data, isLoading, error } = useQuery({
    queryKey: ['recentActivities', limit, activeTenantId],
    queryFn: () => activitiesAPI.getRecentActivities(limit, activeTenantId),
    enabled: Boolean(activeTenantId),
    // Removed refetchInterval - activities will only update on manual refresh or page reload
  })

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{t('activities.title')}</h3>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{t('activities.title')}</h3>
        <div className="text-sm text-red-600">
          {describeError(error, 'activities.load_failed')}
        </div>
      </div>
    )
  }

  const activities = data?.data?.activities || []

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">{t('activities.title')}</h3>
        {activities.length > 0 && (
          <span className="text-sm text-gray-500">
            {t('activities.recent_count', { count: activities.length })}
          </span>
        )}
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-8">
          <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">{t('activities.empty')}</p>
        </div>
      ) : (
        <div className="flow-root">
          <ul className="-mb-8">
            {activities.map((activity, activityIdx) => {
              const config = activityIcons[activity.action] || {
                icon: UserIcon,
                color: 'text-gray-600',
                bg: 'bg-gray-100'
              }
              const Icon = config.icon
              const descriptionKey = activityDescriptionKeys[activity.action]

              return (
                <li key={activity.id}>
                  <div className="relative pb-8">
                    {activityIdx !== activities.length - 1 ? (
                      <span
                        className="absolute left-5 top-5 -ml-px h-full w-0.5 bg-gray-200"
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="relative flex items-start space-x-3">
                      <div className="relative">
                        <div
                          className={`h-10 w-10 rounded-full ${config.bg} flex items-center justify-center ring-8 ring-white`}
                        >
                          <Icon className={`h-5 w-5 ${config.color}`} aria-hidden="true" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div>
                          <div className="text-sm">
                            <span className="font-medium text-gray-900">
                              {activity.user
                                ? `${activity.user.firstName} ${activity.user.lastName}`
                                : t('activities.unknown_user')}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-gray-500">
                            {descriptionKey ? t(descriptionKey) : activity.description}
                          </p>
                          {activity.metadata?.email && (
                            <p className="mt-0.5 text-xs text-gray-400">
                              {activity.metadata.email}
                            </p>
                          )}
                        </div>
                        <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                          <time dateTime={activity.createdAt}>
                            {formatRelativeTime(activity.createdAt, t)}
                          </time>
                          {activity.ipAddress && (
                            <>
                              <span aria-hidden="true">&middot;</span>
                              <span className="text-gray-400">{activity.ipAddress}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
