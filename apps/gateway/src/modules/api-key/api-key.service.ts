import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { randomBytes } from 'crypto';
import { ApiKey } from './entities/api-key.entity.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';
import { UpdateApiKeyDto } from './dto/update-api-key.dto.js';
import { QueryApiKeyDto } from './dto/query-api-key.dto.js';
import { CacheService } from '../../common/cache/cache.service.js';
import { SecurityService } from '../../common/security/security.service.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import type {
  ApiKeyInfo,
  ApiKeyCreateResult,
} from './interfaces/api-key.interface.js';

/**
 * API密钥服务
 * 处理API密钥的业务逻辑
 */
@Injectable()
export class ApiKeyService {
  private readonly CACHE_PREFIX = 'api_key:';
  private readonly CACHE_TTL = 3600; // 1小时

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly cacheService: CacheService,
    private readonly securityService: SecurityService,
  ) {}

  /**
   * 生成API密钥
   * 返回keyId和secret（secret仅创建时返回一次）
   */
  private generateApiKey(): { keyId: string; secret: string } {
    // 生成keyId（16字节，32字符hex）
    const keyIdBytes = randomBytes(16);
    const keyId = keyIdBytes.toString('hex');

    // 生成secret（32字节，64字符hex）
    const secretBytes = randomBytes(32);
    const secret = secretBytes.toString('hex');

    return { keyId, secret };
  }

  /**
   * 创建API密钥
   */
  async create(createDto: CreateApiKeyDto): Promise<ApiKeyCreateResult> {
    // 生成密钥
    const { keyId, secret } = this.generateApiKey();

    // 检查keyId是否已存在（极低概率，但需要检查）
    const existing = await this.apiKeyRepository.findOne({
      where: { keyId } as FindOptionsWhere<ApiKey>,
    });

    if (existing) {
      // 如果keyId已存在，重新生成（递归调用，但最多重试一次）
      return this.create(createDto);
    }

    // 哈希secret
    const hashingManager = this.securityService.getHashingManager();
    const keyHash = await hashingManager.hash(secret, {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    });

    // 解析过期时间
    const expiresAt = createDto.expiresAt
      ? new Date(createDto.expiresAt)
      : null;

    // 创建API密钥实体
    const apiKey = this.apiKeyRepository.create({
      keyId,
      keyHash,
      name: createDto.name,
      description: createDto.description || null,
      permissions: createDto.permissions || null,
      expiresAt,
      isActive: true,
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    // 转换为ApiKeyInfo（不包含敏感信息）
    const apiKeyInfo = this.toApiKeyInfo(saved);

    // 缓存API密钥信息（用于快速验证）
    await this.cacheApiKeyInfo(keyId, apiKeyInfo);

    return {
      apiKey: apiKeyInfo,
      secret, // 仅创建时返回
    };
  }

  /**
   * 查询所有API密钥（分页）
   */
  async findAll(queryDto: QueryApiKeyDto): Promise<{
    items: ApiKeyInfo[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const {
      page = 1,
      pageSize = 20,
      search,
      isActive,
    } = queryDto;

    const queryBuilder = this.apiKeyRepository.createQueryBuilder('api_key');

    // 搜索条件
    if (search) {
      queryBuilder.where(
        '(api_key.name LIKE :search OR api_key.key_id LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // 激活状态过滤
    if (isActive !== undefined) {
      queryBuilder.andWhere('api_key.is_active = :isActive', { isActive });
    }

    // 总数
    const total = await queryBuilder.getCount();

    // 分页和排序
    const items = await queryBuilder
      .orderBy('api_key.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items: items.map((item) => this.toApiKeyInfo(item)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 根据ID查询API密钥
   */
  async findOne(id: string): Promise<ApiKeyInfo> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id } as FindOptionsWhere<ApiKey>,
    });

    if (!apiKey) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'API密钥不存在',
      });
    }

    return this.toApiKeyInfo(apiKey);
  }

  /**
   * 根据keyId查询API密钥（用于验证）
   */
  async findByKeyId(keyId: string): Promise<ApiKey | null> {
    // 先查缓存
    const cacheKey = this.getCacheKey(keyId);
    const cached = await this.cacheService.get<ApiKeyInfo>(cacheKey);

    if (cached) {
      // 从数据库获取完整信息（包含keyHash）
      const apiKey = await this.apiKeyRepository.findOne({
        where: { keyId } as FindOptionsWhere<ApiKey>,
      });
      return apiKey || null;
    }

    // 查数据库
    const apiKey = await this.apiKeyRepository.findOne({
      where: { keyId } as FindOptionsWhere<ApiKey>,
    });

    if (apiKey) {
      // 缓存API密钥信息
      await this.cacheApiKeyInfo(keyId, this.toApiKeyInfo(apiKey));
    }

    return apiKey;
  }

  /**
   * 验证API密钥
   */
  async validateApiKey(keyId: string, secret: string): Promise<ApiKeyInfo> {
    const apiKey = await this.findByKeyId(keyId);

    if (!apiKey) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: '无效的API密钥',
      });
    }

    // 检查是否激活
    if (!apiKey.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'API密钥已禁用',
      });
    }

    // 检查是否过期
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'API密钥已过期',
      });
    }

    // 验证secret
    const hashingManager = this.securityService.getHashingManager();
    const isValid = await hashingManager.verify(secret, apiKey.keyHash);

    if (!isValid) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: '无效的API密钥',
      });
    }

    return this.toApiKeyInfo(apiKey);
  }

  /**
   * 更新API密钥
   */
  async update(id: string, updateDto: UpdateApiKeyDto): Promise<ApiKeyInfo> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id } as FindOptionsWhere<ApiKey>,
    });

    if (!apiKey) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'API密钥不存在',
      });
    }

    // 更新字段
    if (updateDto.name !== undefined) {
      apiKey.name = updateDto.name;
    }
    if (updateDto.description !== undefined) {
      apiKey.description = updateDto.description;
    }
    if (updateDto.permissions !== undefined) {
      apiKey.permissions = updateDto.permissions;
    }
    if (updateDto.expiresAt !== undefined) {
      apiKey.expiresAt = updateDto.expiresAt
        ? new Date(updateDto.expiresAt)
        : null;
    }
    if (updateDto.isActive !== undefined) {
      apiKey.isActive = updateDto.isActive;
    }

    const saved = await this.apiKeyRepository.save(apiKey);

    // 更新缓存
    await this.cacheApiKeyInfo(apiKey.keyId, this.toApiKeyInfo(saved));

    return this.toApiKeyInfo(saved);
  }

  /**
   * 删除API密钥
   */
  async remove(id: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id } as FindOptionsWhere<ApiKey>,
    });

    if (!apiKey) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'API密钥不存在',
      });
    }

    await this.apiKeyRepository.remove(apiKey);

    // 清除缓存
    const cacheKey = this.getCacheKey(apiKey.keyId);
    await this.cacheService.delete(cacheKey);
  }

  /**
   * 轮换API密钥（生成新的secret，保留keyId）
   */
  async rotate(id: string): Promise<ApiKeyCreateResult> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id } as FindOptionsWhere<ApiKey>,
    });

    if (!apiKey) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'API密钥不存在',
      });
    }

    // 生成新的secret
    const secretBytes = randomBytes(32);
    const secret = secretBytes.toString('hex');

    // 哈希新的secret
    const hashingManager = this.securityService.getHashingManager();
    const keyHash = await hashingManager.hash(secret, {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    });

    // 更新keyHash
    apiKey.keyHash = keyHash;
    const saved = await this.apiKeyRepository.save(apiKey);

    // 更新缓存
    await this.cacheApiKeyInfo(apiKey.keyId, this.toApiKeyInfo(saved));

    return {
      apiKey: this.toApiKeyInfo(saved),
      secret, // 仅轮换时返回
    };
  }

  /**
   * 转换为ApiKeyInfo（去除敏感信息）
   */
  private toApiKeyInfo(apiKey: ApiKey): ApiKeyInfo {
    return {
      id: apiKey.id,
      keyId: apiKey.keyId,
      name: apiKey.name,
      description: apiKey.description,
      permissions: apiKey.permissions,
      expiresAt: apiKey.expiresAt,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    };
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(keyId: string): string {
    return `${this.CACHE_PREFIX}${keyId}`;
  }

  /**
   * 缓存API密钥信息
   */
  private async cacheApiKeyInfo(
    keyId: string,
    apiKeyInfo: ApiKeyInfo,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(keyId);
    await this.cacheService.set(cacheKey, apiKeyInfo, this.CACHE_TTL);
  }
}

