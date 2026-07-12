import { describe, it, expect } from 'vitest';
import { extractTargetRoles } from '../../src/core/campaign/target-roles.js';
import { loadCases } from './target-roles-cases.js';

describe('target-roles parsing', () => {
  for (const { name, input, expected } of loadCases()) {
    it(name, () => {
      const actual = extractTargetRoles(input);
      expect(actual).toEqual(expected);
    });
  }
});
