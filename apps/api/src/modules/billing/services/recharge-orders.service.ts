import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type { BillingRechargeCompletedEvent, BillingRechargeRejectedEvent } from '@contracts/events';
import { CreateBillingRechargeOrderDto } from '../dto/create-billing-recharge-order.dto.js';
import { QueryBillingRechargeOrdersDto } from '../dto/query-billing-recharge-orders.dto.js';
import { QueryPlatformRechargeOrdersDto } from '../dto/query-platform-recharge-orders.dto.js';
import { BillingBalanceCredit } from '../entities/billing-balance-credit.entity.js';
import {
  BillingRechargeOrder,
  BillingRechargeOrderStatus,
} from '../entities/billing-recharge-order.entity.js';
import { BudgetService } from './budget.service.js';
import { UserCreditService } from './user-credit.service.js';
import { RpcException } from '@nestjs/microservices';

interface PlatformActor {
  id: string;
  roles?: string[];
}

export type PlatformRechargeOrderItem = BillingRechargeOrder & { companyName: string | null };

@Injectable()
export class RechargeOrdersService {
  constructor(
    @InjectRepository(BillingRechargeOrder)
    private readonly orderRepo: Repository<BillingRechargeOrder>,
    private readonly budgetService: BudgetService,
    private readonly userCreditService: UserCreditService,
    private readonly messaging: MessagingService,
  ) {}

  private actorIsPlatformAdmin(actor: PlatformActor): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'admin' || r === 'superadmin'));
  }

  /**
   * 自助充值：单次请求内创建订单 + 增加公司预算 + 审计行 + 事件（无人工审批）。
   * 幂等键：若已存在同键且已入账，返回原订单与 credit。
   * requireApproval=true 时仅创建 pending，不入账。
   */
  async create(
    companyId: string,
    dto: CreateBillingRechargeOrderDto,
    requestedByUserId: string,
  ): Promise<{ order: BillingRechargeOrder; credit: BillingBalanceCredit | null }> {
    if (dto.requireApproval === true) {
      return this.createPending(companyId, dto, requestedByUserId);
    }
    const currency = (dto.currency ?? 'CREDIT').toUpperCase();
    const idem = dto.idempotencyKey?.trim() || null;

    if (idem) {
      const existing = await this.orderRepo.findOne({
        where: { companyId, idempotencyKey: idem },
      });
      if (existing?.status === 'approved') {
        const credit = await this.orderRepo.manager
          .getRepository(BillingBalanceCredit)
          .findOne({ where: { orderId: existing.id } });
        if (credit) {
          return { order: existing, credit };
        }
      }
    }

    await this.budgetService.ensureCompanyBudget(companyId, 0);

    const add = dto.amount;
    if (!Number.isFinite(add) || add <= 0) {
      throw new RpcException({ status: 400, message: 'invalid_order_amount' });
    }

    let outcome: {
      order: BillingRechargeOrder;
      credit: BillingBalanceCredit;
      budgetTotalAfter: string;
      budgetId: string;
      /** 事务内命中幂等：不再发消息、不重复刷缓存 */
      skipPublish: boolean;
    };

    try {
      outcome = await this.orderRepo.manager.transaction(async (manager) => {
        const orderRepo = manager.getRepository(BillingRechargeOrder);
        const creditRepo = manager.getRepository(BillingBalanceCredit);

        if (idem) {
          const dup = await orderRepo.findOne({ where: { companyId, idempotencyKey: idem } });
          if (dup?.status === 'approved') {
            const c = await creditRepo.findOne({ where: { orderId: dup.id } });
            if (c) {
              return {
                order: dup,
                credit: c,
                budgetTotalAfter: c.budgetTotalAfter,
                budgetId: c.budgetId,
                skipPublish: true,
              };
            }
          }
        }

        const budgetRows = await manager.query<Array<{ id: string; currency: string }>>(
          `SELECT id, currency FROM budgets WHERE company_id = $1 AND scope = 'company' LIMIT 1 FOR UPDATE`,
          [companyId],
        );
        const budgetRow0 = budgetRows[0];
        if (!budgetRow0) {
          throw new RpcException({ status: 500, message: 'company_budget_missing' });
        }
        if (budgetRow0.currency !== currency) {
          throw new RpcException({
            status: 400,
            message: `currency_mismatch:request=${currency} budget=${budgetRow0.currency}`,
          });
        }

        const now = new Date();
        const order = orderRepo.create({
          companyId,
          amount: String(add),
          currency,
          status: 'approved',
          idempotencyKey: idem,
          applyNote: dto.applyNote ?? null,
          metadata: dto.metadata ?? null,
          requestedByUserId,
          reviewedByUserId: requestedByUserId,
          reviewedAt: now,
        });
        const savedOrder = await orderRepo.save(order);

        const ownerId = await this.userCreditService.resolveCompanyOwnerUserId(companyId);
        if (!ownerId) {
          throw new RpcException({ status: 500, message: 'company_owner_missing' });
        }

        const accountTotalAfter = await this.userCreditService.addCreditInTransaction(
          manager,
          ownerId,
          add,
        );

        const afterRows = await manager.query<Array<{ id: string; total_amount: string }>>(
          `SELECT id, total_amount::text AS total_amount FROM budgets WHERE company_id = $1 AND scope = 'company' LIMIT 1`,
          [companyId],
        );
        const br = afterRows[0];
        if (!br) {
          throw new RpcException({ status: 500, message: 'company_budget_row_missing_after_update' });
        }

        const credit = creditRepo.create({
          orderId: savedOrder.id,
          companyId,
          budgetId: br.id,
          amount: savedOrder.amount,
          currency: savedOrder.currency,
          budgetTotalAfter: accountTotalAfter,
        });
        const savedCredit = await creditRepo.save(credit);

        return {
          order: savedOrder,
          credit: savedCredit,
          budgetTotalAfter: accountTotalAfter,
          budgetId: br.id,
          skipPublish: false,
        };
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('uq_billing_recharge_orders_company_idempotency') && idem) {
        const existing = await this.orderRepo.findOne({ where: { companyId, idempotencyKey: idem } });
        const credit = existing
          ? await this.orderRepo.manager
              .getRepository(BillingBalanceCredit)
              .findOne({ where: { orderId: existing.id } })
          : null;
        if (existing && credit) {
          return { order: existing, credit };
        }
      }
      throw e;
    }

    if (!outcome.skipPublish) {
      await this.budgetService.invalidateUtilizationCache(companyId);

      const nowIso = new Date().toISOString();
      const event: BillingRechargeCompletedEvent = {
        eventId: randomUUID(),
        eventType: 'billing.recharge.completed',
        aggregateId: outcome.order.id,
        aggregateType: 'billing_recharge_order',
        occurredAt: nowIso,
        version: 1,
        companyId,
        data: {
          companyId,
          orderId: outcome.order.id,
          amount: outcome.order.amount,
          currency: outcome.order.currency,
          budgetId: outcome.budgetId,
          budgetTotalAfter: outcome.budgetTotalAfter,
          occurredAt: nowIso,
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'billing.recharge.completed',
        persistent: true,
      });
    }

    return { order: outcome.order, credit: outcome.credit };
  }

  /** 审批购额：创建 pending 订单，不入账、不发 completed 事件 */
  private async createPending(
    companyId: string,
    dto: CreateBillingRechargeOrderDto,
    requestedByUserId: string,
  ): Promise<{ order: BillingRechargeOrder; credit: null }> {
    const currency = (dto.currency ?? 'CREDIT').toUpperCase();
    const idem = dto.idempotencyKey?.trim() || null;
    const add = dto.amount;

    if (!Number.isFinite(add) || add <= 0) {
      throw new RpcException({ status: 400, message: 'invalid_order_amount' });
    }

    if (idem) {
      const existing = await this.orderRepo.findOne({
        where: { companyId, idempotencyKey: idem },
      });
      if (existing) {
        return { order: existing, credit: null };
      }
    }

    await this.budgetService.ensureCompanyBudget(companyId, 0);
    const budget = await this.budgetService.getCompanyBudget(companyId);
    if (budget && budget.currency !== currency) {
      throw new RpcException({
        status: 400,
        message: `currency_mismatch:request=${currency} budget=${budget.currency}`,
      });
    }

    try {
      const order = this.orderRepo.create({
        companyId,
        amount: String(add),
        currency,
        status: 'pending',
        idempotencyKey: idem,
        applyNote: dto.applyNote ?? null,
        metadata: dto.metadata ?? null,
        requestedByUserId,
        reviewedByUserId: null,
        reviewedAt: null,
      });
      const savedOrder = await this.orderRepo.save(order);
      return { order: savedOrder, credit: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('uq_billing_recharge_orders_company_idempotency') && idem) {
        const existing = await this.orderRepo.findOne({ where: { companyId, idempotencyKey: idem } });
        if (existing) {
          return { order: existing, credit: null };
        }
      }
      throw e;
    }
  }

  async listPlatform(
    actor: PlatformActor,
    q: QueryPlatformRechargeOrdersDto,
  ): Promise<{ items: PlatformRechargeOrderItem[]; total: number }> {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new RpcException({ status: 403, message: 'Insufficient permissions' });
    }

    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;

    return this.orderRepo.manager.transaction(async (manager) => {
      await manager.query('SET LOCAL row_security = off');

      const params: unknown[] = [];
      const conditions: string[] = ['1=1'];
      let paramIdx = 1;

      if (q.companyId) {
        conditions.push(`o.company_id = $${paramIdx++}`);
        params.push(q.companyId);
      }
      if (q.requestedByUserId) {
        conditions.push(`o.requested_by_user_id = $${paramIdx++}`);
        params.push(q.requestedByUserId);
      }
      if (q.reviewedByUserId) {
        conditions.push(`o.reviewed_by_user_id = $${paramIdx++}`);
        params.push(q.reviewedByUserId);
      }
      if (q.status) {
        conditions.push(`o.status = $${paramIdx++}`);
        params.push(q.status);
      }
      if (q.createdAfter) {
        conditions.push(`o.created_at >= $${paramIdx++}::timestamptz`);
        params.push(q.createdAfter);
      }
      if (q.createdBefore) {
        conditions.push(`o.created_at <= $${paramIdx++}::timestamptz`);
        params.push(q.createdBefore);
      }

      const whereClause = conditions.join(' AND ');

      const countRows = await manager.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count FROM billing_recharge_orders o WHERE ${whereClause}`,
        params,
      );
      const total = parseInt(countRows[0]?.count ?? '0', 10);

      const listParams = [...params, limit, offset];
      const limitIdx = paramIdx++;
      const offsetIdx = paramIdx;

      type RawRow = {
        id: string;
        company_id: string;
        amount: string;
        currency: string;
        status: BillingRechargeOrderStatus;
        idempotency_key: string | null;
        apply_note: string | null;
        reject_reason: string | null;
        requested_by_user_id: string;
        reviewed_by_user_id: string | null;
        reviewed_at: Date | null;
        metadata: Record<string, unknown> | null;
        created_at: Date;
        updated_at: Date;
        company_name: string | null;
      };

      const rows = await manager.query<RawRow[]>(
        `
        SELECT
          o.id,
          o.company_id,
          o.amount::text AS amount,
          o.currency,
          o.status,
          o.idempotency_key,
          o.apply_note,
          o.reject_reason,
          o.requested_by_user_id,
          o.reviewed_by_user_id,
          o.reviewed_at,
          o.metadata,
          o.created_at,
          o.updated_at,
          c.name AS company_name
        FROM billing_recharge_orders o
        LEFT JOIN companies c ON c.id = o.company_id
        WHERE ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        listParams,
      );

      const items: PlatformRechargeOrderItem[] = rows.map((row) => {
        const order = this.orderRepo.create({
          id: row.id,
          companyId: row.company_id,
          amount: row.amount,
          currency: row.currency,
          status: row.status,
          idempotencyKey: row.idempotency_key,
          applyNote: row.apply_note,
          rejectReason: row.reject_reason,
          requestedByUserId: row.requested_by_user_id,
          reviewedByUserId: row.reviewed_by_user_id,
          reviewedAt: row.reviewed_at,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
        return Object.assign(order, { companyName: row.company_name });
      });

      return { items, total };
    });
  }

  async list(
    companyId: string,
    q: QueryBillingRechargeOrdersDto,
  ): Promise<{ items: BillingRechargeOrder[]; total: number }> {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.company_id = :companyId', { companyId });

    if (q.status) {
      qb.andWhere('o.status = :status', { status: q.status });
    }

    const total = await qb.clone().getCount();
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    qb.orderBy('o.created_at', 'DESC').take(limit).skip(offset);

    const items = await qb.getMany();
    return { items, total };
  }

  async approve(
    companyId: string,
    orderId: string,
    reviewedByUserId: string,
  ): Promise<{
    order: BillingRechargeOrder;
    credit: BillingBalanceCredit;
    alreadyApplied?: boolean;
  }> {
    await this.budgetService.ensureCompanyBudget(companyId, 0);

    const outcome = await this.orderRepo.manager.transaction(async (manager) => {
      const orderRepo = manager.getRepository(BillingRechargeOrder);
      const creditRepo = manager.getRepository(BillingBalanceCredit);

      const locked = await manager
        .createQueryBuilder(BillingRechargeOrder, 'o')
        .setLock('pessimistic_write')
        .where('o.id = :id AND o.company_id = :companyId', { id: orderId, companyId })
        .getOne();

      if (!locked) {
        throw new RpcException({ status: 404, message: 'recharge_order_not_found' });
      }

      if (locked.status === 'approved') {
        const credit = await creditRepo.findOne({ where: { orderId: locked.id } });
        if (credit) {
          return { kind: 'idempotent' as const, order: locked, credit };
        }
      }

      if (locked.status !== 'pending') {
        throw new RpcException({
          status: 409,
          message: `recharge_order_not_pending:${locked.status}`,
        });
      }

      const budget = await this.budgetService.getCompanyBudget(companyId);
      if (!budget) {
        throw new RpcException({ status: 500, message: 'company_budget_missing' });
      }

      if (budget.currency !== locked.currency) {
        throw new RpcException({
          status: 400,
          message: `currency_mismatch:order=${locked.currency} budget=${budget.currency}`,
        });
      }

      const add = parseFloat(locked.amount);
      if (!Number.isFinite(add) || add <= 0) {
        throw new RpcException({ status: 400, message: 'invalid_order_amount' });
      }

      const ownerId = await this.userCreditService.resolveCompanyOwnerUserId(companyId);
      if (!ownerId) {
        throw new RpcException({ status: 500, message: 'company_owner_missing' });
      }

      const accountTotalAfter = await this.userCreditService.addCreditInTransaction(
        manager,
        ownerId,
        add,
      );

      const afterRows = await manager.query<Array<{ id: string; total_amount: string }>>(
        `SELECT id, total_amount::text AS total_amount FROM budgets WHERE company_id = $1 AND scope = 'company' LIMIT 1`,
        [companyId],
      );
      const budgetRow = afterRows[0];
      if (!budgetRow) {
        throw new RpcException({ status: 500, message: 'company_budget_row_missing_after_update' });
      }

      const budgetTotalAfter = accountTotalAfter;

      locked.status = 'approved';
      locked.reviewedByUserId = reviewedByUserId;
      locked.reviewedAt = new Date();
      await orderRepo.save(locked);

      const credit = creditRepo.create({
        orderId: locked.id,
        companyId,
        budgetId: budgetRow.id,
        amount: locked.amount,
        currency: locked.currency,
        budgetTotalAfter,
      });
      const savedCredit = await creditRepo.save(credit);

      return {
        kind: 'applied' as const,
        order: locked,
        credit: savedCredit,
        budgetTotalAfter,
        budgetId: budgetRow.id,
      };
    });

    if (outcome.kind === 'idempotent') {
      return { order: outcome.order, credit: outcome.credit, alreadyApplied: true };
    }

    await this.budgetService.invalidateUtilizationCache(companyId);

    const now = new Date().toISOString();
    const event: BillingRechargeCompletedEvent = {
      eventId: randomUUID(),
      eventType: 'billing.recharge.completed',
      aggregateId: outcome.order.id,
      aggregateType: 'billing_recharge_order',
      occurredAt: now,
      version: 1,
      companyId,
      data: {
        companyId,
        orderId: outcome.order.id,
        amount: outcome.order.amount,
        currency: outcome.order.currency,
        budgetId: outcome.budgetId,
        budgetTotalAfter: outcome.budgetTotalAfter,
        occurredAt: now,
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'billing.recharge.completed',
      persistent: true,
    });

    return { order: outcome.order, credit: outcome.credit };
  }

  async reject(
    companyId: string,
    orderId: string,
    reviewedByUserId: string,
    rejectReason?: string,
  ): Promise<{ order: BillingRechargeOrder }> {
    const order = await this.orderRepo.manager.transaction(async (manager) => {
      const orderRepo = manager.getRepository(BillingRechargeOrder);

      const locked = await manager
        .createQueryBuilder(BillingRechargeOrder, 'o')
        .setLock('pessimistic_write')
        .where('o.id = :id AND o.company_id = :companyId', { id: orderId, companyId })
        .getOne();

      if (!locked) {
        throw new RpcException({ status: 404, message: 'recharge_order_not_found' });
      }

      if (locked.status !== 'pending') {
        throw new RpcException({
          status: 409,
          message: `recharge_order_not_pending:${locked.status}`,
        });
      }

      locked.status = 'rejected' as BillingRechargeOrderStatus;
      locked.reviewedByUserId = reviewedByUserId;
      locked.reviewedAt = new Date();
      locked.rejectReason = rejectReason?.trim() || null;
      await orderRepo.save(locked);
      return locked;
    });

    const now = new Date().toISOString();
    const event: BillingRechargeRejectedEvent = {
      eventId: randomUUID(),
      eventType: 'billing.recharge.rejected',
      aggregateId: order.id,
      aggregateType: 'billing_recharge_order',
      occurredAt: now,
      version: 1,
      companyId,
      data: {
        companyId,
        orderId: order.id,
        rejectReason: order.rejectReason ?? undefined,
        occurredAt: now,
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'billing.recharge.rejected',
      persistent: true,
    });

    return { order };
  }
}
