import { describe, expect, it } from 'vitest';
import { classifyArmorResult } from '../src/services/model-armor.js';

describe('Model Armor verdict handling', () => {
  it('allows the safe verdict returned for the default Clockwork Moon adventure', () => {
    expect(
      classifyArmorResult({
        sanitizationResult: {
          filterMatchState: 'NO_MATCH_FOUND',
        },
      }),
    ).toBe('allow');
  });

  it('blocks only an exact positive match', () => {
    expect(
      classifyArmorResult({
        sanitizationResult: {
          filterMatchState: 'MATCH_FOUND',
        },
      }),
    ).toBe('block');
  });

  it('fails closed when Model Armor returns an unknown response', () => {
    expect(classifyArmorResult({ sanitizationResult: {} })).toBe('indeterminate');
  });
});
