// Hosted Admin routes are mounted below /api. Normalize an origin-only value
// before Vite replaces it in both core and commercial plugin bundles.
export function resolveAdminApiUrl(value) {
  const url = new URL(String(value || 'https://api.ctxhub.net/api'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_URL must be an HTTP(S) API URL without credentials, query or fragment');
  }
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/api';
  if (url.pathname.replace(/\/+$/, '') !== '/api') throw new Error('Hosted VITE_API_URL must use the /api path');
  return `${url.origin}/api`;
}
