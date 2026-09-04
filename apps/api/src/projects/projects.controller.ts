import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CascadeQueryDto } from '../common/dto/cascade-query.dto';
import { PurgeConfirmationResponseDto } from '../common/dto/purge-confirmation-response.dto';
import { HttpErrorResponseDto } from '../http-error-response.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { DeletedProjectDto } from './dto/deleted-project.dto';
import { ProjectDto } from './dto/project.dto';
import { toHttpException } from './helpers';
import { ProjectsService } from './projects.service';
import { PurgeProjectUseCase } from './use-cases/purge-project.use-case';
import { PurgeProjectsTrashUseCase } from './use-cases/purge-projects-trash.use-case';
import { RestoreProjectUseCase } from './use-cases/restore-project.use-case';
import { SoftDeleteProjectUseCase } from './use-cases/soft-delete-project.use-case';

@ApiTags('projects')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponseDto,
})
@ApiBadRequestResponse({ description: 'Validation failed', type: HttpErrorResponseDto })
@ApiNotFoundResponse({
  description: 'Project does not exist, is in the trash, or belongs to another user',
  type: HttpErrorResponseDto,
})
@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(SoftDeleteProjectUseCase) private readonly softDeleteProject: SoftDeleteProjectUseCase,
    @Inject(RestoreProjectUseCase) private readonly restoreProject: RestoreProjectUseCase,
    @Inject(PurgeProjectUseCase) private readonly purgeProject: PurgeProjectUseCase,
    @Inject(PurgeProjectsTrashUseCase)
    private readonly purgeProjectsTrash: PurgeProjectsTrashUseCase,
  ) {}

  @Post()
  @ApiBody({ type: CreateProjectDto })
  @ApiOperation({ operationId: 'createProject', summary: 'Create a project' })
  @ApiCreatedResponse({ description: 'Project created', type: ProjectDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateProjectDto,
  ): Promise<ProjectDto> {
    return ProjectDto.fromRecord(await this.projects.create(user.id, body.name));
  }
  /* добавить Patch на update имени */

  @Get()
  @ApiOperation({ operationId: 'listProjects', summary: 'List projects owned by the current user' })
  @ApiOkResponse({ description: 'Projects of the current user', type: [ProjectDto] })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ProjectDto[]> {
    const projects = await this.projects.listForOwner(user.id);

    return projects.map(ProjectDto.fromRecord);
  }

  // Объявлен ВЫШЕ параметрических маршрутов: `trash` — не UUID, и при обратном
  // порядке `ParseUUIDPipe` вернул бы `400` вместо корзины.
  @Get('trash')
  @ApiOperation({
    operationId: 'getProjectTrash',
    summary: 'List deleted projects of the current user',
  })
  @ApiOkResponse({ description: 'Deleted projects', type: [DeletedProjectDto] })
  async listDeleted(@CurrentUser() user: AuthenticatedUser): Promise<DeletedProjectDto[]> {
    const projects = await this.projects.listDeletedForOwner(user.id);

    return projects.map(DeletedProjectDto.fromRecord);
  }

  @Delete('trash')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiQuery({
    description:
      'Confirms destroying trash entries that the trash listing showed outside the target. Without it such a request is refused with 409 listing their titles.',
    name: 'cascade',
    required: false,
    type: Boolean,
  })
  @ApiOperation({
    operationId: 'purgeProjectTrash',
    summary: 'Permanently delete every project in the trash',
  })
  @ApiNoContentResponse({ description: 'Project trash emptied' })
  @ApiConflictResponse({
    description: 'Trash entries outside the target would be destroyed; confirm with cascade=true',
    type: PurgeConfirmationResponseDto,
  })
  async purgeTrash(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CascadeQueryDto,
  ): Promise<void> {
    await toHttpException(() => this.purgeProjectsTrash.execute(user.id, query.cascade ?? false));
  }

  @Delete('trash/:projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ format: 'uuid', name: 'projectId', type: String })
  @ApiQuery({
    description:
      'Confirms destroying trash entries that the trash listing showed outside the target. Without it such a request is refused with 409 listing their titles.',
    name: 'cascade',
    required: false,
    type: Boolean,
  })
  @ApiOperation({
    operationId: 'purgeProject',
    summary: 'Permanently delete a project from the trash',
  })
  @ApiNoContentResponse({ description: 'Project permanently deleted' })
  @ApiConflictResponse({
    description: 'Trash entries outside the target would be destroyed; confirm with cascade=true',
    type: PurgeConfirmationResponseDto,
  })
  async purge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: CascadeQueryDto,
  ): Promise<void> {
    await toHttpException(() =>
      this.purgeProject.execute(projectId, user.id, query.cascade ?? false),
    );
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ format: 'uuid', name: 'projectId', type: String })
  @ApiOperation({
    operationId: 'deleteProject',
    summary: 'Move a project and all of its pages to the trash',
  })
  @ApiNoContentResponse({ description: 'Project moved to the trash' })
  async softDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await toHttpException(() => this.softDeleteProject.execute(projectId, user.id));
  }

  @Post(':projectId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'projectId', type: String })
  @ApiOperation({ operationId: 'restoreProject', summary: 'Restore a project from the trash' })
  @ApiOkResponse({ description: 'Project restored', type: ProjectDto })
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectDto> {
    return ProjectDto.fromRecord(
      await toHttpException(() => this.restoreProject.execute(projectId, user.id)),
    );
  }
}
