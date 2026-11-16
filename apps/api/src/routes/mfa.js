const mfa = require('../services/mfaService');
const AuthService = require('../services/authService');
const { authenticateWithoutTenant } = require('../middleware/auth');
const { getMfaToken, clearMfaCookie, requireMfaOrigin } = require('../services/mfaCookie');
const { setSessionCookie } = require('../services/sessionSecurity');
const { logSecurityEvent } = require('../services/auditService');

const token = { type: 'string', minLength: 43, maxLength: 43 };
const code = { type: 'string', minLength: 6, maxLength: 64 };
const method = { type: 'string', enum: ['totp', 'email'] };
const password = { type: 'string', maxLength: 1024 };
const body = (properties = {}, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
module.exports = async function mfaRoutes(app) {
  const auth = new AuthService(app);
  const sendSession = async (reply, result, request, options = {}) => {
    const session = await auth.completeLogin(result.user, result.tenantId || request.authPayload?.tenantId || null, request,
      { mfaVerified: true, primaryAuth: result.primaryAuth, authAt: result.authAt,
        mfaAt: result.mfaAt || Math.floor(Date.now() / 1000), ...options });
    clearMfaCookie(reply);
    setSessionCookie(reply, session.token);
    const response = { ...session };
    delete response.token;
    return { ...response, ...(result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {}) };
  };
  const publicRoute = (path, schema, handler) => app.post(`/auth/mfa/${path}`, {
    preHandler: [requireMfaOrigin], config: { rateLimit: { max: 20, timeWindow: 60000 } },
    schema: { body: schema },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { return await handler(request, reply); }
    catch (error) {
      if (error.retryAfterSeconds) reply.header('Retry-After', error.retryAfterSeconds);
      return reply.code(error.statusCode || 500).send({ error: error.code || 'MfaFailed', retryAfterSeconds: error.retryAfterSeconds });
    }
  });
  publicRoute('challenge', body(), (r) => mfa.challengeStatus(getMfaToken(r)));
  publicRoute('email', body(), (r) => mfa.sendCode(getMfaToken(r)));
  publicRoute('verify', body({ method: { type: 'string', enum: ['totp', 'email', 'recovery'] }, code }, ['method', 'code']),
    async (r, reply) => sendSession(reply, await mfa.verifyLogin(getMfaToken(r), r.body.method, r.body.code), r));
  publicRoute('cancel', body(), async (r, reply) => { await mfa.cancel(getMfaToken(r)); clearMfaCookie(reply); return { cancelled: true }; });

  const settingsRoute = (path, schema, handler) => app.post(`/auth/mfa/settings/${path}`, {
    preHandler: [authenticateWithoutTenant], config: { rateLimit: { max: 10, timeWindow: 60000 } }, schema: { body: schema },
  }, async (r, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { return await handler(r, reply); }
    catch (error) {
      if (error.retryAfterSeconds) reply.header('Retry-After', error.retryAfterSeconds);
      return reply.code(error.code === 'MfaChallengeExpired' ? 410 : (error.statusCode || 500)).send({ error: error.code || 'MfaFailed', retryAfterSeconds: error.retryAfterSeconds });
    }
  });
  app.get('/auth/mfa/settings', { preHandler: [authenticateWithoutTenant] }, async (r, reply) => {
    reply.header('Cache-Control', 'no-store');
    return mfa.status(r.user._id, r.authPayload);
  });
  settingsRoute('enroll', body({ method, currentPassword: password }, ['method']),
    (r) => mfa.beginEnrollment(r.user._id, r.body.method, r.body.currentPassword, r.authPayload));
  settingsRoute('confirm', body({ method, challengeToken: token, code }, ['method', 'challengeToken', 'code']),
    async (r, reply) => {
      const result = await mfa.finishEnrollment(r.user._id, r.body.challengeToken, r.body.method, r.body.code);
      await logSecurityEvent({ action: 'mfa.method.enabled', description: 'Second factor enabled', userId: r.user._id, metadata: { method: r.body.method }, request: r });
      return sendSession(reply, result, r);
    });
  settingsRoute('email', body({ challengeToken: token }, ['challengeToken']),
    (r) => mfa.sendCode(r.body.challengeToken, 'enroll-email', r.user._id));
  for (const action of ['disable', 'recovery']) settingsRoute(action, body({ currentPassword: password }),
    async (r, reply) => {
      const result = await mfa.changeSettings(r.user._id, action, r.body.currentPassword, r.authPayload);
      await logSecurityEvent({ action: action === 'disable' ? 'mfa.disabled' : 'mfa.recovery.regenerated', description: 'Second factor settings changed', userId: r.user._id, request: r });
      return sendSession(reply, result, r, action === 'disable' ? { mfaAt: undefined } : {});
    });
  settingsRoute('reminder', body(), (r) => mfa.snooze(r.user._id, r.user.tokenVersion || 0));
};
