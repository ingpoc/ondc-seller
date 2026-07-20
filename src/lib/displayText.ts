export function customerReference(value: string | null | undefined): string {
  const withoutPrefix = String(value ?? '').replace(/^[a-z]+[_:-]+/i, '');
  const compact = withoutPrefix.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return compact.slice(0, 8) || 'PENDING';
}
