import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSubscriptionPlans } from '../lib/api/subscriptions';
import { Check, Zap, TrendingUp, Building2 } from 'lucide-react';

const PLAN_ICONS = {
  free: Zap,
  pro: TrendingUp,
  promax: Building2,
  enterprise: Building2,
};

const PLAN_COLORS = {
  free: 'blue',
  pro: 'purple',
  promax: 'indigo',
  enterprise: 'emerald',
};

/**
 * Subscription Plan Selector Component
 * Displays available subscription plans with their features and limits
 */
export default function SubscriptionPlanSelector({
  selectedPlan,
  onSelectPlan,
  currentPlan = null,
  showPricing = true,
  compact = false
}) {
  const [selected, setSelected] = useState(selectedPlan || 'free');

  const { data: plans = [], isLoading, error } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: fetchSubscriptionPlans,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (selectedPlan) {
      setSelected(selectedPlan);
    }
  }, [selectedPlan]);

  const handleSelect = (planSlug) => {
    setSelected(planSlug);
    onSelectPlan?.(planSlug);
  };

  const formatLimit = (value) => {
    if (value === null || value === -1) return 'Sınırsız';
    if (value === 0) return 'Yok';
    return value.toLocaleString('tr-TR');
  };

  const formatStorage = (bytes) => {
    if (!bytes || bytes === null || bytes === -1) return 'Sınırsız';
    const gb = bytes / (1024 ** 3);
    return `${gb} GB`;
  };

  const formatRequests = (count) => {
    if (!count || count === null || count === -1) return 'Sınırsız';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toLocaleString('tr-TR');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Planlar yüklenemedi: {error.message}</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        {plans.map((plan) => {
          const Icon = PLAN_ICONS[plan.slug] || Zap;
          const colorClass = PLAN_COLORS[plan.slug] || 'blue';
          const isSelected = selected === plan.slug;
          const isCurrent = currentPlan === plan.slug;

          return (
            <button
              key={plan.slug}
              type="button"
              onClick={() => handleSelect(plan.slug)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                isSelected
                  ? `border-${colorClass}-500 bg-${colorClass}-50`
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-${colorClass}-100`}>
                    <Icon className={`w-5 h-5 text-${colorClass}-600`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                      {isCurrent && (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                          Mevcut Plan
                        </span>
                      )}
                    </div>
                    {showPricing && (
                      <p className="text-sm text-gray-600">
                        {plan.price === 0 ? 'Ücretsiz' : `$${plan.price}/ay`}
                      </p>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <Check className={`w-5 h-5 text-${colorClass}-600`} />
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {plans.map((plan) => {
        const Icon = PLAN_ICONS[plan.slug] || Zap;
        const isSelected = selected === plan.slug;
        const isCurrent = currentPlan === plan.slug;

        return (
          <div
            key={plan.slug}
            className={`relative rounded-xl border-2 p-6 transition-all ${
              isSelected && plan.slug === 'free'
                ? 'border-blue-500 shadow-lg bg-blue-50/30'
                : isSelected && plan.slug === 'pro'
                ? 'border-purple-500 shadow-lg bg-purple-50/30'
                : isSelected && plan.slug === 'promax'
                ? 'border-indigo-500 shadow-lg bg-indigo-50/30'
                : isSelected && plan.slug === 'enterprise'
                ? 'border-emerald-500 shadow-lg bg-emerald-50/30 ring-2 ring-emerald-200'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {isCurrent && (
              <div className="absolute top-0 right-0 -mt-3 -mr-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 shadow-sm">
                  Mevcut Plan
                </span>
              </div>
            )}

            <div className="flex flex-col h-full">
              <div className={`inline-flex p-3 rounded-lg self-start mb-4 ${
                plan.slug === 'free' ? 'bg-blue-100' :
                plan.slug === 'pro' ? 'bg-purple-100' :
                plan.slug === 'promax' ? 'bg-indigo-100' :
                'bg-emerald-100'
              }`}>
                <Icon className={`w-6 h-6 ${
                  plan.slug === 'free' ? 'text-blue-600' :
                  plan.slug === 'pro' ? 'text-purple-600' :
                  plan.slug === 'promax' ? 'text-indigo-600' :
                  'text-emerald-600'
                }`} />
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>

              {showPricing && (
                <div className="mb-4">
                  {plan.price === 0 ? (
                    <div className="text-2xl font-bold text-gray-900">{plan.name==="Free" ? "Ücretsiz":"Kullandıkca Öde"} </div>
                  ) : (
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                      <span className="text-gray-600 ml-1">/ay</span>
                    </div>
                  )}
                </div>
              )}

              {plan.description && (
                <p className="text-sm text-gray-600 mb-6">{plan.description}</p>
              )}

              <div className="space-y-3 mb-6 flex-1">
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    <strong>{formatLimit(plan.limits.users)}</strong> kullanıcı
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    <strong>{formatLimit(plan.limits.owners)}</strong> owner
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    <strong>{formatStorage(plan.limits.storage)}</strong> depolama
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    <strong>{formatRequests(plan.limits.requests)}</strong> API isteği/ay
                  </span>
                </div>

                {plan.billingType === 'usage-based' && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-500">Kullanıma dayalı fiyatlandırma</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleSelect(plan.slug)}
                disabled={isCurrent}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                  isSelected && plan.slug === 'free'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : isSelected && plan.slug === 'pro'
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : isSelected && plan.slug === 'promax'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : isSelected && plan.slug === 'enterprise'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-400 ring-offset-2'
                    : isCurrent
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                {isCurrent ? 'Mevcut Planınız' : isSelected ? 'Seçildi ✓' : 'Seç'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
