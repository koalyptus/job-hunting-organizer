import { describe, expect, it } from 'vitest';
import { runMigrations } from '../../config/migrations.js';

describe('runMigrations', () => {
  it('returns config unchanged when stored version equals current', () => {
    const raw = { version: 1, data: 'test' };
    const migrations = new Map();
    const result = runMigrations(raw, migrations, 1);
    expect(result).toEqual({ version: 1, data: 'test' });
  });

  it('returns config unchanged when stored version exceeds current', () => {
    const raw = { version: 3, data: 'test' };
    const migrations = new Map();
    const result = runMigrations(raw, migrations, 1);
    expect(result).toEqual({ version: 3, data: 'test' });
  });

  it('runs a single migration from v1 to v2', () => {
    const raw = { version: 1, oldField: 'value' };
    const migrations = new Map([
      [1, (old: Record<string, unknown>) => ({ ...old, newField: 'added' })],
    ]);
    const result = runMigrations(raw, migrations, 2);
    expect(result).toEqual({ version: 2, oldField: 'value', newField: 'added' });
  });

  it('runs sequential migrations v1 → v2 → v3', () => {
    const raw = { version: 1, step: 0 };
    const migrations = new Map([
      [1, (old: Record<string, unknown>) => ({ ...old, step: 1 })],
      [2, (old: Record<string, unknown>) => ({ ...old, step: 2 })],
    ]);
    const result = runMigrations(raw, migrations, 3);
    expect(result).toEqual({ version: 3, step: 2 });
  });

  it('throws when migration function is missing', () => {
    const raw = { version: 1 };
    const migrations = new Map<number, never>();
    expect(() => runMigrations(raw, migrations, 2)).toThrow('no migration function for v1 → v2');
  });

  it('defaults stored version to 1 when missing', () => {
    const raw = { data: 'test' };
    const migrations = new Map([
      [1, (old: Record<string, unknown>) => ({ ...old, migrated: true })],
    ]);
    const result = runMigrations(raw, migrations, 2);
    expect(result).toEqual({ version: 2, data: 'test', migrated: true });
  });

  it('does not mutate the original object', () => {
    const raw = { version: 1, data: 'test' };
    const migrations = new Map([
      [1, (old: Record<string, unknown>) => ({ ...old, data: 'changed' })],
    ]);
    runMigrations(raw, migrations, 2);
    expect(raw).toEqual({ version: 1, data: 'test' });
  });
});
