export { type ApiFetchOptions, apiFetch, type ErrorType } from './api-fetch';
export {
  clearAccessToken,
  configureAuthTransport,
  getAccessToken,
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
  CreatePageDto,
  CreateProjectDto,
  GrantPagePermissionDto,
  HttpErrorResponseDto,
  LoginDto,
  MovePageDto,
  PageDto,
  PagePermissionDto,
  PageTreeNodeDto,
  ProjectDto,
  RegisterDto,
  RenamePageDto,
  SetAccessModeDto,
  UserProfileDto,
} from './generated/model';
export {
  getGetPagePermissionsQueryKey,
  getGetPagePermissionsQueryOptions,
  getGrantPagePermissionMutationOptions,
  getRevokePagePermissionMutationOptions,
  useGetPagePermissions,
  useGrantPagePermission,
  useRevokePagePermission,
} from './generated/page-permissions/page-permissions';
export {
  createPage,
  deletePage,
  getCreatePageMutationOptions,
  getDeletePageMutationOptions,
  getGetPageQueryKey,
  getGetPageQueryOptions,
  getGetPageTreeQueryKey,
  getGetPageTreeQueryOptions,
  getGetSharedPagesQueryKey,
  getGetSharedPagesQueryOptions,
  getMovePageMutationOptions,
  getPageTree,
  getRenamePageMutationOptions,
  getSetPageAccessModeMutationOptions,
  getSharedPages,
  movePage,
  renamePage,
  useCreatePage,
  useDeletePage,
  useGetPageTree,
  useGetSharedPages,
  useMovePage,
  useRenamePage,
  useSetPageAccessMode,
} from './generated/pages/pages';
export {
  createProject,
  deleteProject,
  getCreateProjectMutationOptions,
  getDeleteProjectMutationOptions,
  getListProjectsQueryKey,
  getListProjectsQueryOptions,
  listProjects,
  useCreateProject,
  useDeleteProject,
  useListProjects,
} from './generated/projects/projects';

export async function startBrowserMocking() {
  const browserMocks = await import('./mocks/browser');

  return browserMocks.startBrowserMocking();
}
