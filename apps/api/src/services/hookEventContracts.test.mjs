import { describe, expect, it } from 'vitest';
import { DOMAIN_EVENT_TYPES } from '@contexthub/common';

describe('critical webhook event contracts', () => {
  it('supports menu, placement, collection, and collection-entry lifecycle events', () => {
    expect(DOMAIN_EVENT_TYPES).toEqual(expect.arrayContaining([
      'menu.created',
      'menu.updated',
      'menu.deleted',
      'placement.created',
      'placement.updated',
      'placement.deleted',
      'collection.created',
      'collection.updated',
      'collection.deleted',
      'collection.entry.created',
      'collection.entry.updated',
      'collection.entry.deleted',
    ]));
  });
});
