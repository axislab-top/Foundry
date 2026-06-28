import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { SecurityService } from '../../common/security/security.service.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { AdminUser } from './entities/admin-user.entity.js';
import { RegisterAdminDto } from './dto/register-admin.dto.js';

export type AdminUserInfo = {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
};

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
    private readonly securityService: SecurityService
  ) {}

  async register(dto: RegisterAdminDto): Promise<AdminUser> {
    const existing = await this.adminUserRepository.findOne({
      where: [{ email: dto.email } as FindOptionsWhere<AdminUser>, { username: dto.username } as FindOptionsWhere<AdminUser>],
      withDeleted: true
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '管理员邮箱或用户名已存在'
      });
    }

    const hashingManager = this.securityService.getHashingManager();
    const passwordHash = await hashingManager.hash(dto.password, {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10)
    });

    const adminUser = this.adminUserRepository.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      enabled: true,
      roles: ['admin'],
      permissions: []
    });

    return this.adminUserRepository.save(adminUser);
  }

  async validateCredentials(email: string, password: string): Promise<AdminUserInfo> {
    const adminUser = await this.adminUserRepository.findOne({
      where: { email } as FindOptionsWhere<AdminUser>
    });

    if (!adminUser || !adminUser.enabled) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的管理员凭证'
      });
    }

    const hashingManager = this.securityService.getHashingManager();
    const isValid = await hashingManager.verify(password, adminUser.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的管理员凭证'
      });
    }

    adminUser.lastLoginAt = new Date();
    await this.adminUserRepository.save(adminUser);

    return {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      roles: adminUser.roles || [],
      permissions: adminUser.permissions || []
    };
  }

  async findFirstAdmin(): Promise<AdminUser | null> {
    return this.adminUserRepository.findOne({ where: { enabled: true } as FindOptionsWhere<AdminUser> });
  }

  async findById(id: string): Promise<AdminUserInfo | null> {
    const adminUser = await this.adminUserRepository.findOne({
      where: { id } as FindOptionsWhere<AdminUser>
    });
    if (!adminUser || !adminUser.enabled) {
      return null;
    }
    return {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      roles: adminUser.roles || [],
      permissions: adminUser.permissions || []
    };
  }
}
