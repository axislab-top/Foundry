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
import { ApiKeyService } from './api-key.service.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';
import { UpdateApiKeyDto } from './dto/update-api-key.dto.js';
import { QueryApiKeyDto } from './dto/query-api-key.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

/**
 * API密钥控制器
 * 提供API密钥的CRUD接口
 */
@Controller('admin/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin') // 仅管理员可以访问
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * 创建API密钥
   * POST /api/admin/api-keys
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateApiKeyDto) {
    return await this.apiKeyService.create(createDto);
  }

  /**
   * 查询API密钥列表
   * GET /api/admin/api-keys
   */
  @Get()
  async findAll(@Query() queryDto: QueryApiKeyDto) {
    return await this.apiKeyService.findAll(queryDto);
  }

  /**
   * 查询API密钥详情
   * GET /api/admin/api-keys/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.apiKeyService.findOne(id);
  }

  /**
   * 更新API密钥
   * PUT /api/admin/api-keys/:id
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateApiKeyDto,
  ) {
    return await this.apiKeyService.update(id, updateDto);
  }

  /**
   * 删除API密钥
   * DELETE /api/admin/api-keys/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.apiKeyService.remove(id);
  }

  /**
   * 轮换API密钥
   * POST /api/admin/api-keys/:id/rotate
   */
  @Post(':id/rotate')
  async rotate(@Param('id') id: string) {
    return await this.apiKeyService.rotate(id);
  }
}






















