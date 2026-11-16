import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
const script = new URL('./configure-mfa.cjs', import.meta.url);
function fixture(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxhub-test-mfa-config-'));
  const envFile = path.join(root, '.env'); fs.writeFileSync(envFile, source, { mode: 0o600 });
  return { root, envFile, run: (action) => spawnSync(process.execPath, [script.pathname, action, '--env-file', envFile, '--backup-dir', path.join(root, 'backup')], { encoding: 'utf8' }) };
}
test('prepares a private permanent key without enabling enrollment or revealing secrets', () => {
  const f = fixture('MONGODB_URI=private-placeholder\nOTHER=value\n');
  try {
    const result = f.run('--prepare'); assert.equal(result.status, 0);
    const env = dotenv.parse(fs.readFileSync(f.envFile));
    assert.equal(Buffer.from(env.AUTH_MFA_CREDENTIALS_KEY, 'base64').length, 32); assert.equal(env.AUTH_MFA_ENABLED, 'false'); assert.equal(env.OTHER, 'value');
    assert.equal(result.stdout.includes(env.AUTH_MFA_CREDENTIALS_KEY), false); assert.equal(result.stdout.includes('private-placeholder'), false);
    assert.equal(fs.statSync(f.envFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.join(f.root, 'backup')).mode & 0o777, 0o700);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test('enables and disables enrollment while preserving the key and every unrelated setting', () => {
  const key = crypto.randomBytes(32).toString('base64'); const f = fixture(`AUTH_MFA_CREDENTIALS_KEY=${key}\nAUTH_MFA_ENABLED=false\nOTHER=value\n`);
  try {
    assert.equal(f.run('--enable').status, 0);
    assert.equal(dotenv.parse(fs.readFileSync(f.envFile)).AUTH_MFA_ENABLED, 'true');
    assert.equal(f.run('--prepare').status, 0); assert.equal(dotenv.parse(fs.readFileSync(f.envFile)).AUTH_MFA_ENABLED, 'true');
    assert.equal(f.run('--disable-enrollment').status, 0);
    assert.deepEqual(dotenv.parse(fs.readFileSync(f.envFile)), { AUTH_MFA_CREDENTIALS_KEY: key, AUTH_MFA_ENABLED: 'false', OTHER: 'value' });
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test('refuses an invalid existing key without replacing it or changing configuration', () => {
  const source = 'AUTH_MFA_CREDENTIALS_KEY=invalid\n'; const f = fixture(source);
  try { assert.equal(f.run('--prepare').status, 1); assert.equal(fs.readFileSync(f.envFile, 'utf8'), source); }
  finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
