import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { QueryMarketplaceDto } from '../dto/query-marketplace.dto.js';
import { MarketplaceAgent } from '../entities/marketplace-agent.entity.js';

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectRepository(MarketplaceAgent)
    private readonly agentsRepo: Repository<MarketplaceAgent>,
  ) {}

  async findAll(query: QueryMarketplaceDto): Promise<PaginatedResult<MarketplaceAgent>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.agentsRepo.createQueryBuilder('a').where('a.is_published = :pub', { pub: true });

    if (query.search) {
      qb.andWhere(
        '(a.name ILIKE :s OR a.description ILIKE :s OR a.expertise ILIKE :s OR a.slug ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    if (query.skillTags?.length) {
      qb.andWhere('a.skill_tags && :skillTagArr', { skillTagArr: query.skillTags });
    }

    qb.orderBy('a.usage_count', 'DESC')
      .addOrderBy('a.name', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async findOne(id: string): Promise<MarketplaceAgent> {
    const a = await this.agentsRepo.findOne({ where: { id, isPublished: true } });
    if (!a) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '商品不存在或未上架',
      });
    }
    return a;
  }

  async incrementUsage(agentId: string): Promise<void> {
    await this.agentsRepo.increment({ id: agentId }, 'usageCount', 1);
  }
}
