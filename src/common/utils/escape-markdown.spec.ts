import { escapeMarkdown } from './escape-markdown';

describe('escapeMarkdown', () => {
  it('should escape Markdown v1 special characters (_ * ` [)', () => {
    const input = 'Hello _world_ *bold* `code` [link]!';
    const result = escapeMarkdown(input);
    expect(result).toBe('Hello \\_world\\_ \\*bold\\* \\`code\\` \\[link]!');
  });

  it('should leave un-special characters alone', () => {
    const input = 'Normal text 123 - = # . !';
    const result = escapeMarkdown(input);
    expect(result).toBe('Normal text 123 - = # . !');
  });

  it('should handle empty string', () => {
    expect(escapeMarkdown('')).toBe('');
  });
});
