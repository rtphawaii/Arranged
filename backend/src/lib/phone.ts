/** Minimal E.164 normalisation. Real deployments should use libphonenumber. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) return null;
  const body = digits.slice(1);
  if (!/^\d{7,15}$/.test(body)) return null;
  return `+${body}`;
}
