import { describe, it, expect } from 'vitest';
import common from './index.js';

describe('common package entry point', () => {
  it('exposes database helpers', () => {
    expect(common).toHaveProperty('database');
    expect(typeof common.database.connectDB).toBe('function');
    expect(typeof common.database.disconnectDB).toBe('function');
    expect(typeof common.database.createIndexes).toBe('function');
  });

  it('includes registered models', () => {
    expect(Object.keys(common).length).toBeGreaterThan(1);
    expect(common).toHaveProperty('Tenant');
    expect(common).toHaveProperty('User');
  });
});
