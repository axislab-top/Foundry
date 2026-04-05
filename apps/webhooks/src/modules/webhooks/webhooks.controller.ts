import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { WebhookService } from './services/webhook.service.js';
import { CreateWebhookDto } from './dto/create-webhook.dto.js';
import { UpdateWebhookDto } from './dto/update-webhook.dto.js';
import { QueryWebhookDto } from './dto/query-webhook.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { WEBHOOKS_PERMISSIONS } from './constants/permissions.constants.js';

/**
 * Webhook 控制器
 * 提供 Webhook 管理 API 和接收端点
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * 接收 Webhook 请求
   * 公开端点，用于接收来自外部系统的 Webhook
   */
  @Post('receive')
  @HttpCode(HttpStatus.ACCEPTED)
  @Public()
  @ApiOperation({
    summary: '接收 Webhook 请求',
    description: '接收来自外部系统的 Webhook 请求并转发到配置的目标 URL',
  })
  @ApiHeader({
    name: 'X-Webhook-Event',
    description: '事件类型',
    required: true,
  })
  @ApiHeader({
    name: 'X-Webhook-Signature',
    description: '签名（可选）',
    required: false,
  })
  @ApiBody({
    description: 'Webhook 负载',
    schema: {
      type: 'object',
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Webhook 已接收并正在处理',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  async receive(
    @Headers('x-webhook-event') event: string,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-timestamp') timestamp: string | undefined,
    @Headers('x-webhook-nonce') nonce: string | undefined,
    @Body() payload: any,
    @Req() req: Request,
  ) {
    if (!event) {
      throw new BadRequestException('X-Webhook-Event header is required');
    }

    // 异步处理，立即返回
    const rawBody = (req as any).rawBody as string | undefined;

    this.webhookService
      .receiveAndForward({
        event,
        payload,
        signature,
        timestamp,
        nonce,
        rawBody,
        sourceIp: req.ip,
      })
      .catch((error) => {
      console.error('Error processing webhook:', error);
    });

    return {
      success: true,
      message: 'Webhook received and is being processed',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 创建 Webhook 配置
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin')
  @Permissions(WEBHOOKS_PERMISSIONS.CREATE, WEBHOOKS_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '创建 Webhook 配置' })
  @ApiBody({ type: CreateWebhookDto })
  @ApiResponse({ status: 201, description: 'Webhook 配置创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: 'Webhook 名称已存在' })
  async create(@Body() createDto: CreateWebhookDto) {
    const webhook = await this.webhookService.create(createDto);
    return {
      success: true,
      data: webhook,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 查询 Webhook 配置列表
   */
  @Get()
  @Permissions(WEBHOOKS_PERMISSIONS.READ)
  @ApiOperation({ summary: '查询 Webhook 配置列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'enabled', required: false, type: Boolean })
  @ApiQuery({ name: 'event', required: false, type: String })
  @ApiResponse({ status: 200, description: '查询成功' })
  async findAll(@Query() queryDto: QueryWebhookDto) {
    const result = await this.webhookService.findAll(queryDto);
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 获取 Webhook 配置详情
   */
  @Get(':id')
  @Permissions(WEBHOOKS_PERMISSIONS.READ)
  @ApiOperation({ summary: '获取 Webhook 配置详情' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: 'Webhook 不存在' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const webhook = await this.webhookService.findOne(id);
    return {
      success: true,
      data: webhook,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 更新 Webhook 配置
   */
  @Patch(':id')
  @Roles('admin')
  @Permissions(WEBHOOKS_PERMISSIONS.UPDATE, WEBHOOKS_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '更新 Webhook 配置' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook ID' })
  @ApiBody({ type: UpdateWebhookDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: 'Webhook 不存在' })
  @ApiResponse({ status: 409, description: 'Webhook 名称已存在' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateWebhookDto,
  ) {
    const webhook = await this.webhookService.update(id, updateDto);
    return {
      success: true,
      data: webhook,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 删除 Webhook 配置
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @Permissions(WEBHOOKS_PERMISSIONS.DELETE, WEBHOOKS_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '删除 Webhook 配置' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook ID' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: 'Webhook 不存在' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.webhookService.remove(id);
    return {
      success: true,
      data: { message: 'Webhook deleted successfully' },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 查询 Webhook 历史记录
   */
  @Get(':id/history')
  @Permissions(WEBHOOKS_PERMISSIONS.READ)
  @ApiOperation({ summary: '查询 Webhook 历史记录' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: 'Webhook 不存在' })
  async findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    // 验证 Webhook 存在
    await this.webhookService.findOne(id);

    const result = await this.webhookService.findHistory(
      id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
