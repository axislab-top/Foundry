import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { UsersService } from './users.service.js';
import { UserAdminContextService } from './services/user-admin-context.service.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { IsUUID, ValidateNested, IsOptional, IsArray, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { USERS_PERMISSIONS } from './constants/permissions.constants.js';
import { isAuthorized } from '../../common/authz/authorization.js';

class UsersFindOneDto {
  @IsUUID()
  id: string;
}

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

function authorizeActor(
  actor: ActorDto | undefined,
  options: { anyRoles?: string[]; anyPermissions?: string[] },
): void {
  if (isAuthorized(actor, options)) return;

  throw new RpcException({
    status: 403,
    message: 'Insufficient permissions',
  });
}

class UsersCreateDto extends CreateUserDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class UsersUpdateDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateUserDto)
  data: UpdateUserDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class UsersRemoveDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class UsersAdminContextDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class UsersMembershipsDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

@Controller()
export class UsersRpcController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userAdminContextService: UserAdminContextService,
  ) {}

  @MessagePattern('users.findAll')
  async findAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(QueryUserDto, payload);
      const result = await this.usersService.findAll(dto);
      let items = result.items.map(({ passwordHash, ...user }) => user as any);

      if (dto.includeStats && items.length > 0) {
        const statsMap = await this.userAdminContextService.getStatsForUsers(
          items.map((u) => u.id),
        );
        items = items.map((user) => ({
          ...user,
          stats: statsMap.get(user.id) ?? {
            ownedCompanyCount: 0,
            memberCompanyCount: 0,
            rechargeOrderCount: 0,
          },
        }));
      }

      return { ...result, items };
    } catch (e: any) {
      // 让调用方拿到明确的 status/message
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

  @MessagePattern('users.findOne')
  async findOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(UsersFindOneDto, payload);
      const user = await this.usersService.findOne(dto.id);
      const { passwordHash, ...result } = user;
      return result;
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

  @MessagePattern('users.create')
  async create(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(UsersCreateDto, payload);
      authorizeActor(dto.actor, {
        anyRoles: ['admin'],
        anyPermissions: [USERS_PERMISSIONS.CREATE, USERS_PERMISSIONS.WRITE],
      });
      const user = await this.usersService.create(dto);
      const { passwordHash, ...result } = user;
      return result;
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

  @MessagePattern('users.update')
  async update(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(UsersUpdateDto, payload);
      authorizeActor(dto.actor, {
        anyRoles: ['admin'],
        anyPermissions: [USERS_PERMISSIONS.UPDATE, USERS_PERMISSIONS.WRITE],
      });
      const user = await this.usersService.update(dto.id, dto.data);
      const { passwordHash, ...result } = user;
      return result;
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

  @MessagePattern('users.remove')
  async remove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(UsersRemoveDto, payload);
      authorizeActor(dto.actor, {
        anyRoles: ['admin'],
        anyPermissions: [USERS_PERMISSIONS.DELETE, USERS_PERMISSIONS.WRITE],
      });
      await this.usersService.remove(dto.id);
      return null;
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

  @MessagePattern('users.memberships.list')
  async listMemberships(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(UsersMembershipsDto, payload);
      this.userAdminContextService.requirePlatformAdmin(dto.actor);
      const [ownedCompanies, memberCompanies] = await Promise.all([
        this.userAdminContextService.listOwnedCompanies(dto.id),
        this.userAdminContextService.listMemberCompanies(dto.id),
      ]);
      return { ownedCompanies, memberCompanies };
    } catch (e: any) {
      if (e instanceof RpcException) throw e;
      throw new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('users.adminContext.get')
  async getAdminContext(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(UsersAdminContextDto, payload);
      return await this.userAdminContextService.getAdminContext(dto.id, dto.actor);
    } catch (e: any) {
      if (e instanceof RpcException) throw e;
      if (e?.getStatus && e?.getResponse) {
        throw new RpcException({
          status: e.getStatus(),
          response: e.getResponse(),
          message: e.message,
        });
      }
      throw new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }
}

