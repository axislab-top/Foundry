import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { QueryProjectsDto } from './dto/query-projects.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './services/projects.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class ProjectsBaseRpcDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class ProjectsFindAllRpcDto extends QueryProjectsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class ProjectsIdRpcDto extends ProjectsBaseRpcDto {
  @IsUUID()
  id: string;
}

class ProjectsCreateRpcDto extends ProjectsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => CreateProjectDto)
  data: CreateProjectDto;
}

class ProjectsUpdateRpcDto extends ProjectsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateProjectDto)
  data: UpdateProjectDto;
}

class ProjectsRemoveRpcDto extends ProjectsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

@Controller()
export class ProjectsRpcController {
  private readonly logger = new Logger(ProjectsRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly projectsService: ProjectsService,
  ) {}

  @MessagePattern('projects.findAll')
  async findAll(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ProjectsFindAllRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'projects.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompany(dto.companyId, () =>
            this.projectsService.findAll(dto, dto.actor ?? { id: '' }),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('projects.findOne')
  async findOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ProjectsIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.projectsService.findOne(dto.id, dto.actor ?? { id: '' }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('projects.create')
  async create(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ProjectsCreateRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.projectsService.create(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('projects.update')
  async update(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ProjectsUpdateRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.projectsService.update(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('projects.remove')
  async remove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ProjectsRemoveRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.projectsService.remove(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('projects.tasks.list')
  async listTasks(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ProjectsIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.projectsService.listRelatedTasks(dto.id, dto.actor ?? { id: '' }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('projects.agents.list')
  async listAgents(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ProjectsIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.projectsService.listRelatedAgents(dto.id, dto.actor ?? { id: '' }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private runWithCompany<T>(companyId: string | undefined, fn: () => Promise<T>) {
    const cid = companyId ?? this.tenantContext.getCompanyId();
    if (!cid) {
      throw new RpcException({ statusCode: 400, message: 'Company ID is required' });
    }
    return this.tenantContext.runWithCompanyId(cid, fn);
  }

  private toRpcError(e: any): RpcException {
    if (e instanceof RpcException) return e;
    const statusCode = e?.status ?? e?.statusCode ?? 500;
    return new RpcException({
      statusCode,
      message: e?.message ?? 'Internal error',
      code: e?.response?.code ?? e?.code,
    });
  }
}
