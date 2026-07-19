import { describe, it, expect } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { handleToolError } from '../error-handler.js';
import { ApplicationNotFoundError } from '../../core/applications/applications.js';
import { InterviewNotFoundError } from '../../core/interviews/interviews.js';
import { CoverLetterError } from '../../core/applications/cover-letter.js';
import { AnswerError } from '../../core/applications/application-qa.js';
import { TrackError } from '../../core/track/errors.js';
import { RepairError } from '../../core/repair/repair.js';
import { DoctorError } from '../../core/doctor/doctor.js';
import { RetroError } from '../../core/retro/retro.js';
import { PrepError } from '../../core/prepare/prepare.js';
import { ProfileReadError } from '../../core/campaign/profile.js';
import { StatsError } from '../../core/stats/errors.js';
import { ListError } from '../../core/list/errors.js';
import { InitError } from '../../core/init/errors.js';

function getText(result: CallToolResult): string {
  const block = result.content[0];
  if (block && 'text' in block) {
    return block.text;
  }
  throw new Error('Expected text content block');
}

describe('handleToolError', () => {
  it('maps ApplicationNotFoundError', () => {
    const result = handleToolError(new ApplicationNotFoundError('acme'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Application not found');
    expect(getText(result)).toContain('acme');
  });

  it('maps InterviewNotFoundError', () => {
    const result = handleToolError(new InterviewNotFoundError('acme'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Interview not found');
    expect(getText(result)).toContain('acme');
  });

  it('maps CoverLetterError', () => {
    const result = handleToolError(new CoverLetterError('missing jd'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Cover letter error');
    expect(getText(result)).toContain('missing jd');
  });

  it('maps AnswerError', () => {
    const result = handleToolError(new AnswerError('bad question'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Answer generation error');
    expect(getText(result)).toContain('bad question');
  });

  it('maps TrackError', () => {
    const result = handleToolError(new TrackError('duplicate slug'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Track error');
    expect(getText(result)).toContain('duplicate slug');
  });

  it('maps RepairError', () => {
    const result = handleToolError(new RepairError('corrupt data'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Repair error');
    expect(getText(result)).toContain('corrupt data');
  });

  it('maps DoctorError', () => {
    const result = handleToolError(new DoctorError('check failed'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Doctor error');
    expect(getText(result)).toContain('check failed');
  });

  it('maps RetroError', () => {
    const result = handleToolError(new RetroError('no retro found'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Retro error');
    expect(getText(result)).toContain('no retro found');
  });

  it('maps PrepError', () => {
    const result = handleToolError(new PrepError('no interview'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Prep error');
    expect(getText(result)).toContain('no interview');
  });

  it('maps ProfileReadError', () => {
    const result = handleToolError(new ProfileReadError('file missing'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Profile error');
    expect(getText(result)).toContain('file missing');
  });

  it('maps StatsError', () => {
    const result = handleToolError(new StatsError('no data'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Stats error');
    expect(getText(result)).toContain('no data');
  });

  it('maps ListError', () => {
    const result = handleToolError(new ListError('bad filter'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('List error');
    expect(getText(result)).toContain('bad filter');
  });

  it('maps InitError', () => {
    const result = handleToolError(new InitError('already initialized'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain('Init error');
    expect(getText(result)).toContain('already initialized');
  });

  it('maps unknown Error subclass', () => {
    const result = handleToolError(new Error('something broke'));
    expect(result.isError).toBe(true);
    expect(getText(result)).toBe('Error: something broke');
  });

  it('maps non-Error values', () => {
    const result = handleToolError('raw string');
    expect(result.isError).toBe(true);
    expect(getText(result)).toBe('Error: raw string');
  });

  it('maps null/undefined', () => {
    const result = handleToolError(null);
    expect(result.isError).toBe(true);
    expect(getText(result)).toBe('Error: null');
  });
});
