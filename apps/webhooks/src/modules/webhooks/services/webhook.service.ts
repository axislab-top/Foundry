import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { createLogger, LogLevel } from '@service/logging';
import * as crypto from 'crypto';
import { Webhook } from '../entities/webhook.entity.js';
import { WebhookHistory } from '../entities/webhook-history.entity.js';
import { CreateWebhookDto } from '../dto/create-webhook.dto.js';
import { UpdateWebhookDto } from '../dto/update-webhook.dto.js';
import { QueryWebhookDto } from '../dto/query-webhook.dto.js';
import { WebhookRetryService } from './webhook-retry.service.js';

export interface ReceiveWebhookInput {
  event: string;
  payload: any;
  signature?: string;
  timestamp?: string;
  nonce?: string;
  rawBody?: string;
  sourceIp?: string;
}

/**
 * Webhook 服务
 * 提供 Webhook 配置管理和转发功能
 */
@Injectable()
export class WebhookService {
  private readonly logger = createLogger({
    service: 'webhooks-service',
    level: LogLevel.INFO,
  });

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    @InjectRepository(WebhookHistory)
    private readonly historyRepository: Repository<WebhookHistory>,
    private readonly retryService: WebhookRetryService,
  ) {}

  /**
   * 创建 Webhook 配置
   */
  async create(createDto: CreateWebhookDto): Promise<Webhook> {
    // 检查名称是否已存在
    const existing = await this.webhookRepository.findOne({
      where: { name: createDto.name },
    });

    if (existing) {
      throw new ConflictException(`Webhook with name "${createDto.name}" already exists`);
    }

    const webhook = this.webhookRepository.create({
      ...createDto,
      enabled: createDto.enabled ?? true,
      retryCount: createDto.retryCount ?? 3,
      timeout: createDto.timeout ?? 30000,
    });

    const saved = await this.webhookRepository.save(webhook);

    this.logger.info('Webhook created', {
      webhookId: saved.id,
      webhookName: saved.name,
    });

    return saved;
  }

  /**
   * 查询 Webhook 列表
   */
  async findAll(queryDto: QueryWebhookDto): Promise<{
    items: Webhook[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = queryDto.page || 1;
    const pageSize = queryDto.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const queryBuilder = this.webhookRepository.createQueryBuilder('webhook');

    // 搜索条件
    if (queryDto.search) {
      queryBuilder.where(
        '(webhook.name LIKE :search OR webhook.description LIKE :search)',
        { search: `%${queryDto.search}%` },
      );
    }

    // 启用状态筛选
    if (queryDto.enabled !== undefined) {
      queryBuilder.andWhere('webhook.enabled = :enabled', {
        enabled: queryDto.enabled,
      });
    }

    // 事件类型筛选
    if (queryDto.event) {
      queryBuilder.andWhere('webhook.events @> :event', {
        event: JSON.stringify([queryDto.event]),
      });
    }

    // 总数查询
    const total = await queryBuilder.getCount();

    // 分页查询
    const items = await queryBuilder
      .skip(skip)
      .take(pageSize)
      .orderBy('webhook.createdAt', 'DESC')
      .getMany();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 根据 ID 查询 Webhook
   */
  async findOne(id: string): Promise<Webhook> {
    const webhook = await this.webhookRepository.findOne({
      where: { id },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook with ID "${id}" not found`);
    }

    return webhook;
  }

  /**
   * 更新 Webhook 配置
   */
  async update(id: string, updateDto: UpdateWebhookDto): Promise<Webhook> {
    const webhook = await this.findOne(id);

    // 如果更新名称，检查是否冲突
    if (updateDto.name && updateDto.name !== webhook.name) {
      const existing = await this.webhookRepository.findOne({
        where: { name: updateDto.name },
      });

      if (existing) {
        throw new ConflictException(
          `Webhook with name "${updateDto.name}" already exists`,
        );
      }
    }

    Object.assign(webhook, updateDto);
    const updated = await this.webhookRepository.save(webhook);

    this.logger.info('Webhook updated', {
      webhookId: updated.id,
      webhookName: updated.name,
    });

    return updated;
  }

  /**
   * 删除 Webhook 配置（软删除）
   */
  async remove(id: string): Promise<void> {
    const webhook = await this.findOne(id);
    await this.webhookRepository.softDelete(id);

    this.logger.info('Webhook deleted', {
      webhookId: webhook.id,
      webhookName: webhook.name,
    });
  }

  /**
   * 接收并转发 Webhook
   */
  async receiveAndForward(input: ReceiveWebhookInput): Promise<void> {
    const { event, payload, signature, timestamp, nonce, rawBody, sourceIp } =
      input;
    // 查找订阅了该事件的所有启用的 Webhook
    const webhooks = await this.webhookRepository
      .createQueryBuilder('webhook')
      .where('webhook.enabled = :enabled', { enabled: true })
      .andWhere('webhook.events @> :event', {
        event: JSON.stringify([event]),
      })
      .getMany();

    if (webhooks.length === 0) {
      this.logger.debug('No webhooks found for event', { event });
      return;
    }

    this.logger.info('Processing webhook event', {
      event,
      webhookCount: webhooks.length,
    });

    // 并行处理所有 Webhook
    const promises = webhooks.map((webhook) =>
      this.processWebhook(webhook, {
        event,
        payload,
        signature,
        timestamp,
        nonce,
        rawBody,
        sourceIp,
      }),
    );

    await Promise.allSettled(promises);
  }

  /**
   * 处理单个 Webhook
   */
  private async processWebhook(
    webhook: Webhook,
    input: ReceiveWebhookInput,
  ): Promise<void> {
    const { event, payload, signature, timestamp, nonce, rawBody, sourceIp } =
      input;

    // 验证签名（若配置了 secret，则签名必须存在且通过校验）
    if (webhook.secret) {
      if (!signature) {
        this.logger.warn('Webhook signature missing', {
          webhookId: webhook.id,
          webhookName: webhook.name,
          sourceIp,
        });
        await this.createHistory(
          webhook,
          event,
          payload,
          'failed',
          401,
          null,
          'Missing signature',
          0,
          null,
        );
        return;
      }

      const signingInput = this.buildSigningInput({
        rawBody,
        payload,
        timestamp,
        nonce,
      });

      const expectedSignature = this.hmacSha256Hex(signingInput, webhook.secret);
      try {
        const ok = crypto.timingSafeEqual(
          Buffer.from(signature, 'utf8'),
          Buffer.from(expectedSignature, 'utf8'),
        );
        if (!ok) {
          this.logger.warn('Webhook signature verification failed', {
            webhookId: webhook.id,
            webhookName: webhook.name,
            sourceIp,
          });
          await this.createHistory(
            webhook,
            event,
            payload,
            'failed',
            401,
            null,
            'Invalid signature',
            0,
            null,
          );
          return;
        }
      } catch (error: any) {
        // signature 长度不匹配等
        this.logger.warn('Webhook signature verification error', {
          webhookId: webhook.id,
          webhookName: webhook.name,
          sourceIp,
          error: error.message,
        });
        await this.createHistory(
          webhook,
          event,
          payload,
          'failed',
          401,
          null,
          'Signature verification error',
          0,
          null,
        );
        return;
      }
    }

    // 创建待处理历史记录
    const history = await this.createHistory(webhook, event, payload, 'pending', null, null, null, 0, null);

    try {
      // 转发 Webhook（带重试）
      const result = await this.retryService.retryForward(
        webhook,
        event,
        payload,
      );

      // 更新历史记录
      history.status = result.success ? 'success' : 'failed';
      history.statusCode = result.statusCode || null;
      history.response = result.response || null;
      history.error = result.error || null;
      history.retryCount = result.retryCount;
      history.duration = result.duration;

      await this.historyRepository.save(history);

      if (result.success) {
        this.logger.info('Webhook processed successfully', {
          webhookId: webhook.id,
          webhookName: webhook.name,
          event,
          statusCode: result.statusCode,
        });
      } else {
        this.logger.error('Webhook processing failed', {
          webhookId: webhook.id,
          webhookName: webhook.name,
          event,
          error: result.error,
          retryCount: result.retryCount,
        });
      }
    } catch (error: any) {
      // 更新历史记录为失败
      history.status = 'failed';
      history.error = error.message || 'Unknown error';
      history.duration = Date.now() - history.createdAt.getTime();

      await this.historyRepository.save(history);

      this.logger.error('Webhook processing error', {
        webhookId: webhook.id,
        webhookName: webhook.name,
        event,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * 创建历史记录
   */
  private async createHistory(
    webhook: Webhook,
    event: string,
    payload: any,
    status: 'pending' | 'success' | 'failed',
    statusCode: number | null,
    response: any,
    error: string | null,
    retryCount: number,
    duration: number | null,
  ): Promise<WebhookHistory> {
    const history = this.historyRepository.create({
      webhookId: webhook.id,
      event,
      payload,
      status,
      statusCode,
      response,
      error,
      retryCount,
      duration,
    });

    return this.historyRepository.save(history);
  }

  private buildSigningInput(input: {
    rawBody?: string;
    payload: any;
    timestamp?: string;
    nonce?: string;
  }): string {
    const { rawBody, payload, timestamp, nonce } = input;
    // 推荐签名串：timestamp.nonce.rawBody（可抵御重放；同时 rawBody 避免 stringify 差异）
    // 为兼容旧调用方：若未提供 timestamp/nonce，则只签 rawBody/payloadString。
    const body =
      typeof rawBody === 'string' && rawBody.length > 0
        ? rawBody
        : typeof payload === 'string'
          ? payload
          : JSON.stringify(payload);
    if (timestamp && nonce) {
      return `${timestamp}.${nonce}.${body}`;
    }
    return body;
  }

  private hmacSha256Hex(data: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * 查询 Webhook 历史记录
   */
  async findHistory(
    webhookId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    items: WebhookHistory[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * pageSize;

    const queryBuilder = this.historyRepository
      .createQueryBuilder('history')
      .where('history.webhookId = :webhookId', { webhookId })
      .orderBy('history.createdAt', 'DESC');

    const total = await queryBuilder.getCount();
    const items = await queryBuilder.skip(skip).take(pageSize).getMany();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
