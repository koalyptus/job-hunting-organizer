import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { renderMarkdown } from '../markdown.js';

describe('markdown renderer', () => {
  let originalNoColor: string | undefined;

  beforeEach(() => {
    originalNoColor = process.env['NO_COLOR'];
  });

  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env['NO_COLOR'];
    } else {
      process.env['NO_COLOR'] = originalNoColor;
    }
  });

  it('renders headings with content', () => {
    const result = renderMarkdown('# Hello World');
    expect(result).toContain('Hello World');
  });

  it('renders subheadings', () => {
    const result = renderMarkdown('## Subheading');
    expect(result).toContain('Subheading');
  });

  it('renders bold text', () => {
    const result = renderMarkdown('**bold text**');
    expect(result).toContain('bold text');
  });

  it('renders italic text', () => {
    const result = renderMarkdown('*italic text*');
    expect(result).toContain('italic text');
  });

  it('renders inline code', () => {
    const result = renderMarkdown('`code span`');
    expect(result).toContain('code span');
  });

  it('renders code blocks', () => {
    const result = renderMarkdown('```\ncode block\n```');
    expect(result).toContain('code block');
  });

  it('renders code blocks with language', () => {
    const result = renderMarkdown('```typescript\nconst x = 1;\n```');
    expect(result).toContain('const x = 1;');
  });

  it('renders unordered lists', () => {
    const result = renderMarkdown('- item 1\n- item 2\n- item 3');
    expect(result).toContain('item 1');
    expect(result).toContain('item 2');
    expect(result).toContain('item 3');
  });

  it('renders ordered lists', () => {
    const result = renderMarkdown('1. first\n2. second\n3. third');
    expect(result).toContain('first');
    expect(result).toContain('second');
    expect(result).toContain('third');
  });

  it('renders links', () => {
    const result = renderMarkdown('[link text](https://example.com)');
    expect(result).toContain('link text');
    expect(result).toContain('https://example.com');
  });

  it('renders blockquotes', () => {
    const result = renderMarkdown('> quoted text');
    expect(result).toContain('quoted text');
  });

  it('renders horizontal rules', () => {
    const result = renderMarkdown('---');
    // marked-terminal renders horizontal rules as empty lines or with spacing
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('renders tables', () => {
    const md = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |';
    const result = renderMarkdown(md);
    expect(result).toContain('Header 1');
    expect(result).toContain('Cell 1');
  });

  it('renders multiple elements together', () => {
    const md = `# Title

Some **bold** text and *italic*.

- List item 1
- List item 2

\`\`\`typescript
const x = 1;
\`\`\`

[Link](https://example.com)`;
    const result = renderMarkdown(md);
    expect(result).toContain('Title');
    expect(result).toContain('bold');
    expect(result).toContain('italic');
    expect(result).toContain('List item 1');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('Link');
  });

  it('handles empty input', () => {
    const result = renderMarkdown('');
    expect(result).toBeDefined();
  });

  it('handles plain text without markdown', () => {
    const result = renderMarkdown('Just plain text');
    expect(result).toContain('Just plain text');
  });

  it('respects NO_COLOR environment variable', () => {
    process.env['NO_COLOR'] = '1';
    const result = renderMarkdown('# Heading');
    expect(result).toContain('Heading');
    // With NO_COLOR, there should be no ANSI escape codes
    // eslint-disable-next-line no-control-regex
    expect(result).not.toMatch(/\u001b\[[0-9;]*m/);
  });
});
