import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareIndexes } from './audit-indexes.mjs';

test('read-only comparison distinguishes missing, options, compound order and duplicates', () => {
  const result = compareIndexes([
    [{ hash: 1 }, { unique: true }], [{ userId: 1, status: 1 }, {}],
    [{ email: 1 }, { unique: true }], [{ email: 1 }, { unique: true }],
    [{ token: 1 }, { partialFilterExpression: { token: { $type: 'string' } } }],
  ], [
    { name: '_id_', key: { _id: 1 } },
    { name: 'hash_1', key: { hash: 1 } },
    { name: 'wrong_order', key: { status: 1, userId: 1 } },
    { name: 'old_email_name', key: { email: 1 }, unique: true },
    { name: 'legacy', key: { legacy: 1 } },
  ], [{ hash: 1 }]);
  assert.deepEqual(result.declared.map((index) => index.status), ['incompatible-options', 'missing', 'present', 'missing']);
  assert.equal(result.declared[0].enforcedOnStartup, true);
  assert.equal(result.duplicates.length, 1);
  assert.deepEqual(result.extra.map((index) => index.name), ['wrong_order', 'legacy']);
});

test('partial, TTL and uniqueness semantics must match while names/background are ignored', () => {
  const options = { partialFilterExpression: { token: { $type: 'string' } }, expireAfterSeconds: 0 };
  const actual = [{ name: 'custom', key: { token: 1 }, ...options, background: true }];
  assert.equal(compareIndexes([[{ token: 1 }, options]], actual).declared[0].status, 'present');
  assert.equal(compareIndexes([[{ token: 1 }, {}]], actual).declared[0].status, 'incompatible-options');
});
