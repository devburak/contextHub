const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { User, AuthMfaChallenge } = require('@contexthub/common');
const mfaCrypto = require('./mfaCrypto');
const { mailService } = require('./mailService');
const authEmailThrottle = require('./authEmailThrottle');

const MAX_ATTEMPTS = 5;
const LOGIN_TTL_MS = 5 * 60 * 1000;
const ENROLL_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const RECENT_MFA_SECONDS = 5 * 60;
const SECRET_SELECTION = '+mfa.totpSecret +mfa.totpLastStep +mfa.recoveryCodeHashes';
const methods = (user) => Array.from(user?.mfa?.methods || []).filter((method) => ['totp', 'email'].includes(method));
const unwrap = (result) => result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result;

function fail(code, statusCode = 400, retryAfterSeconds) {
  const error = new Error(code);
  Object.assign(error, { code, statusCode, retryAfterSeconds });
  throw error;
}

class MfaService {
  constructor({ userModel = User, collection = () => AuthMfaChallenge.collection,
    mailer = mailService, throttle = authEmailThrottle, now = () => Date.now() } = {}) {
    Object.assign(this, { userModel, collection, mailer, throttle, now });
  }

  enrollmentAvailable() {
    return process.env.AUTH_MFA_ENABLED === 'true' && mfaCrypto.isConfigured();
  }

  async user(userId, tokenVersion) {
    const user = await this.userModel.findById(userId).select(SECRET_SELECTION);
    if (!user || user.status !== 'active' || !user.isEmailVerified
      || (tokenVersion !== undefined && (user.tokenVersion || 0) !== tokenVersion)) fail('MfaChallengeExpired', 401);
    return user;
  }

  recentMfa(payload) {
    return Number.isFinite(payload?.mfaAt) && payload.mfaAt <= this.now() / 1000
      && this.now() / 1000 - payload.mfaAt <= RECENT_MFA_SECONDS;
  }

  async status(userId, payload) {
    const user = await this.user(userId);
    const active = methods(user);
    return { available: this.enrollmentAvailable(), enabled: active.length > 0, methods: active,
      recoveryCodesRemaining: user.mfa?.recoveryCodeHashes?.length || 0,
      reminderAfter: user.mfa?.reminderAfter || null,
      requiresMfaReauthentication: active.length > 0 && !this.recentMfa(payload),
      googleProofAvailable: Boolean(user.googleSubject && payload?.primaryAuth === 'google'
        && this.now() / 1000 - (payload.authAt || 0) <= RECENT_MFA_SECONDS) };
  }

  async primaryProof(user, currentPassword, payload) {
    if (methods(user).length && !this.recentMfa(payload)) fail('MfaReauthenticationRequired', 409);
    if (typeof currentPassword === 'string' && currentPassword.length) {
      if (!await bcrypt.compare(currentPassword, user.password)) fail('MfaPasswordInvalid', 400);
      return 'password';
    }
    if (user.googleSubject && payload?.primaryAuth === 'google'
      && payload.authAt <= this.now() / 1000
      && this.now() / 1000 - payload.authAt <= RECENT_MFA_SECONDS) return 'google';
    fail('MfaPasswordRequired', 400);
  }

  async createRecord(user, purpose, { primaryAuth = 'password', tenantId = null,
    secretEncrypted, authAt = Math.floor(this.now() / 1000) } = {}) {
    const token = crypto.randomBytes(32).toString('base64url');
    const record = { _id: mfaCrypto.hashToken(token), userId: user._id, purpose,
      tokenVersion: user.tokenVersion || 0, primaryAuth, tenantId, authAt, attempts: 0,
      createdAt: new Date(this.now()), expiresAt: new Date(this.now() + (purpose === 'login' ? LOGIN_TTL_MS : ENROLL_TTL_MS)) };
    if (secretEncrypted) record.secretEncrypted = secretEncrypted;
    await this.collection().insertOne(record);
    return { token, record };
  }

  async loginChallenge(user, tenantId, primaryAuth = 'password') {
    user = await this.user(user._id, user.tokenVersion || 0);
    if (!methods(user).length) fail('MfaNotEnabled', 409);
    const created = await this.createRecord(user, 'login', { tenantId, primaryAuth });
    return { ...created, public: this.challengeInfo(created.record, user) };
  }

  challengeInfo(record, user) {
    const [local, domain] = user.email.split('@');
    return { mfaRequired: true, methods: mfaCrypto.isConfigured() ? methods(user) : [],
      recoveryAvailable: Boolean(user.mfa?.recoveryCodeHashes?.length),
      maskedEmail: `${local.slice(0, 1)}***@${domain}`, expiresAt: record.expiresAt,
      retryAfterSeconds: record.emailSentAt ? Math.max(0, Math.ceil((record.emailSentAt.getTime() + RESEND_MS - this.now()) / 1000)) : 0 };
  }

  hash(token) {
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(token)) fail('MfaChallengeExpired', 401);
    return mfaCrypto.hashToken(token);
  }

  async record(token, purpose, userId) {
    const query = { _id: this.hash(token), purpose, expiresAt: { $gt: new Date(this.now()) }, attempts: { $lt: MAX_ATTEMPTS } };
    if (userId) query.userId = userId;
    const record = await this.collection().findOne(query);
    if (!record) fail('MfaChallengeExpired', 401);
    return record;
  }

  async challengeStatus(token) {
    const record = await this.record(token, 'login');
    const user = await this.user(record.userId, record.tokenVersion);
    return this.challengeInfo(record, user);
  }

  async sendCode(token, purpose = 'login', userId) {
    if (!mfaCrypto.isConfigured()) fail('MfaUnavailable', 503);
    const record = await this.record(token, purpose, userId);
    const user = await this.user(record.userId, record.tokenVersion);
    if (purpose === 'login' && !methods(user).includes('email')) fail('MfaMethodUnavailable', 400);
    const wait = record.emailSentAt && record.emailSentAt.getTime() + RESEND_MS - this.now();
    if (wait > 0) fail('MfaResendLimited', 429, Math.ceil(wait / 1000));
    const quota = await this.throttle.consume('mfa-code', user.email);
    if (!quota.allowed) fail('MfaResendLimited', 429, quota.retryAfterSeconds);
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const result = unwrap(await this.collection().findOneAndUpdate({
      _id: record._id, expiresAt: { $gt: new Date(this.now()) },
      $or: [{ emailSentAt: { $exists: false } }, { emailSentAt: { $lte: new Date(this.now() - RESEND_MS) } }],
    }, { $set: { emailCodeHash: mfaCrypto.emailCodeDigest(record._id, code),
      emailExpiresAt: new Date(this.now() + LOGIN_TTL_MS), emailSentAt: new Date(this.now()) } }, { returnDocument: 'after' }));
    if (!result) fail('MfaResendLimited', 429, RESEND_MS / 1000);
    try {
      const sent = await this.mailer.sendMail({ to: user.email, subject: 'ContextHub doğrulama kodunuz / verification code',
        text: `ContextHub: ${code}\n\nDoğrulama kodunuz 5 dakika geçerlidir. Bu kodu kimseyle paylaşmayın.\nYour verification code expires in 5 minutes. Do not share it.`,
        html: `<p>ContextHub</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Kodunuz 5 dakika geçerlidir. / Your code expires in 5 minutes.</p>` });
      if (sent === false) fail('MfaEmailUnavailable', 503);
    } catch { fail('MfaEmailUnavailable', 503); }
    return { sent: true, retryAfterSeconds: RESEND_MS / 1000 };
  }

  async reserveAttempt(token, purpose, userId) {
    const query = { _id: this.hash(token), purpose, expiresAt: { $gt: new Date(this.now()) }, attempts: { $lt: MAX_ATTEMPTS } };
    if (userId) query.userId = userId;
    const result = unwrap(await this.collection().findOneAndUpdate(query, { $inc: { attempts: 1 } }, { returnDocument: 'after' }));
    if (!result) fail('MfaChallengeExpired', 401);
    return result;
  }

  async consumeRecord(record) {
    const result = unwrap(await this.collection().findOneAndDelete({ _id: record._id, expiresAt: { $gt: new Date(this.now()) } }));
    if (!result) fail('MfaChallengeExpired', 401);
  }

  async verifyLogin(token, method, code) {
    const record = await this.reserveAttempt(token, 'login');
    const user = await this.user(record.userId, record.tokenVersion);
    if (method === 'totp' && methods(user).includes('totp')) {
      let step;
      try { step = mfaCrypto.validateTotp(mfaCrypto.decryptSecret(user.mfa.totpSecret, user._id), code, this.now()); }
      catch { fail('MfaUnavailable', 503); }
      if (step === null) fail('MfaCodeInvalid', 400);
      const result = await this.userModel.updateOne({ _id: user._id, tokenVersion: record.tokenVersion,
        status: 'active', 'mfa.totpSecret': user.mfa.totpSecret,
        $or: [{ 'mfa.totpLastStep': { $lt: step } }, { 'mfa.totpLastStep': { $exists: false } }] },
      { $set: { 'mfa.totpLastStep': step, updatedAt: new Date(this.now()) } });
      if (result.matchedCount !== 1) fail('MfaCodeInvalid', 400);
    } else if (method === 'email' && methods(user).includes('email')) {
      if (!/^\d{6}$/.test(String(code || '')) || !record.emailExpiresAt || record.emailExpiresAt.getTime() <= this.now()) fail('MfaCodeInvalid', 400);
      if (!mfaCrypto.isConfigured()) fail('MfaUnavailable', 503);
      if (!mfaCrypto.equalDigest(record.emailCodeHash, mfaCrypto.emailCodeDigest(record._id, code))) fail('MfaCodeInvalid', 400);
    } else if (method === 'recovery') {
      const hash = mfaCrypto.recoveryHash(code);
      if (!hash) fail('MfaCodeInvalid', 400);
      const result = await this.userModel.updateOne({ _id: user._id, tokenVersion: record.tokenVersion,
        status: 'active', 'mfa.recoveryCodeHashes': hash }, { $pull: { 'mfa.recoveryCodeHashes': hash }, $set: { updatedAt: new Date(this.now()) } });
      if (result.matchedCount !== 1) fail('MfaCodeInvalid', 400);
    } else fail('MfaMethodUnavailable', 400);
    await this.consumeRecord(record);
    return { user: await this.user(user._id, record.tokenVersion), tenantId: record.tenantId,
      primaryAuth: record.primaryAuth, authAt: record.authAt, mfaAt: Math.floor(this.now() / 1000) };
  }

  async beginEnrollment(userId, method, currentPassword, payload) {
    if (!this.enrollmentAvailable()) fail('MfaUnavailable', 503);
    const user = await this.user(userId);
    if (!['totp', 'email'].includes(method)) fail('MfaMethodUnavailable', 400);
    if (methods(user).includes(method)) fail('MfaAlreadyEnabled', 409);
    const primaryAuth = await this.primaryProof(user, currentPassword, payload);
    const setup = method === 'totp' ? mfaCrypto.createTotp(user.email) : null;
    const created = await this.createRecord(user, `enroll-${method}`, { primaryAuth,
      ...(setup ? { secretEncrypted: mfaCrypto.encryptSecret(setup.secret, user._id) } : {}) });
    if (method === 'email') await this.sendCode(created.token, 'enroll-email', user._id);
    return { challengeToken: created.token, method, expiresAt: created.record.expiresAt,
      ...(setup ? { secret: setup.secret, uri: setup.uri } : { retryAfterSeconds: RESEND_MS / 1000 }) };
  }

  async finishEnrollment(userId, token, method, code) {
    if (!this.enrollmentAvailable()) fail('MfaUnavailable', 503);
    if (!['totp', 'email'].includes(method)) fail('MfaMethodUnavailable', 400);
    const record = await this.reserveAttempt(token, `enroll-${method}`, userId);
    const user = await this.user(userId, record.tokenVersion);
    let step;
    if (method === 'totp') {
      try { step = mfaCrypto.validateTotp(mfaCrypto.decryptSecret(record.secretEncrypted, userId), code, this.now()); }
      catch { fail('MfaUnavailable', 503); }
      if (step === null) fail('MfaCodeInvalid', 400);
    } else if (!/^\d{6}$/.test(String(code || '')) || !record.emailExpiresAt || record.emailExpiresAt.getTime() <= this.now()
      || !mfaCrypto.equalDigest(record.emailCodeHash, mfaCrypto.emailCodeDigest(record._id, code))) fail('MfaCodeInvalid', 400);
    const recovery = mfaCrypto.createRecoveryCodes();
    const set = { 'mfa.recoveryCodeHashes': recovery.hashes, 'mfa.reminderAfter': null, updatedAt: new Date(this.now()) };
    if (!methods(user).length) set['mfa.enrolledAt'] = new Date(this.now());
    if (method === 'totp') Object.assign(set, { 'mfa.totpSecret': record.secretEncrypted, 'mfa.totpLastStep': step });
    await this.consumeRecord(record);
    const updated = await this.userModel.findOneAndUpdate({ _id: user._id, status: 'active',
      ...(record.tokenVersion === 0 ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] } : { tokenVersion: record.tokenVersion }) },
      { $set: set, $addToSet: { 'mfa.methods': method }, $inc: { tokenVersion: 1 } }, { new: true });
    if (!updated) fail('MfaChallengeExpired', 401);
    return { user: updated, recoveryCodes: recovery.codes, primaryAuth: record.primaryAuth };
  }

  async changeSettings(userId, action, currentPassword, payload) {
    const user = await this.user(userId);
    if (!methods(user).length) fail('MfaNotEnabled', 409);
    const primaryAuth = await this.primaryProof(user, currentPassword, payload);
    const recovery = action === 'recovery' ? mfaCrypto.createRecoveryCodes() : null;
    const update = recovery
      ? { $set: { 'mfa.recoveryCodeHashes': recovery.hashes, updatedAt: new Date(this.now()) }, $inc: { tokenVersion: 1 } }
      : { $set: { 'mfa.methods': [], 'mfa.reminderAfter': new Date(this.now() + 7 * 86400000), updatedAt: new Date(this.now()) },
        $unset: { 'mfa.totpSecret': 1, 'mfa.totpLastStep': 1, 'mfa.recoveryCodeHashes': 1, 'mfa.enrolledAt': 1 }, $inc: { tokenVersion: 1 } };
    const updated = await this.userModel.findOneAndUpdate({ _id: user._id, tokenVersion: user.tokenVersion || 0, status: 'active' }, update, { new: true });
    if (!updated) fail('MfaChallengeExpired', 401);
    return { user: updated, primaryAuth, ...(recovery ? { recoveryCodes: recovery.codes } : {}) };
  }

  async snooze(userId, tokenVersion) {
    await this.userModel.updateOne({ _id: userId, ...(tokenVersion === 0 ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] } : { tokenVersion }) }, { $set: { 'mfa.reminderAfter': new Date(this.now() + 7 * 86400000) } });
    return { reminderAfter: new Date(this.now() + 7 * 86400000) };
  }

  async cancel(token) {
    if (typeof token === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(token)) await this.collection().deleteOne({ _id: mfaCrypto.hashToken(token), purpose: 'login' });
  }
}

module.exports = new MfaService();
module.exports.MfaService = MfaService;
module.exports.methods = methods;
