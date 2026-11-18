/**
 * Upload sessions for public forms.
 *
 * A Turnstile token is single use and short lived, so it cannot guard every
 * step of an upload. It is checked once, when the session is created; the signed
 * session token then authorises the presign, complete and submit calls for the
 * same form until it expires.
 */
const crypto = require('crypto');

const SESSION_TTL_SECONDS = 15 * 60;
const TOKEN_VERSION = 1;

class FormUploadSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FormUploadSessionError';
    this.code = code;
    this.statusCode = 401;
  }
}

function getSecret() {
  const secret = process.env.FORM_UPLOAD_SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FORM_UPLOAD_SESSION_SECRET or JWT_SECRET is required for form upload sessions');
  }
  // Derive a purpose-specific key so a session token is never valid as anything else.
  return crypto.createHmac('sha256', secret).update('contexthub:form-upload-session:v1').digest();
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function createSession({ tenantId, formId, now = Date.now() }) {
  const sessionId = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({
    v: TOKEN_VERSION,
    sid: sessionId,
    tid: String(tenantId),
    fid: String(formId),
    exp: expiresAt
  })).toString('base64url');

  return {
    sessionId,
    token: `${payload}.${sign(payload)}`,
    expiresAt: new Date(expiresAt)
  };
}

/**
 * Verify a session token and that it belongs to this tenant and form.
 */
function verifySession({ token, tenantId, formId, now = Date.now() }) {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new FormUploadSessionError('UploadSessionRequired', 'A valid upload session is required');
  }

  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  const given = Buffer.from(String(signature || ''));
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    throw new FormUploadSessionError('UploadSessionInvalid', 'Upload session is not valid');
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (error) {
    throw new FormUploadSessionError('UploadSessionInvalid', 'Upload session is not valid');
  }

  if (data.v !== TOKEN_VERSION || data.tid !== String(tenantId) || data.fid !== String(formId)) {
    throw new FormUploadSessionError('UploadSessionInvalid', 'Upload session does not belong to this form');
  }
  if (!Number.isFinite(data.exp) || data.exp <= now) {
    throw new FormUploadSessionError('UploadSessionExpired', 'Upload session has expired');
  }

  return { sessionId: data.sid, expiresAt: new Date(data.exp) };
}

module.exports = {
  SESSION_TTL_SECONDS,
  FormUploadSessionError,
  createSession,
  verifySession
};
