const allowedReturnPaths = new Set(['/', '/profile']);

export function getSafeReturnPath(candidate: string | null | undefined): string {
  return candidate !== undefined && candidate !== null && allowedReturnPaths.has(candidate)
    ? candidate
    : '/';
}

export function getAuthFormPath(
  destination: '/login' | '/register',
  candidate: string | null | undefined,
): string {
  return allowedReturnPaths.has(candidate ?? '')
    ? `${destination}?next=${encodeURIComponent(candidate ?? '')}`
    : destination;
}
