import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from './entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { CacheService } from '../../common/cache/cache.service.js';
import { SecurityService } from '../../common/security/security.service.js';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import type { IPaginatedResult, IUserInfo } from './interfaces/user.interface.js';
import type {
  UserCreatedEvent,
  UserUpdatedEvent,
  UserDeletedEvent,
} from '@contracts/events';

/**
 * 用户服务
 * 处理用户业务逻辑
 */
@Injectable()
export class UsersService {
  private readonly CACHE_PREFIX = 'user:';
  private readonly CACHE_TTL = 3600; // 1小时
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cacheService: CacheService,
    private readonly securityService: SecurityService,
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * 创建用户
   */
  async create(createDto: CreateUserDto): Promise<User> {
    // 检查邮箱是否已存在
    const existingByEmail = await this.userRepository.findOne({
      where: { email: createDto.email } as FindOptionsWhere<User>,
    });

    if (existingByEmail) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '邮箱已存在',
      });
    }

    // 检查用户名是否已存在
    const existingByUsername = await this.userRepository.findOne({
      where: { username: createDto.username } as FindOptionsWhere<User>,
    });

    if (existingByUsername) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '用户名已存在',
      });
    }

    // 哈希密码
    const hashingManager = this.securityService.getHashingManager();
    const passwordHash = await hashingManager.hash(createDto.password, {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    });

    // 创建用户实体
    const user = this.userRepository.create({
      username: createDto.username,
      email: createDto.email,
      passwordHash,
      roles: createDto.roles || [],
      permissions: createDto.permissions || [],
      enabled: createDto.enabled ?? true,
    });

    const saved = await this.userRepository.save(user);

    // 清除相关缓存
    await this.clearListCache();

    // 发布用户创建事件
    try {
      const companyId = this.tenantContext.getCompanyId();
      const event: UserCreatedEvent = {
        eventId: randomUUID(),
        eventType: 'user.created',
        aggregateId: saved.id,
        aggregateType: 'user',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          userId: saved.id,
          username: saved.username,
          email: saved.email,
          roles: saved.roles || [],
          permissions: saved.permissions || [],
          createdAt: saved.createdAt.toISOString(),
          companyId,
        },
      };

      await this.messagingService.publish(event, {
        routingKey: 'user.created',
        persistent: true,
      });

      this.logger.debug('Published user.created event', {
        eventId: event.eventId,
        userId: saved.id,
      });
    } catch (error: any) {
      // 事件发布失败不应该影响主流程
      this.logger.error('Failed to publish user.created event', {
        error: error.message,
        userId: saved.id,
      });
    }

    return saved;
  }

  /**
   * 用户注册
   * 公开接口，用于用户自主注册
   */
  async register(registerDto: RegisterDto): Promise<User> {
    // 检查邮箱是否已存在
    const existingByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email } as FindOptionsWhere<User>,
    });

    if (existingByEmail) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '邮箱已存在',
      });
    }

    // 检查用户名是否已存在
    const existingByUsername = await this.userRepository.findOne({
      where: { username: registerDto.username } as FindOptionsWhere<User>,
    });

    if (existingByUsername) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '用户名已存在',
      });
    }

    // 哈希密码
    const hashingManager = this.securityService.getHashingManager();
    const passwordHash = await hashingManager.hash(registerDto.password, {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    });

    // 创建用户实体，默认角色为普通用户
    const user = this.userRepository.create({
      username: registerDto.username,
      email: registerDto.email,
      passwordHash,
      roles: ['user'], // 新注册用户默认为普通用户角色
      permissions: [], // 新注册用户无额外权限
      enabled: true, // 默认启用
    });

    const saved = await this.userRepository.save(user);

    // 清除相关缓存
    await this.clearListCache();

    // 发布用户创建事件
    try {
      const companyId = this.tenantContext.getCompanyId();
      const event: UserCreatedEvent = {
        eventId: randomUUID(),
        eventType: 'user.created',
        aggregateId: saved.id,
        aggregateType: 'user',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          userId: saved.id,
          username: saved.username,
          email: saved.email,
          roles: saved.roles || [],
          permissions: saved.permissions || [],
          createdAt: saved.createdAt.toISOString(),
          companyId,
        },
      };

      await this.messagingService.publish(event, {
        routingKey: 'user.created',
        persistent: true,
      });

      this.logger.debug('Published user.created event', {
        eventId: event.eventId,
        userId: saved.id,
      });
    } catch (error: any) {
      // 事件发布失败不应该影响主流程
      this.logger.error('Failed to publish user.created event', {
        error: error.message,
        userId: saved.id,
      });
    }

    return saved;
  }

  /**
   * 查询所有用户（分页）
   */
  async findAll(queryDto: QueryUserDto): Promise<IPaginatedResult<User>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search,
      role,
      enabled,
      deleted = 'false',
    } = queryDto;

    // 构建缓存键
    const cacheKey = `${this.getTenantCachePrefix()}list:${JSON.stringify(queryDto)}`;

    // 尝试从缓存获取
    const cached = await this.cacheService.get<IPaginatedResult<User>>(
      cacheKey,
    );
    if (cached) {
      return cached;
    }

    // 构建查询条件
    const where: FindOptionsWhere<User> = {};

    if (enabled !== undefined) {
      where.enabled = enabled;
    }

    // 如果需要进行复杂搜索（如多字段搜索），需要使用 QueryBuilder
    if (search) {
      // FindOptionsWhere 只支持 Like（大小写敏感）
      // 如果需要大小写不敏感搜索，请使用 QueryBuilder
      const queryBuilder = this.userRepository.createQueryBuilder('user');
      
      queryBuilder.where(
        '(user.username ILIKE :search OR user.email ILIKE :search)',
        { search: `%${search}%` },
      );

      // 根据 deleted 参数添加删除状态筛选
      if (deleted === 'false') {
        // 只显示未删除的
        queryBuilder.andWhere('user.deletedAt IS NULL');
      } else if (deleted === 'true') {
        // 只显示已删除的
        queryBuilder.andWhere('user.deletedAt IS NOT NULL');
      }
      // deleted === 'all' 时不添加条件，显示全部

      if (role) {
        queryBuilder.andWhere('user.roles @> :role', { role: JSON.stringify([role]) });
      }

      if (enabled !== undefined) {
        queryBuilder.andWhere('user.enabled = :enabled', { enabled });
      }

      queryBuilder
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .orderBy(`user.${sortBy}`, sortOrder);

      const [items, total] = await queryBuilder.getManyAndCount();

      const result: IPaginatedResult<User> = {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      // 缓存结果
      await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

      return result;
    }

    // 简单查询（无搜索）
    if (role) {
      // 使用 JSONB 查询
      const queryBuilder = this.userRepository.createQueryBuilder('user');
      queryBuilder.where('user.roles @> :role', { role: JSON.stringify([role]) });
      
      // 根据 deleted 参数添加删除状态筛选
      if (deleted === 'false') {
        // 只显示未删除的
        queryBuilder.andWhere('user.deletedAt IS NULL');
      } else if (deleted === 'true') {
        // 只显示已删除的
        queryBuilder.andWhere('user.deletedAt IS NOT NULL');
      }
      // deleted === 'all' 时不添加条件，显示全部
      
      if (enabled !== undefined) {
        queryBuilder.andWhere('user.enabled = :enabled', { enabled });
      }

      queryBuilder
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .orderBy(`user.${sortBy}`, sortOrder);

      const [items, total] = await queryBuilder.getManyAndCount();

      const result: IPaginatedResult<User> = {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

      return result;
    }

    // 执行查询
    // 如果 deleted 参数为 'true' 或 'all'，需要使用 QueryBuilder（因为 findAndCount 默认排除软删除）
    if (deleted === 'true' || deleted === 'all') {
      const queryBuilder = this.userRepository.createQueryBuilder('user');
      
      // 根据 deleted 参数添加删除状态筛选
      if (deleted === 'true') {
        // 只显示已删除的
        queryBuilder.where('user.deletedAt IS NOT NULL');
      }
      // deleted === 'all' 时不添加条件，显示全部
      
      if (enabled !== undefined) {
        queryBuilder.andWhere('user.enabled = :enabled', { enabled });
      }

      queryBuilder
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .orderBy(`user.${sortBy}`, sortOrder);

      const [items, total] = await queryBuilder.getManyAndCount();

      const result: IPaginatedResult<User> = {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      // 缓存结果
      await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

      return result;
    }

    // deleted === 'false' 时使用默认的 findAndCount（自动排除软删除）
    const [items, total] = await this.userRepository.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: {
        [sortBy]: sortOrder,
      },
    });

    const result: IPaginatedResult<User> = {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    // 缓存结果
    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  /**
   * 根据ID查询单个用户
   */
  async findOne(id: string): Promise<User> {
    const cacheKey = `${this.getTenantCachePrefix()}${id}`;

    // 尝试从缓存获取
    const cached = await this.cacheService.get<User>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.userRepository.findOne({
      where: { id } as FindOptionsWhere<User>,
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '用户不存在',
      });
    }

    // 缓存结果
    await this.cacheService.set(cacheKey, user, this.CACHE_TTL);

    return user;
  }

  /**
   * 根据邮箱查询用户（用于登录验证）
   */
  async findByEmail(email: string): Promise<User | null> {
    // 使用原生查询来调试，确保能查询到用户
    const result = await this.userRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email })
      .andWhere('user.deletedAt IS NULL')
      .getOne();

    this.logger.debug('findByEmail query result', {
      email,
      found: !!result,
      userId: result?.id,
    });

    return result;
  }

  /**
   * 查找是否存在指定角色的用户（仅用于默认管理员等初始化逻辑）
   */
  async findFirstByRole(role: string): Promise<User | null> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.deletedAt IS NULL')
      .andWhere('user.roles @> :roles', { roles: JSON.stringify([role]) })
      .getOne();

    return user;
  }

  /**
   * 根据用户名查询用户
   */
  async findByUsername(username: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { username } as FindOptionsWhere<User>,
    });

    return user;
  }

  /**
   * 验证用户凭证
   */
  async validateUserCredentials(
    email: string,
    password: string,
  ): Promise<IUserInfo> {
    this.logger.debug('=== UsersService.validateUserCredentials() - 开始验证用户凭证 ===', {
      email,
      hasPassword: !!password,
      passwordLength: password?.length || 0,
      timestamp: new Date().toISOString(),
    });

    this.logger.debug('UsersService.validateUserCredentials() - 开始查找用户', {
      email,
    });

    const user = await this.findByEmail(email);

    this.logger.debug('UsersService.validateUserCredentials() - 查找用户完成', {
      email,
      userFound: !!user,
      userId: user?.id,
      userEnabled: user?.enabled,
    });

    if (!user) {
      this.logger.warn('UsersService.validateUserCredentials() - 用户不存在', {
        email,
      });
      const exception = new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的凭证',
      });
      this.logger.debug('UsersService.validateUserCredentials() - 抛出 UnauthorizedException (用户不存在)', {
        email,
        exceptionStatus: exception.getStatus(),
        exceptionResponse: exception.getResponse(),
      });
      throw exception;
    }

    if (!user.enabled) {
      this.logger.warn('UsersService.validateUserCredentials() - 用户已被禁用', {
        email,
        userId: user.id,
      });
      const exception = new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: '用户已被禁用',
      });
      this.logger.debug('UsersService.validateUserCredentials() - 抛出 UnauthorizedException (用户已禁用)', {
        email,
        userId: user.id,
        exceptionStatus: exception.getStatus(),
        exceptionResponse: exception.getResponse(),
      });
      throw exception;
    }

    this.logger.debug('UsersService.validateUserCredentials() - 开始验证密码', {
      email,
      userId: user.id,
      hasPasswordHash: !!user.passwordHash,
      passwordHashLength: user.passwordHash?.length || 0,
    });

    // 验证密码
    const hashingManager = this.securityService.getHashingManager();
    const isValid = await hashingManager.verify(password, user.passwordHash);

    this.logger.debug('UsersService.validateUserCredentials() - 密码验证完成', {
      email,
      userId: user.id,
      isValid,
    });

    if (!isValid) {
      this.logger.warn('UsersService.validateUserCredentials() - 密码验证失败', {
        email,
        userId: user.id,
      });
      const exception = new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的凭证',
      });
      this.logger.debug('UsersService.validateUserCredentials() - 抛出 UnauthorizedException (密码错误)', {
        email,
        userId: user.id,
        exceptionStatus: exception.getStatus(),
        exceptionResponse: exception.getResponse(),
      });
      throw exception;
    }

    this.logger.debug('UsersService.validateUserCredentials() - 密码验证成功，开始更新最后登录时间', {
      email,
      userId: user.id,
    });

    // 更新最后登录时间
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    this.logger.debug('UsersService.validateUserCredentials() - 最后登录时间已更新', {
      email,
      userId: user.id,
      lastLoginAt: user.lastLoginAt.toISOString(),
    });

    // 清除缓存
    await this.clearCache(user.id);

    this.logger.debug('UsersService.validateUserCredentials() - 缓存已清除', {
      email,
      userId: user.id,
    });

    // 返回用户信息（不包含密码）
    const companyId = this.tenantContext.getCompanyId();
    const userInfo = {
      id: user.id,
      username: user.username,
      email: user.email,
      companyId,
      roles: user.roles,
      permissions: user.permissions,
    };

    this.logger.debug('UsersService.validateUserCredentials() - 准备返回用户信息', {
      email,
      userId: user.id,
      username: userInfo.username,
      hasRoles: !!(userInfo.roles && userInfo.roles.length > 0),
      hasPermissions: !!(userInfo.permissions && userInfo.permissions.length > 0),
    });

    return userInfo;
  }

  /**
   * 更新用户
   */
  async update(id: string, updateDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // 如果更新邮箱，检查是否与其他用户冲突
    if (updateDto.email && updateDto.email !== user.email) {
      const existing = await this.findByEmail(updateDto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException({
          code: ErrorCode.RECORD_ALREADY_EXISTS,
          message: '邮箱已存在',
        });
      }
    }

    // 如果更新用户名，检查是否与其他用户冲突
    if (updateDto.username && updateDto.username !== user.username) {
      const existing = await this.findByUsername(updateDto.username);
      if (existing && existing.id !== id) {
        throw new ConflictException({
          code: ErrorCode.RECORD_ALREADY_EXISTS,
          message: '用户名已存在',
        });
      }
    }

    // 记录变更字段（用于事件）
    const changes: Record<string, any> = {};
    const originalUser = { ...user };

    // 更新字段
    Object.assign(user, updateDto);

    // 记录实际变更的字段
    Object.keys(updateDto).forEach((key) => {
      if (updateDto[key as keyof UpdateUserDto] !== undefined) {
        changes[key] = updateDto[key as keyof UpdateUserDto];
      }
    });

    const updated = await this.userRepository.save(user);

    // 清除相关缓存
    await this.clearCache(id);
    await this.clearListCache();

    // 发布用户更新事件
    try {
      const companyId = this.tenantContext.getCompanyId();
      const event: UserUpdatedEvent = {
        eventId: randomUUID(),
        eventType: 'user.updated',
        aggregateId: updated.id,
        aggregateType: 'user',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          userId: updated.id,
          companyId,
          changes: {
            username: changes.username,
            email: changes.email,
            roles: changes.roles,
            permissions: changes.permissions,
            enabled: changes.enabled,
          },
          updatedAt: updated.updatedAt?.toISOString() || new Date().toISOString(),
        },
      };

      await this.messagingService.publish(event, {
        routingKey: 'user.updated',
        persistent: true,
      });

      this.logger.debug('Published user.updated event', {
        eventId: event.eventId,
        userId: updated.id,
      });
    } catch (error: any) {
      this.logger.error('Failed to publish user.updated event', {
        error: error.message,
        userId: updated.id,
      });
    }

    return updated;
  }

  /**
   * 删除用户（软删除）
   */
  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    const userId = user.id;
    
    await this.userRepository.softRemove(user);

    // 清除相关缓存
    await this.clearCache(id);
    await this.clearListCache();

    // 发布用户删除事件
    try {
      const companyId = this.tenantContext.getCompanyId();
      const event: UserDeletedEvent = {
        eventId: randomUUID(),
        eventType: 'user.deleted',
        aggregateId: userId,
        aggregateType: 'user',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          userId,
          deletedAt: new Date().toISOString(),
          companyId,
        },
      };

      await this.messagingService.publish(event, {
        routingKey: 'user.deleted',
        persistent: true,
      });

      this.logger.debug('Published user.deleted event', {
        eventId: event.eventId,
        userId,
      });
    } catch (error: any) {
      this.logger.error('Failed to publish user.deleted event', {
        error: error.message,
        userId,
      });
    }
  }

  /**
   * 清除单个用户的缓存
   */
  private async clearCache(id: string): Promise<void> {
    await this.cacheService.delete(`${this.getTenantCachePrefix()}${id}`);
  }

  /**
   * 清除列表缓存
   */
  private async clearListCache(): Promise<void> {
    // 简化处理：可以记录缓存键列表，或者使用通配符删除
    // 这里暂时不做处理，让缓存自然过期
  }

  private getTenantCachePrefix(): string {
    const companyId = this.tenantContext.getCompanyId() || 'global';
    return `company:${companyId}:${this.CACHE_PREFIX}`;
  }
}







