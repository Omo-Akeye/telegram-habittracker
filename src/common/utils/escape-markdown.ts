/**
 * Escapes special characters for Telegram Markdown v1 parse mode.
 *
 * Markdown v1 special characters: _ * ` [
 * See: https://core.telegram.org/bots/api#markdown-style
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*`\[]/g, '\\$&');
}
