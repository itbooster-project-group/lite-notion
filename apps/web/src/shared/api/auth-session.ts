type RefreshAccessToken = () => Promise<string>;
type SessionExpired = () => void;

type AuthTransportConfiguration = Readonly<{
  refreshAccessToken: RefreshAccessToken;
  onSessionExpired: SessionExpired;
}>;

export type AuthStateSnapshot = Readonly<{
  accessToken: string | undefined;
  generation: number;
}>;

export type RefreshOutcome = 'refreshed' | 'superseded';

type RefreshFlight = Readonly<{
  configuration: AuthTransportConfiguration;
  generation: number;
  promise: Promise<RefreshOutcome>;
}>;

let accessToken: string | undefined;
let configuration: AuthTransportConfiguration | undefined;
let generation = 0;
let refreshFlight: RefreshFlight | undefined;

export function getAccessToken(): string | undefined {
  return accessToken;
}

export function getAuthStateSnapshot(): AuthStateSnapshot {
  return { accessToken, generation };
}

export function isAuthStateCurrent(snapshot: AuthStateSnapshot): boolean {
  return generation === snapshot.generation;
}

export function setAccessToken(token: string): void {
  accessToken = token;
  generation += 1;
}

export function clearAccessToken(): void {
  accessToken = undefined;
  generation += 1;
}

export function configureAuthTransport(nextConfiguration: AuthTransportConfiguration): () => void {
  configuration = nextConfiguration;
  generation += 1;

  return () => {
    if (configuration === nextConfiguration) {
      configuration = undefined;
      generation += 1;
    }
  };
}

export function canRefreshAccessToken(): boolean {
  return configuration !== undefined;
}

export async function refreshAccessToken(): Promise<RefreshOutcome> {
  const currentConfiguration = configuration;

  if (currentConfiguration === undefined) {
    throw new Error('Auth transport is not configured');
  }

  if (
    refreshFlight?.generation === generation &&
    refreshFlight.configuration === currentConfiguration
  ) {
    return refreshFlight.promise;
  }

  const refreshGeneration = generation;
  let nextFlight: RefreshFlight;
  const promise = Promise.resolve()
    .then(() => currentConfiguration.refreshAccessToken())
    .then((token) => {
      if (!isRefreshCurrent(refreshGeneration, currentConfiguration)) {
        return 'superseded' as const;
      }

      setAccessToken(token);
      return 'refreshed' as const;
    })
    .catch((error: unknown) => {
      if (!isRefreshCurrent(refreshGeneration, currentConfiguration)) {
        return 'superseded' as const;
      }

      if (isUnauthorized(error)) {
        expireSession({ accessToken, generation: refreshGeneration });
      }

      throw error;
    })
    .finally(() => {
      if (refreshFlight === nextFlight) {
        refreshFlight = undefined;
      }
    });

  nextFlight = { configuration: currentConfiguration, generation: refreshGeneration, promise };
  refreshFlight = nextFlight;
  return promise;
}

export function expireSession(expectedState?: AuthStateSnapshot): void {
  if (expectedState !== undefined && !isAuthStateCurrent(expectedState)) {
    return;
  }

  const currentConfiguration = configuration;
  clearAccessToken();
  currentConfiguration?.onSessionExpired();
}

function isRefreshCurrent(
  refreshGeneration: number,
  refreshConfiguration: AuthTransportConfiguration,
): boolean {
  return generation === refreshGeneration && configuration === refreshConfiguration;
}

function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}
