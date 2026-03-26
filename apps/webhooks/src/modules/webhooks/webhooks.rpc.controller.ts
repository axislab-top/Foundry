import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { WebhookService } from './services/webhook.service.js';
import { CreateWebhookDto, QueryWebhookDto, UpdateWebhookDto } from './dto/index.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { isAuthorized } from '../../common/authz/authorization.js';
import { WEBHOOKS_PERMISSIONS } from './constants/permissions.constants.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

class WebhooksCreateDto {
  @ValidateNested()
  @Type(() => CreateWebhookDto)
  data: CreateWebhookDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class WebhooksUpdateDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateWebhookDto)
  data: UpdateWebhookDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class WebhooksFindOneDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class WebhooksFindAllDto extends QueryWebhookDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class WebhooksHistoryDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

function authorize(actor: ActorDto | undefined, perms: string[]) {
  if (isAuthorized(actor, { anyRoles: ['admin'], anyPermissions: perms })) return;
  throw new RpcException({ status: 403, message: 'Insufficient permissions' });
}

@Controller()
export class WebhooksRpcController {
  constructor(private readonly webhookService: WebhookService) {}

  @MessagePattern('webhooks.create')
  async create(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(WebhooksCreateDto, payload);
      authorize(dto.actor, [WEBHOOKS_PERMISSIONS.CREATE, WEBHOOKS_PERMISSIONS.WRITE]);
      return await this.webhookService.create(dto.data);
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({ status: e.getStatus(), response: e.getResponse(), message: e.message });
      }
      throw e instanceof RpcException ? e : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('webhooks.findAll')
  async findAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(WebhooksFindAllDto, payload);
      authorize(dto.actor, [WEBHOOKS_PERMISSIONS.READ]);
      return await this.webhookService.findAll(dto);
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({ status: e.getStatus(), response: e.getResponse(), message: e.message });
      }
      throw e instanceof RpcException ? e : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('webhooks.findOne')
  async findOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(WebhooksFindOneDto, payload);
      authorize(dto.actor, [WEBHOOKS_PERMISSIONS.READ]);
      return await this.webhookService.findOne(dto.id);
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({ status: e.getStatus(), response: e.getResponse(), message: e.message });
      }
      throw e instanceof RpcException ? e : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('webhooks.update')
  async update(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(WebhooksUpdateDto, payload);
      authorize(dto.actor, [WEBHOOKS_PERMISSIONS.UPDATE, WEBHOOKS_PERMISSIONS.WRITE]);
      return await this.webhookService.update(dto.id, dto.data);
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({ status: e.getStatus(), response: e.getResponse(), message: e.message });
      }
      throw e instanceof RpcException ? e : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('webhooks.remove')
  async remove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(WebhooksFindOneDto, payload);
      authorize(dto.actor, [WEBHOOKS_PERMISSIONS.DELETE, WEBHOOKS_PERMISSIONS.WRITE]);
      await this.webhookService.remove(dto.id);
      return null;
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({ status: e.getStatus(), response: e.getResponse(), message: e.message });
      }
      throw e instanceof RpcException ? e : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('webhooks.history')
  async history(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(WebhooksHistoryDto, payload);
      authorize(dto.actor, [WEBHOOKS_PERMISSIONS.READ]);
      return await this.webhookService.findHistory(
        dto.id,
        dto.page ?? 1,
        dto.pageSize ?? 20,
      );
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({ status: e.getStatus(), response: e.getResponse(), message: e.message });
      }
      throw e instanceof RpcException ? e : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }
}

