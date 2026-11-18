import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sessions = require('./formUploadSession');

const tenantId = '64b000000000000000000001';
const formId = '64b0000000000000000000f1';
let savedEnv;

beforeEach(() => {
  savedEnv = { session: process.env.FORM_UPLOAD_SESSION_SECRET, jwt: process.env.JWT_SECRET };
  process.env.FORM_UPLOAD_SESSION_SECRET = 'test-session-secret';
});

afterEach(() => {
  if (savedEnv.session === undefined) delete process.env.FORM_UPLOAD_SESSION_SECRET;
  else process.env.FORM_UPLOAD_SESSION_SECRET = savedEnv.session;
  if (savedEnv.jwt === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedEnv.jwt;
});

describe('form upload session', () => {
  it('round-trips for the same tenant and form', () => {
    const session = sessions.createSession({ tenantId, formId, now: 1000 });
    const verified = sessions.verifySession({ token: session.token, tenantId, formId, now: 2000 });
    expect(verified.sessionId).toBe(session.sessionId);
    expect(session.expiresAt.getTime()).toBe(1000 + sessions.SESSION_TTL_SECONDS * 1000);
  });

  it('is rejected for another form or tenant', () => {
    const { token } = sessions.createSession({ tenantId, formId });
    expect(() => sessions.verifySession({ token, tenantId, formId: '64b0000000000000000000f2' }))
      .toThrowError(expect.objectContaining({ code: 'UploadSessionInvalid' }));
    expect(() => sessions.verifySession({ token, tenantId: '64b000000000000000000002', formId }))
      .toThrowError(expect.objectContaining({ code: 'UploadSessionInvalid' }));
  });

  it('expires after 15 minutes', () => {
    const { token } = sessions.createSession({ tenantId, formId, now: 0 });
    const lastValid = sessions.SESSION_TTL_SECONDS * 1000 - 1;
    expect(sessions.verifySession({ token, tenantId, formId, now: lastValid }).sessionId).toBeTruthy();
    expect(() => sessions.verifySession({ token, tenantId, formId, now: lastValid + 1 }))
      .toThrowError(expect.objectContaining({ code: 'UploadSessionExpired' }));
  });

  it('rejects a tampered payload, a foreign signature and a missing token', () => {
    const { token } = sessions.createSession({ tenantId, formId });
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
      exp: Date.now() + 86400000
    })).toString('base64url');
    expect(() => sessions.verifySession({ token: `${forged}.${signature}`, tenantId, formId }))
      .toThrowError(expect.objectContaining({ code: 'UploadSessionInvalid' }));

    process.env.FORM_UPLOAD_SESSION_SECRET = 'another-secret';
    expect(() => sessions.verifySession({ token, tenantId, formId }))
      .toThrowError(expect.objectContaining({ code: 'UploadSessionInvalid' }));

    expect(() => sessions.verifySession({ token: undefined, tenantId, formId }))
      .toThrowError(expect.objectContaining({ code: 'UploadSessionRequired' }));
  });

  it('refuses to work without a signing secret', () => {
    delete process.env.FORM_UPLOAD_SESSION_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => sessions.createSession({ tenantId, formId })).toThrow(/is required/);
  });
});
