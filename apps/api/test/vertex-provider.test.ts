import { describe, expect, it } from 'vitest';
import { GmBibleSchema } from '@family-adventure/shared';
import { normalizeGmBibleCandidate } from '../src/providers/vertex-narrative-provider.js';

describe('Vertex campaign planning output', () => {
  it('normalizes creative model text to the canonical campaign limits', () => {
    const normalized = GmBibleSchema.parse(
      normalizeGmBibleCandidate({
        premise: ` A gentle premise ${'p'.repeat(1100)} `,
        secret: `A secret ${'s'.repeat(600)}`,
        acts: Array.from({ length: 4 }, (_, index) => `Act ${index} ${'a'.repeat(600)}`),
        factions: Array.from({ length: 9 }, (_, index) => `Faction ${index} ${'f'.repeat(250)}`),
        unresolvedThreats: Array.from(
          { length: 13 },
          (_, index) => `Threat ${index} ${'t'.repeat(350)}`,
        ),
        possibleEndings: Array.from(
          { length: 7 },
          (_, index) => `Ending ${index} ${'e'.repeat(450)}`,
        ),
      }),
    );

    expect(normalized.acts).toHaveLength(3);
    expect(normalized.factions).toHaveLength(8);
    expect(normalized.factions.every((entry) => entry.length <= 200)).toBe(true);
    expect(normalized.unresolvedThreats).toHaveLength(12);
    expect(normalized.possibleEndings).toHaveLength(6);
  });
});
