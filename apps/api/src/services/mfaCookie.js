const { parseCookies, serializeCookie, clearSessionCookie } = require('./sessionSecurity');
const { getAdminOrigins, normalizeOrigin } = require('./tenantOriginPolicy');
const name = () => process.env.NODE_ENV === 'production' ? '__Host-ctx_mfa' : 'ctx_mfa';
const getMfaToken = (request) => parseCookies(request.headers.cookie)[name()];
function cookie(reply, token, maxAge) {
  reply.header('Cache-Control', 'no-store');
  reply.header('Set-Cookie', serializeCookie(name(), token, { maxAge, secure: process.env.NODE_ENV === 'production' }));
}
const clearMfaCookie = (reply) => cookie(reply, '', 0);
function sendPendingLogin(reply, result, { redirect } = {}) {
  clearSessionCookie(reply);
  cookie(reply, result.challengeToken, 300);
  const body = { ...result };
  delete body.challengeToken;
  return redirect ? reply.redirect(redirect) : reply.code(202).send(body);
}
async function requireMfaOrigin(request, reply) {
  const origin = normalizeOrigin(request.headers.origin);
  if (!origin || !getAdminOrigins().has(origin)) return reply.code(403).send({ error: 'InvalidOrigin' });
}
module.exports = { getMfaToken, clearMfaCookie, sendPendingLogin, requireMfaOrigin };
