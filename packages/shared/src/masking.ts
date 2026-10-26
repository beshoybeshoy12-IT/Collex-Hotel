/** Masks an identifier for lists and logs, keeping only the last 4 characters. */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return '';
  const clean = value.replace(/\s+/g, '');
  if (clean.length <= 4) return '•'.repeat(clean.length);
  return '•'.repeat(Math.min(clean.length - 4, 8)) + clean.slice(-4);
}

/** Masks an email for broad reports: j***@example.com */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return '';
  const [user, domain] = value.split('@');
  if (!domain) return maskIdentifier(value);
  return `${user.slice(0, 1)}***@${domain}`;
}
