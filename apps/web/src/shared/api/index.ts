export { type ApiFetchOptions, apiFetch, type ErrorType } from './api-fetch';
export {
  clearAccessToken,
  configureAuthTransport,
  refreshAccessToken,
  setAccessToken,
} from './auth-session';
export {
  getCurrentUser,
  getGetCurrentUserQueryKey,
  getGetCurrentUserQueryOptions,
  login,
  logout,
  refreshTokens,
  register,
  useGetCurrentUser,
} from './generated/auth/auth';
export type {
  AuthResponseDto,
  HttpErrorResponseDto,
  LoginDto,
  RegisterDto,
  UserProfileDto,
} from './generated/model';

export async function startBrowserMocking() {
  const browserMocks = await import('./mocks/browser');

  return browserMocks.startBrowserMocking();
}
