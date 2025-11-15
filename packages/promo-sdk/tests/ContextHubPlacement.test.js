import { describe, it, expect } from 'vitest';
import { ContextHubPlacement } from '../src/index';

describe('ContextHubPlacement', () => {
  it('builds html for text-based experiences', () => {
    const placement = new ContextHubPlacement();
    const decision = {
      placement: { _id: 'plc_123' },
      experience: {
        content: {
          type: 'text',
          title: 'Hoş geldiniz',
          message: 'Yeni kampanyayı keşfedin',
          cta: {
            text: 'Detaylar',
            url: '/kampanya',
            newTab: true
          }
        },
        ui: {}
      },
      decisionId: 'dec_456'
    };

    const html = placement.buildHTML(decision);

    expect(html).toContain('<h2>Hoş geldiniz</h2>');
    expect(html).toContain('<p>Yeni kampanyayı keşfedin</p>');
    expect(html).toContain('target="_blank"');
  });

  it('returns fallback string for unknown content types', () => {
    const placement = new ContextHubPlacement();
    const decision = {
      placement: { _id: 'plc_789' },
      experience: {
        content: {
          type: 'unknown'
        },
        ui: {}
      },
      decisionId: 'dec_987'
    };

    const html = placement.buildHTML(decision);

    expect(html).toContain('Unknown content type: unknown');
  });
});
