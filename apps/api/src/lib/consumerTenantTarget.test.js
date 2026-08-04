import { describe, expect, it } from 'vitest';

import { resolveConsumerTenantQuery } from './consumerTenantTarget';

describe('consumer tenant target', () => {
  it('treats a 12-character tenant slug as a slug', () => {
    expect(resolveConsumerTenantQuery('mulkiyeorgtr')).toEqual({
      slug: 'mulkiyeorgtr'
    });
  });

  it('treats only exact 24-character hexadecimal values as object ids', () => {
    expect(resolveConsumerTenantQuery('6a1702eddffc9f11747a4205')).toEqual({
      _id: '6a1702eddffc9f11747a4205'
    });
    expect(resolveConsumerTenantQuery('zz1702eddffc9f11747a4205')).toEqual({
      slug: 'zz1702eddffc9f11747a4205'
    });
  });

  it('trims values and rejects an empty target', () => {
    expect(resolveConsumerTenantQuery('  mulkiyeorgtr  ')).toEqual({
      slug: 'mulkiyeorgtr'
    });
    expect(resolveConsumerTenantQuery('   ')).toBeNull();
  });
});
