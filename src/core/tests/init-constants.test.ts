import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAMPAIGN,
  CV_EXTENSIONS,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_MODEL,
  DEFAULT_CALENDAR_PROVIDER,
  KB_GITHUB,
  DEFAULT_LOG_LEVEL,
} from '../init/constants.js';

describe('init constants', () => {
  it('DEFAULT_CAMPAIGN is "default"', () => {
    expect(DEFAULT_CAMPAIGN).toBe('default');
  });

  it('CV_EXTENSIONS includes pdf, docx, md, txt', () => {
    expect(CV_EXTENSIONS).toContain('.pdf');
    expect(CV_EXTENSIONS).toContain('.docx');
    expect(CV_EXTENSIONS).toContain('.md');
    expect(CV_EXTENSIONS).toContain('.txt');
  });

  it('DEFAULT_LLM_BASE_URL is a valid URL', () => {
    expect(DEFAULT_LLM_BASE_URL).toMatch(/^https?:\/\//);
  });

  it('DEFAULT_LLM_API_KEY is a non-empty string', () => {
    expect(DEFAULT_LLM_API_KEY.length).toBeGreaterThan(0);
  });

  it('DEFAULT_LLM_MODEL is a non-empty string', () => {
    expect(DEFAULT_LLM_MODEL.length).toBeGreaterThan(0);
  });

  it('DEFAULT_CALENDAR_PROVIDER is "ics"', () => {
    expect(DEFAULT_CALENDAR_PROVIDER).toBe('ics');
  });

  it('KB_GITHUB is "github"', () => {
    expect(KB_GITHUB).toBe('github');
  });

  it('DEFAULT_LOG_LEVEL is "info"', () => {
    expect(DEFAULT_LOG_LEVEL).toBe('info');
  });
});
