/**
 * Server-side verification of Cloudflare Turnstile tokens.
 *
 * Each tenant uses its own Turnstile widget; the secret key is stored encrypted
 * in the tenant settings. A token can be verified only once.
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 2048;

async function verifyToken({ secretKey, token, remoteIp, fetchImpl = fetch }) {
  if (!secretKey) {
    return { success: false, errorCodes: ['missing-input-secret'] };
  }
  if (typeof token !== 'string' || !token.trim() || token.length > MAX_TOKEN_LENGTH) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS)
    });
    if (!response.ok) {
      return { success: false, errorCodes: [`http-${response.status}`], unavailable: true };
    }
    const result = await response.json();
    return {
      success: result.success === true,
      errorCodes: Array.isArray(result['error-codes']) ? result['error-codes'] : [],
      hostname: result.hostname || null
    };
  } catch (error) {
    // Fail closed: when Turnstile cannot be reached, no upload session is issued.
    return { success: false, errorCodes: ['verification-unavailable'], unavailable: true };
  }
}

module.exports = {
  SITEVERIFY_URL,
  verifyToken
};
