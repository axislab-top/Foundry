import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { TenantContextService } from '@service/tenant';
import {
  CreateScheduledPlaybookFromAgentDto,
  QueryScheduledPlaybooksDto,
  UpdateScheduledPlaybookDto,
} from './dto/scheduled-playbook.dto.js';
import { ScheduledPlaybooksService } from './services/scheduled-playbooks.service.js';

class InternalScheduledPlaybooksListDto {
  @IsUUID()
  companyId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => QueryScheduledPlaybooksDto)
  query?: QueryScheduledPlaybooksDto;
}

class InternalScheduledPlaybooksCreateDto extends CreateScheduledPlaybookFromAgentDto {
  @IsUUID()
  companyId: string;
}

class InternalScheduledPlaybooksUpdateDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  scheduleId: string;

  @ValidateNested()
  @Type(() => UpdateScheduledPlaybookDto)
  data: UpdateScheduledPlaybookDto;
}

class InternalScheduledPlaybooksRemoveDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  scheduleId: string;
}

@Controller('internal/tools/scheduled-playbooks')
export class ScheduledPlaybooksToolsInternalController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly schedules: ScheduledPlaybooksService,
  ) {}

  private assertToken(token: string | undefined): void {
    const expected = String(process.env.API_INTERNAL_AUTH_SECRET ?? '').trim();
    if (!expected) throw new UnauthorizedException('internal tool routes disabled');
    if (String(token ?? '').trim() !== expected) throw new UnauthorizedException('invalid internal auth');
  }

  private internalActor(agentId?: string) {
    return {
      id: agentId?.trim() || '00000000-0000-0000-0000-000000000001',
      roles: ['admin'] as string[],
    };
  }

  @Post('list')
  @HttpCode(HttpStatus.OK)
  async list(@Query('token') token: string | undefined, @Body() body: InternalScheduledPlaybooksListDto) {
    this.assertToken(token);
    const actor = this.internalActor();
    return this.tenantContext.runWithCompanyId(body.companyId, async () => {
      const out = await this.schedules.list(body.companyId, actor, body.query ?? {});
      return { ok: true, ...out };
    });
  }

  @Post('create')
  @HttpCode(HttpStatus.OK)
  async create(@Query('token') token: string | undefined, @Body() body: InternalScheduledPlaybooksCreateDto) {
    this.assertToken(token);
    const { companyId, ...data } = body;
    const actor = this.internalActor(data.createdByAgentId);
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const schedule = await this.schedules.createFromAgent(companyId, data, actor);
      return { ok: true, schedule };
    });
  }

  @Post('update')
  @HttpCode(HttpStatus.OK)
  async update(@Query('token') token: string | undefined, @Body() body: InternalScheduledPlaybooksUpdateDto) {
    this.assertToken(token);
    const actor = this.internalActor();
    return this.tenantContext.runWithCompanyId(body.companyId, async () => {
      const schedule = await this.schedules.updateFromAgent(
        body.companyId,
        body.scheduleId,
        body.data,
        actor,
      );
      return { ok: true, schedule };
    });
  }

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  async remove(@Query('token') token: string | undefined, @Body() body: InternalScheduledPlaybooksRemoveDto) {
    this.assertToken(token);
    const actor = this.internalActor();
    return this.tenantContext.runWithCompanyId(body.companyId, async () => {
      await this.schedules.removeFromAgent(body.companyId, body.scheduleId, actor);
      return { ok: true };
    });
  }
}
