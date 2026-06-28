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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../common/types/user.types.js';
import { TenantContextService } from '@service/tenant';
import {
  CreateScheduledPlaybookDto,
  QueryScheduledPlaybooksDto,
  UpdateScheduledPlaybookDto,
} from './dto/scheduled-playbook.dto.js';
import { ScheduledPlaybookRunnerService } from './services/scheduled-playbook-runner.service.js';
import { ScheduledPlaybooksService } from './services/scheduled-playbooks.service.js';

@ApiTags('scheduled-playbooks')
@Controller('companies/:companyId/scheduled-playbooks')
export class ScheduledPlaybooksController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly schedules: ScheduledPlaybooksService,
    private readonly runner: ScheduledPlaybookRunnerService,
  ) {}

  private actor(user: UserInfo) {
    return { id: user.id, roles: user.roles };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '列出公司定时 Playbook' })
  async list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: QueryScheduledPlaybooksDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(companyId, () =>
      this.schedules.list(companyId, this.actor(user), query),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建定时 Playbook' })
  async create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateScheduledPlaybookDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(companyId, () =>
      this.schedules.create(companyId, dto, this.actor(user)),
    );
  }

  @Get(':scheduleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取定时 Playbook 详情' })
  async get(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(companyId, () =>
      this.schedules.get(companyId, scheduleId, this.actor(user)),
    );
  }

  @Patch(':scheduleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新定时 Playbook' })
  async update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateScheduledPlaybookDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(companyId, () =>
      this.schedules.update(companyId, scheduleId, dto, this.actor(user)),
    );
  }

  @Delete(':scheduleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除定时 Playbook' })
  async remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(companyId, () =>
      this.schedules.remove(companyId, scheduleId, this.actor(user)),
    );
  }

  @Post(':scheduleId/run-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '立即触发定时 Playbook' })
  async runNow(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(companyId, () =>
      this.runner.triggerNow(companyId, scheduleId, this.actor(user)),
    );
  }
}
