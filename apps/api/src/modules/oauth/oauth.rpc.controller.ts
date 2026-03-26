import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OAuthService } from './oauth.service.js';
import { BindOAuthAccountDto, FindOrCreateUserDto } from './dto/bind-oauth-account.dto.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { isAuthorized } from '../../common/authz/authorization.js';
import { OAUTH_PERMISSIONS } from './constants/permissions.constants.js';

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

class OAuthBindDto {
  @IsUUID()
  userId: string;

  @ValidateNested()
  @Type(() => BindOAuthAccountDto)
  data: BindOAuthAccountDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class OAuthAccountsDto {
  @IsUUID()
  userId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

@Controller()
export class OAuthRpcController {
  constructor(private readonly oauthService: OAuthService) {}

  @MessagePattern('oauth.bind')
  async bind(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OAuthBindDto, payload);
      const isSelf = dto.actor?.id === dto.userId;
      const isAdmin = !!dto.actor?.roles?.includes('admin');
      const permOk = isAuthorized(dto.actor, {
        anyPermissions: [OAUTH_PERMISSIONS.BIND, OAUTH_PERMISSIONS.WRITE],
      });
      if (!(isSelf || isAdmin || permOk)) {
        throw new RpcException({ status: 403, message: 'Insufficient permissions' });
      }
      return await this.oauthService.bindAccount(dto.userId, dto.data);
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({
          status: e.getStatus(),
          response: e.getResponse(),
          message: e.message,
        });
      }
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('oauth.accounts')
  async accounts(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OAuthAccountsDto, payload);
      const isSelf = dto.actor?.id === dto.userId;
      const isAdmin = !!dto.actor?.roles?.includes('admin');
      const permOk = isAuthorized(dto.actor, {
        anyPermissions: [OAUTH_PERMISSIONS.READ],
      });
      if (!(isSelf || isAdmin || permOk)) {
        throw new RpcException({ status: 403, message: 'Insufficient permissions' });
      }
      return await this.oauthService.getUserAccounts(dto.userId);
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({
          status: e.getStatus(),
          response: e.getResponse(),
          message: e.message,
        });
      }
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('oauth.findOrCreate')
  async findOrCreate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(FindOrCreateUserDto, payload);
      return await this.oauthService.findOrCreateUser(dto);
    } catch (e: any) {
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({
          status: e.getStatus(),
          response: e.getResponse(),
          message: e.message,
        });
      }
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }
}

