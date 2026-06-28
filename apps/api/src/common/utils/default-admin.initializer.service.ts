import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TenantContextService } from '@service/tenant';
import { AdminUsersService } from '../../modules/admin-users/admin-users.service.js';

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
 * - 若库里已经存在管理员账号，则不重复创建
 * - 仅在开发/测试默认启用（生产环境需显式设置 DEFAULT_ADMIN_SEED=true）
 */
@Injectable()
export class DefaultAdminInitializerService implements OnModuleInit {
  private readonly logger = new Logger(DefaultAdminInitializerService.name);

  constructor(
    private readonly adminUsersService: AdminUsersService,
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

    if (!email || !password) {
      this.logger.warn('Default admin seeding skipped (missing env values)');
      return;
    }

    const existing = await this.adminUsersService.findFirstAdmin();
    if (existing) {
      this.logger.log('Default admin already exists, skip seeding');
      return;
    }

    const companyId = process.env.DEFAULT_ADMIN_COMPANY_ID ?? 'global';

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.adminUsersService.register({
          username,
          email,
          password,
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

