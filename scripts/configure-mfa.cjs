#!/usr/bin/env node
// Changes only the selected env file. Reload workers separately with
// scripts/reload-api-pm2-with-env.cjs --reload. Never prints credential values.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
function main() {
  const action = process.argv[2];
  const value = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  const filename = path.resolve(value('--env-file') || path.join(__dirname, '../.env'));
  const directory = value('--backup-dir');
  if (!['--prepare', '--enable', '--disable-enrollment'].includes(action) || !directory) throw new Error('Invalid arguments');
  const source = fs.readFileSync(filename, 'utf8');
  const env = dotenv.parse(source);
  const keyCreated = !env.AUTH_MFA_CREDENTIALS_KEY && action === '--prepare';
  const key = keyCreated ? crypto.randomBytes(32).toString('base64') : env.AUTH_MFA_CREDENTIALS_KEY;
  const bytes = Buffer.from(key || '', 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== key) throw new Error('Invalid MFA key');
  const enabled = action === '--enable' ? 'true' : action === '--disable-enrollment' ? 'false' : env.AUTH_MFA_ENABLED || 'false';
  if (!['true', 'false'].includes(enabled)) throw new Error('Invalid MFA flag');
  const backup = path.resolve(directory);
  fs.mkdirSync(backup, { mode: 0o700, recursive: true });
  fs.chmodSync(backup, 0o700);
  const id = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const before = path.join(backup, `${id}.env-before`);
  fs.writeFileSync(before, source, { mode: 0o600, flag: 'wx' });
  // Keep the permanent key even if the env file was initially missing it.
  fs.writeFileSync(path.join(backup, `${id}.mfa-key`), `${key}\n`, { mode: 0o600, flag: 'wx' });
  let updated = source;
  for (const [name, value] of Object.entries({ AUTH_MFA_CREDENTIALS_KEY: key, AUTH_MFA_ENABLED: enabled })) {
    const pattern = new RegExp(`^(?:export\\s+)?${name}\\s*=.*$`, 'gm');
    updated = pattern.test(updated) ? updated.replace(pattern, `${name}=${value}`) : `${updated.trimEnd()}\n${name}=${value}\n`;
  }
  const temp = `${filename}.mfa-${id}`;
  fs.writeFileSync(temp, updated, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, filename);
  console.log(JSON.stringify({ action: action.slice(2), keyConfigured: true, keyCreated, enrollmentEnabled: enabled === 'true', backup: before, workersReloadRequired: true }));
}
try { main(); } catch (error) { console.error(JSON.stringify({ error: 'MfaConfigurationFailed', errorType: error.name })); process.exitCode = 1; }
