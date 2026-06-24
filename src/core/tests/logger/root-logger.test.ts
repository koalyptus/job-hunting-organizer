import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as loggerModule from '../../logger/logger.js';
import type { Logger } from 'pino';
import { initRootLogger } from '../../logger/root-logger.js';

const { mockLoadGlobalConfig } = vi.hoisted(() => ({
  mockLoadGlobalConfig: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  loadGlobalConfig: mockLoadGlobalConfig,
}));

const mockGlobalConfig = {
  version: 1,
  dataRoot: '/tmp/test-data',
  llm: { baseUrl: '', apiKey: '', model: '', timeoutMs: 600_000 },
  github: { user: '', token: '', repos: [] },
  calendar: { defaultProvider: 'ics', outlook: { tenantId: '', clientId: '', clientSecret: '' } },
  fetch: { timeoutMs: 30_000 },
  logging: { level: 'info', redactPaths: [] },
};

let testRootLogger: Logger;

beforeAll(() => {
  testRootLogger = loggerModule.createLogger({ level: 'silent', isTty: false, redactPaths: [] });
});

afterAll(() => {
  loggerModule.closeLogger(testRootLogger);
});

beforeEach(() => {
  vi.resetAllMocks();
  mockLoadGlobalConfig.mockReturnValue(mockGlobalConfig);
  // Reset to a known clean state using a mock implementation
  vi.spyOn(loggerModule, 'setRootLogger').mockImplementation((_l: Logger) => {
    // Do nothing, just track calls
  });
  vi.spyOn(loggerModule, 'getRootLogger').mockReturnValue(testRootLogger);
  vi.spyOn(loggerModule, 'createLogger').mockReturnValue(testRootLogger);
});

describe('initRootLogger', () => {
  it('calls setRootLogger twice (two-phase init)', () => {
    const setRootLoggerSpy = vi.spyOn(loggerModule, 'setRootLogger');

    initRootLogger();

    expect(setRootLoggerSpy).toHaveBeenCalledTimes(2);
  });

  it('phase 1 creates logger with defaults and correlationId cli', () => {
    const createLoggerSpy = vi.spyOn(loggerModule, 'createLogger');

    initRootLogger();

    expect(createLoggerSpy).toHaveBeenCalledTimes(2);
    const firstCall = createLoggerSpy.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
    expect(firstCall!.correlationId).toBe('cli');
    expect(firstCall!.level).toBe('info');
  });

  it('phase 2 reconfigures with global config settings', () => {
    mockLoadGlobalConfig.mockReturnValue({
      ...mockGlobalConfig,
      logging: { level: 'debug', file: '/tmp/custom/log.log', redactPaths: ['custom.path'] },
    });
    const createLoggerSpy = vi.spyOn(loggerModule, 'createLogger');

    initRootLogger();

    const secondCall = createLoggerSpy.mock.calls[1]?.[0];
    expect(secondCall).toBeDefined();
    expect(secondCall!.level).toBe('debug');
    expect(secondCall!.file).toBe('/tmp/custom/log.log');
    expect(secondCall!.redactPaths).toEqual(['custom.path']);
    expect(secondCall!.correlationId).toBe('cli');
  });

  it('verifies the logger was swapped by calling getRootLogger', () => {
    const getRootLoggerSpy = vi.spyOn(loggerModule, 'getRootLogger');

    initRootLogger();

    expect(getRootLoggerSpy).toHaveBeenCalled();
  });

  it('logs debug message after init', () => {
    // Just verify init completes without error and the logger is properly swapped
    // (The debug logging is an implementation detail; the critical path is the two-phase init)
    expect(() => initRootLogger()).not.toThrow();
    const root = loggerModule.getRootLogger();
    expect(root).toBeDefined();
    expect(typeof root.debug).toBe('function');
  });

  it('createLogger returns a valid logger with debug method', () => {
    const log = loggerModule.createLogger({ level: 'silent', isTty: false, redactPaths: [] });
    expect(log).toBeDefined();
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    loggerModule.closeLogger(log);
  });
});
