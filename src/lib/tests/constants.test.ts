import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMPAIGN, CV_EXTENSIONS, KB_GITHUB } from '../constants.js';

describe('core constants', () => {
  it('DEFAULT_CAMPAIGN is "default"', () => {
    expect(DEFAULT_CAMPAIGN).toBe('default');
  });

  it('CV_EXTENSIONS includes pdf, docx, md, txt', () => {
    expect(CV_EXTENSIONS).toContain('.pdf');
    expect(CV_EXTENSIONS).toContain('.docx');
    expect(CV_EXTENSIONS).toContain('.md');
    expect(CV_EXTENSIONS).toContain('.txt');
  });

  it('KB_GITHUB is "github"', () => {
    expect(KB_GITHUB).toBe('github');
  });
});
