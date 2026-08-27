import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { HttpErrorResponseDto } from '../http-error-response.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponseDto,
})
@ApiBadRequestResponse({ description: 'Validation failed', type: HttpErrorResponseDto })
@Controller('projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

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
}
