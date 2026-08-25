type RefreshAccessToken = () => Promise<string>;
type SessionExpired = () => void;

type AuthTransportConfiguration = Readonly<{
  refreshAccessToken: RefreshAccessToken;
  onSessionExpired: SessionExpired;
}>;

let accessToken: string | undefined;
let configuration: AuthTransportConfiguration | undefined;
let refreshPromise: Promise<string> | undefined;

export function getAccessToken(): string | undefined {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = undefined;
}

export function configureAuthTransport(nextConfiguration: AuthTransportConfiguration): () => void {
  configuration = nextConfiguration;

  return () => {
    if (configuration === nextConfiguration) {
      configuration = undefined;
    }
  };
}

export function canRefreshAccessToken(): boolean {
  return configuration !== undefined;
}

export async function refreshAccessToken(): Promise<string> {
  const currentConfiguration = configuration;

  if (currentConfiguration === undefined) {
    throw new Error('Auth transport is not configured');
  }

  refreshPromise ??= currentConfiguration
    .refreshAccessToken()
    .then((token) => {
      setAccessToken(token);
      return token;
    })
    .catch((error: unknown) => {
      if (isUnauthorized(error)) {
        expireSession();
      }

      throw error;
    })
    .finally(() => {
      refreshPromise = undefined;
    });

  return refreshPromise;
}

export function expireSession(): void {
  clearAccessToken();
  configuration?.onSessionExpired();
}

function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}
