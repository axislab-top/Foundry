import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TenantContextService } from '@service/tenant';
import { UsersService } from '../../modules/users/users.service.js';

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultValue;
}

/**
 * 启动时确保存在默认管理员账号（用于管理系统登录）。
 *
 * 设计目标：
 * - 若库里已经存在任意带 admin/superadmin 角色的账号，则不重复创建
 * - 仅在开发/测试默认启用（生产环境需显式设置 DEFAULT_ADMIN_SEED=true）
 */
@Injectable()
export class DefaultAdminInitializerService implements OnModuleInit {
  private readonly logger = new Logger(DefaultAdminInitializerService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleInit(): Promise<void> {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const defaultSeed = nodeEnv !== 'production';
    const shouldSeed = readBooleanEnv(
      'DEFAULT_ADMIN_SEED',
      defaultSeed,
    );

    if (!shouldSeed) {
      this.logger.log('Default admin seeding disabled');
      return;
    }

    const email = process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@example.com';
    const username = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
    const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123';

    // 支持通过 env 自定义可登录的管理员角色
    const rolesEnv = process.env.DEFAULT_ADMIN_ROLES ?? 'admin';
    const roles = rolesEnv
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    if (!email || !password || roles.length === 0) {
      this.logger.warn('Default admin seeding skipped (missing env values)');
      return;
    }

    // 只要存在任意管理员角色账号，就认为默认管理员已准备好
    let existing: unknown = null;
    for (const role of roles) {
      // 查找任意一个管理员角色即可
      // eslint-disable-next-line no-await-in-loop
      const u = await this.usersService.findFirstByRole(role);
      if (u) {
        existing = u;
        break;
      }
    }

    if (existing) {
      this.logger.log('Default admin already exists, skip seeding');
      return;
    }

    const companyId = process.env.DEFAULT_ADMIN_COMPANY_ID ?? 'global';

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.usersService.create({
          username,
          email,
          password,
          roles,
          permissions: [],
          enabled: true,
        });
        this.logger.warn('Default admin seeded successfully', { email });
      } catch (error: any) {
        if (error instanceof ConflictException) {
          // 多实例并发可能导致重复创建竞争：冲突即可忽略
          this.logger.log('Default admin seeding conflict, ignore');
          return;
        }
        throw error;
      }
    });
  }
}

