import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { Route } from './entities/route.entity.js';
import { CreateRouteDto } from './dto/create-route.dto.js';
import { UpdateRouteDto } from './dto/update-route.dto.js';
import { QueryRouteDto } from './dto/query-route.dto.js';
import { DynamicRoutesService } from './services/dynamic-routes.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { isAllowedRpcPattern } from './config/rpc-patterns.config.js';

/**
 * 路由管理控制器
 */
@Controller('admin/routes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class RoutesController {
  constructor(
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    private readonly dynamicRoutesService: DynamicRoutesService,
  ) {}

  /**
   * 创建路由
   * POST /api/admin/routes
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateRouteDto) {
    this.validateRpcRouteConfig(createDto);

    // 检查路径是否已存在
    const existing = await this.routeRepository.findOne({
      where: { path: createDto.path } as FindOptionsWhere<Route>,
    });

    if (existing) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '路由路径已存在',
      });
    }

    const route = this.routeRepository.create({
      ...createDto,
      authRequired: createDto.authRequired ?? true,
      priority: createDto.priority ?? 0,
      isActive: true,
    });

    const saved = await this.routeRepository.save(route);

    // 刷新动态路由缓存
    await this.dynamicRoutesService.refreshRoutes();

    return saved;
  }

  /**
   * 查询路由列表
   * GET /api/admin/routes
   */
  @Get()
  async findAll(@Query() queryDto: QueryRouteDto) {
    const {
      page = 1,
      pageSize = 20,
      search,
      isActive,
      service,
    } = queryDto;

    const queryBuilder = this.routeRepository.createQueryBuilder('route');

    // 搜索条件
    if (search) {
      queryBuilder.where(
        '(route.path LIKE :search OR route.description LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // 过滤条件
    if (isActive !== undefined) {
      queryBuilder.andWhere('route.is_active = :isActive', { isActive });
    }

    if (service) {
      queryBuilder.andWhere('route.service = :service', { service });
    }

    // 总数
    const total = await queryBuilder.getCount();

    // 分页和排序
    const items = await queryBuilder
      .orderBy('route.priority', 'DESC')
      .addOrderBy('route.path', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 查询路由详情
   * GET /api/admin/routes/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const route = await this.routeRepository.findOne({
      where: { id } as FindOptionsWhere<Route>,
    });

    if (!route) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '路由不存在',
      });
    }

    return route;
  }

  /**
   * 更新路由
   * PUT /api/admin/routes/:id
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateRouteDto) {
    const route = await this.routeRepository.findOne({
      where: { id } as FindOptionsWhere<Route>,
    });

    if (!route) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '路由不存在',
      });
    }

    this.validateRpcRouteConfig(updateDto);

    // 更新字段
    Object.assign(route, updateDto);

    const saved = await this.routeRepository.save(route);

    // 刷新动态路由缓存
    await this.dynamicRoutesService.refreshRoutes();

    return saved;
  }

  /**
   * 删除路由
   * DELETE /api/admin/routes/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    const route = await this.routeRepository.findOne({
      where: { id } as FindOptionsWhere<Route>,
    });

    if (!route) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '路由不存在',
      });
    }

    await this.routeRepository.remove(route);

    // 刷新动态路由缓存
    await this.dynamicRoutesService.refreshRoutes();
  }

  /**
   * 刷新路由缓存
   * POST /api/admin/routes/refresh
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh() {
    await this.dynamicRoutesService.refreshRoutes();
    return { message: '路由缓存已刷新' };
  }

  private validateRpcRouteConfig(
    dto: Pick<CreateRouteDto, 'transport' | 'rpcPattern' | 'rpcTimeoutMs'>,
  ) {
    if (dto.transport !== 'rpc') {
      return;
    }

    if (!dto.rpcPattern) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'rpcPattern is required when transport is rpc',
      });
    }

    if (!isAllowedRpcPattern(dto.rpcPattern)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `rpcPattern is not allowed: ${dto.rpcPattern}`,
      });
    }

    if (dto.rpcTimeoutMs !== undefined && dto.rpcTimeoutMs <= 0) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'rpcTimeoutMs must be greater than 0',
      });
    }
  }
}

