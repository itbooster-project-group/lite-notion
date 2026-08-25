const allowedReturnPaths = new Set(['/', '/profile']);

export function getSafeReturnPath(candidate: string | null | undefined): string {
  return candidate !== undefined && candidate !== null && allowedReturnPaths.has(candidate)
    ? candidate
    : '/';
}

export function getLoginPath(pathname: string): string {
  const returnPath = getSafeReturnPath(pathname);
  return `/login?next=${encodeURIComponent(returnPath)}`;
}
