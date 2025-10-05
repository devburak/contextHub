import React from 'react';
import { Plus, X } from 'lucide-react';

export default function TargetingRules({ targeting = {}, onChange }) {
  const handleUpdate = (field, value) => {
    onChange({
      ...targeting,
      [field]: value
    });
  };

  const handleArrayAdd = (field, value = '') => {
    const current = targeting[field] || [];
    handleUpdate(field, [...current, value]);
  };

  const handleArrayRemove = (field, index) => {
    const current = targeting[field] || [];
    handleUpdate(field, current.filter((_, i) => i !== index));
  };

  const handleArrayUpdate = (field, index, value) => {
    const current = targeting[field] || [];
    const updated = [...current];
    updated[index] = value;
    handleUpdate(field, updated);
  };

  return (
    <div className="space-y-6">
      {/* Paths */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Page Paths (glob patterns)
        </label>
        <div className="space-y-2">
          {(targeting.paths || []).map((path, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => handleArrayUpdate('paths', index, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="/products/**"
              />
              <button
                onClick={() => handleArrayRemove('paths', index)}
                className="text-red-600 hover:text-red-900"
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <button
            onClick={() => handleArrayAdd('paths', '')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add Path
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Examples: /about, /products/**, /blog/*.html
        </p>
      </div>

      {/* Locales */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Locales
        </label>
        <div className="flex flex-wrap gap-2">
          {['en', 'tr', 'de', 'fr', 'es', 'it'].map((locale) => (
            <button
              key={locale}
              onClick={() => {
                const current = targeting.locale || [];
                handleUpdate(
                  'locale',
                  current.includes(locale)
                    ? current.filter(l => l !== locale)
                    : [...current, locale]
                );
              }}
              className={`px-3 py-1 rounded-lg text-sm ${
                (targeting.locale || []).includes(locale)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {locale.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Devices */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Devices
        </label>
        <div className="flex gap-2">
          {['desktop', 'mobile', 'tablet'].map((device) => (
            <button
              key={device}
              onClick={() => {
                const current = targeting.device || [];
                handleUpdate(
                  'device',
                  current.includes(device)
                    ? current.filter(d => d !== device)
                    : [...current, device]
                );
              }}
              className={`px-4 py-2 rounded-lg text-sm capitalize ${
                (targeting.device || []).includes(device)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {device}
            </button>
          ))}
        </div>
      </div>

      {/* Browsers */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Browsers
        </label>
        <div className="flex flex-wrap gap-2">
          {['chrome', 'firefox', 'safari', 'edge', 'opera'].map((browser) => (
            <button
              key={browser}
              onClick={() => {
                const current = targeting.browser || [];
                handleUpdate(
                  'browser',
                  current.includes(browser)
                    ? current.filter(b => b !== browser)
                    : [...current, browser]
                );
              }}
              className={`px-3 py-1 rounded-lg text-sm capitalize ${
                (targeting.browser || []).includes(browser)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {browser}
            </button>
          ))}
        </div>
      </div>

      {/* Operating Systems */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Operating Systems
        </label>
        <div className="flex flex-wrap gap-2">
          {['windows', 'macos', 'linux', 'ios', 'android'].map((os) => (
            <button
              key={os}
              onClick={() => {
                const current = targeting.os || [];
                handleUpdate(
                  'os',
                  current.includes(os)
                    ? current.filter(o => o !== os)
                    : [...current, os]
                );
              }}
              className={`px-3 py-1 rounded-lg text-sm capitalize ${
                (targeting.os || []).includes(os)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {os}
            </button>
          ))}
        </div>
      </div>

      {/* Authentication */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          User Authentication
        </label>
        <select
          value={targeting.requireAuth || 'any'}
          onChange={(e) => handleUpdate('requireAuth', e.target.value === 'any' ? undefined : e.target.value === 'true')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="any">Any (Logged in or Guest)</option>
          <option value="true">Logged in only</option>
          <option value="false">Guests only</option>
        </select>
      </div>

      {/* Roles */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          User Roles
        </label>
        <div className="space-y-2">
          {(targeting.roles || []).map((role, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={role}
                onChange={(e) => handleArrayUpdate('roles', index, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="admin, premium, etc."
              />
              <button
                onClick={() => handleArrayRemove('roles', index)}
                className="text-red-600 hover:text-red-900"
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <button
            onClick={() => handleArrayAdd('roles', '')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add Role
          </button>
        </div>
      </div>

      {/* User Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          User Tags
        </label>
        <div className="space-y-2">
          {(targeting.tags || []).map((tag, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={tag}
                onChange={(e) => handleArrayUpdate('tags', index, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="vip, returning-customer, etc."
              />
              <button
                onClick={() => handleArrayRemove('tags', index)}
                className="text-red-600 hover:text-red-900"
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <button
            onClick={() => handleArrayAdd('tags', '')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add Tag
          </button>
        </div>
      </div>

      {/* Feature Flags */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Feature Flags
        </label>
        <div className="space-y-2">
          {(targeting.featureFlags || []).map((flag, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={flag}
                onChange={(e) => handleArrayUpdate('featureFlags', index, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="new_checkout, beta_feature, etc."
              />
              <button
                onClick={() => handleArrayRemove('featureFlags', index)}
                className="text-red-600 hover:text-red-900"
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <button
            onClick={() => handleArrayAdd('featureFlags', '')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add Flag
          </button>
        </div>
      </div>

      {/* Query Params */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Query Parameters
        </label>
        <div className="space-y-2">
          {Object.entries(targeting.query || {}).map(([key, value], index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={key}
                onChange={(e) => {
                  const newQuery = { ...targeting.query };
                  delete newQuery[key];
                  newQuery[e.target.value] = value;
                  handleUpdate('query', newQuery);
                }}
                className="w-1/3 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Key"
              />
              <input
                type="text"
                value={value}
                onChange={(e) => {
                  handleUpdate('query', {
                    ...targeting.query,
                    [key]: e.target.value
                  });
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Value"
              />
              <button
                onClick={() => {
                  const newQuery = { ...targeting.query };
                  delete newQuery[key];
                  handleUpdate('query', newQuery);
                }}
                className="text-red-600 hover:text-red-900"
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              handleUpdate('query', {
                ...targeting.query,
                '': ''
              });
            }}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add Parameter
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Example: utm_source = facebook
        </p>
      </div>

      {/* Referrer */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Referrer (glob patterns)
        </label>
        <div className="space-y-2">
          {(targeting.referrer || []).map((ref, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={ref}
                onChange={(e) => handleArrayUpdate('referrer', index, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="*google.com*, *facebook.com*"
              />
              <button
                onClick={() => handleArrayRemove('referrer', index)}
                className="text-red-600 hover:text-red-900"
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <button
            onClick={() => handleArrayAdd('referrer', '')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add Referrer
          </button>
        </div>
      </div>
    </div>
  );
}
