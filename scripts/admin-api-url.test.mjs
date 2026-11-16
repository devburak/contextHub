import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdminApiUrl } from './lib/admin-api-url.mjs';
test('hosted Admin retains the API route prefix for core and plugin clients', () => {
  for (const input of [undefined, 'https://api.ctxhub.net', 'https://api.ctxhub.net/', 'https://api.ctxhub.net/api/']) {
    assert.equal(resolveAdminApiUrl(input), 'https://api.ctxhub.net/api');
  }
  assert.equal(resolveAdminApiUrl('http://localhost:3000'), 'http://localhost:3000/api');
  for (const input of ['https://api.ctxhub.net/auth', 'https://u:p@api.ctxhub.net/api', 'https://api.ctxhub.net/api?x=1']) {
    assert.throws(() => resolveAdminApiUrl(input));
  }
});
