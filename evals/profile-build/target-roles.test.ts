import { describe, it, expect } from 'vitest';
import { parseTargetRoles } from '../../src/core/target-roles.js';
import { loadCases } from './target-roles-cases.js';

describe('target-roles parsing', () => {
  for (const { name, input, expected } of loadCases()) {
    it(name, () => {
      const actual = parseTargetRoles(input);
      expect(actual).toEqual(expected);
    });
  }
});
