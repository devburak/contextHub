import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseArgs } = require('./backfillTenantAccounts');

describe('backfillTenantAccounts arguments', () => {
  it('is dry-run unless apply is explicit', () => {
    expect(parseArgs([])).toEqual({ apply: false, tenantSlug: null });
  });

  it('accepts an explicit tenant and apply mode', () => {
    expect(parseArgs(['--apply', '--tenant-slug=acme'])).toEqual({
      apply: true,
      tenantSlug: 'acme',
    });
  });
});
