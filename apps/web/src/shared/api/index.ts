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
  CreatePageDto,
  CreateProjectDto,
  HttpErrorResponseDto,
  LoginDto,
  MovePageDto,
  PageDto,
  PageTreeNodeDto,
  ProjectDto,
  RegisterDto,
  RenamePageDto,
  UserProfileDto,
} from './generated/model';
export {
  createPage,
  deletePage,
  getCreatePageMutationOptions,
  getDeletePageMutationOptions,
  getGetPageTreeQueryKey,
  getGetPageTreeQueryOptions,
  getMovePageMutationOptions,
  getPageTree,
  getRenamePageMutationOptions,
  movePage,
  renamePage,
  useCreatePage,
  useDeletePage,
  useGetPageTree,
  useMovePage,
  useRenamePage,
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
