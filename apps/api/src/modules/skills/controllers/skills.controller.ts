import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../../common/types/user.types.js';
import { CreateSkillDto } from '../dto/create-skill.dto.js';
import { QuerySkillsDto } from '../dto/query-skills.dto.js';
import { UpdateSkillDto } from '../dto/update-skill.dto.js';
import { SkillsService } from '../services/skills.service.js';

@ApiTags('skills')
@ApiBearerAuth('JWT-auth')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Skill 列表（含平台全局 + 当前公司私有）' })
  async findAll(@Query() query: QuerySkillsDto) {
    return this.skillsService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Skill 详情' })
  @ApiParam({ name: 'id', description: 'Skill ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建公司私有 Skill' })
  @ApiBody({ type: CreateSkillDto })
  async create(@Body() dto: CreateSkillDto, @CurrentUser() user: UserInfo) {
    return this.skillsService.create(dto, { id: user.id, roles: user.roles });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新 Skill' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.skillsService.update(id, dto, { id: user.id, roles: user.roles });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除 Skill' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserInfo) {
    return this.skillsService.remove(id, { id: user.id, roles: user.roles });
  }

  @Get(':id/revisions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '公司私有 Skill 版本列表' })
  async revisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillsService.listRevisionsForTenant(id);
  }

  @Post(':id/revisions/import-from-artifact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '从 metadata.artifact.path 导入新 draft 版本（公司私有 Skill）' })
  async importRevisionFromArtifact(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.skillsService.importRevisionFromArtifactForTenant(id, { id: user.id, roles: user.roles });
  }

  @Post(':id/revisions/:revisionId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布公司私有 Skill 版本' })
  async publishRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.skillsService.publishRevisionForTenant(id, revisionId, { id: user.id, roles: user.roles });
  }

  @Post(':id/revisions/:revisionId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审核公司私有 Skill 版本（approve/reject）' })
  async reviewRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() body: { action: 'approve' | 'reject'; comment?: string },
    @CurrentUser() user: UserInfo,
  ) {
    return this.skillsService.reviewRevisionForTenant(id, revisionId, { id: user.id, roles: user.roles }, body);
  }

  @Post(':id/revisions/:revisionId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销公司私有 Skill 版本' })
  async revokeRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.skillsService.revokeRevisionForTenant(id, revisionId, { id: user.id, roles: user.roles });
  }

  @Post(':id/revisions/:revisionId/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '回滚发布到指定公司私有 Skill 版本' })
  async rollbackRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.skillsService.rollbackRevisionForTenant(id, revisionId, { id: user.id, roles: user.roles });
  }
}
