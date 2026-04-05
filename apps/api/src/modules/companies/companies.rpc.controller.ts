import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { CompaniesService } from './companies.service.js';
import { CompanyQuickCreateService } from './services/company-quick-create.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { QueryCompanyDto } from './dto/query-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class CompaniesFindOneDto {
  @IsUUID()
  id: string;
}

class CompaniesCreateDto extends CreateCompanyDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesUpdateDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateCompanyDto)
  data: UpdateCompanyDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesStatusDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateCompanyStatusDto)
  data: UpdateCompanyStatusDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesValidateAccessDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  userId: string;
}

class CompaniesFindAllDto extends QueryCompanyDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesQuickCreateRpcDto {
  @IsString()
  @Length(1, 8000)
  naturalLanguage: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesCreateDraftRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesCompleteWizardDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => CreateCompanyDto)
  data: CreateCompanyDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

@Controller()
export class CompaniesRpcController {
  private readonly logger = new Logger(CompaniesRpcController.name);

  constructor(
    private readonly companiesService: CompaniesService,
    private readonly companyQuickCreateService: CompanyQuickCreateService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @MessagePattern('companies.findAll')
  async findAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesFindAllDto, payload);
      const companyId = this.resolveCompanyId(payload);
      const run = () => this.companiesService.findAll(dto, dto.actor);
      return await executeRpc({
        logger: this.logger,
        pattern: 'companies.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: async () =>
          companyId
            ? await this.tenantContext.runWithCompanyId(companyId, run)
            : await run(),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.findOne')
  async findOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesFindOneDto, payload);
      const companyId = this.resolveCompanyId(payload);
      const run = () => this.companiesService.findOne(dto.id);
      return companyId
        ? await this.tenantContext.runWithCompanyId(companyId, run)
        : await run();
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.create')
  async create(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCreateDto, payload);
      return await this.companiesService.create(dto, dto.actor);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.quickCreate')
  async quickCreate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesQuickCreateRpcDto, payload);
      return await this.companyQuickCreateService.parseNaturalLanguage(dto.naturalLanguage);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.createDraft')
  async createDraft(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCreateDraftRpcDto, payload);
      return await this.companiesService.createDraftShell(dto.actor);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.completeWizard')
  async completeWizard(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCompleteWizardDto, payload);
      const companyId = this.resolveCompanyId(payload);
      const run = () => this.companiesService.completeWizard(dto.id, dto.data, dto.actor);
      return companyId
        ? await this.tenantContext.runWithCompanyId(companyId, run)
        : await run();
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.update')
  async update(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesUpdateDto, payload);
      const companyId = this.resolveCompanyId(payload);
      const run = () => this.companiesService.update(dto.id, dto.data, dto.actor);
      return companyId
        ? await this.tenantContext.runWithCompanyId(companyId, run)
        : await run();
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.changeStatus')
  async changeStatus(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesStatusDto, payload);
      const companyId = this.resolveCompanyId(payload);
      const run = () => this.companiesService.changeStatus(dto.id, dto.data, dto.actor);
      return companyId
        ? await this.tenantContext.runWithCompanyId(companyId, run)
        : await run();
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.validateAccess')
  async validateAccess(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesValidateAccessDto, payload);
      return await this.companiesService.validateAccess(dto.companyId, dto.userId);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private resolveCompanyId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const v = (payload as { companyId?: unknown }).companyId;
    return typeof v === 'string' ? v : undefined;
  }

  private toRpcError(e: any): RpcException {
    if (e?.getStatus && e?.getResponse) {
      return new RpcException({
        status: e.getStatus(),
        response: e.getResponse(),
        message: e.message,
      });
    }
    return e instanceof RpcException
      ? e
      : new RpcException({ status: 500, message: e?.message || 'Internal error' });
  }
}
