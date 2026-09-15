import { describe, expect, it } from 'vitest';

import permissions from './permissions.js';

const { filterPermissionsByScopes } = permissions;

describe('API token permission scope filtering', () => {
  it('allows dotted extension read permissions with a read scope', () => {
    expect(filterPermissionsByScopes([
      'semanticSearch.related.read',
      'semanticSearch.related.manage',
    ], ['read'])).toEqual(['semanticSearch.related.read']);
  });

  it('requires a write scope for extension management and query permissions', () => {
    expect(filterPermissionsByScopes([
      'semanticSearch.related.read',
      'semanticSearch.related.manage',
      'semanticSearch.query',
    ], ['write'])).toEqual([
      'semanticSearch.related.read',
      'semanticSearch.related.manage',
      'semanticSearch.query',
    ]);
  });
});
