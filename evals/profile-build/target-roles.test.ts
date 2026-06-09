import { describe, it, expect } from 'vitest';
import { parseTargetRoles } from '../../src/core/target-roles.js';
import { cases } from './target-roles-cases.js';

describe('target-roles parsing', () => {
  for (const { name, input, expected } of cases) {
    it(name, () => {
      const actual = parseTargetRoles(input);
      expect(actual).toEqual(expected);
    });
  }
});
