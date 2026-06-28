import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../../common/config/config.service.js';
import { findRoute } from './config/routes.config.js';
import { DynamicRoutesService } from './services/dynamic-routes.service.js';
import { ApiProxyService } from './proxies/api-proxy.service.js';
import { ApiRpcProxyService } from './proxies/api-rpc-proxy.service.js';
import { WebhooksProxyService } from './proxies/webhooks-proxy.service.js';
import { WebhooksRpcProxyService } from './proxies/webhooks-rpc-proxy.service.js';
import { WorkerProxyService } from './proxies/worker-proxy.service.js';
import { Route } from './interfaces/route.interface.js';
import { AxiosResponse } from 'axios';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';
import { resolveCompanyIdFromRequest } from '@service/tenant';

function compactRpcPayload(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, v]) => v !== undefined),
  );
}

/** Organization RPC DTOs expect business fields under `data`, not flattened at the root. */
function organizationRpcDataBody(body: Record<string, unknown>): Record<string, unknown> {
  const nested = body.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  const { actor: _a, companyId: _c, ip: _ip, userAgent: _ua, data: _d, ...rest } = body;
  return rest;
}

/**
 * 路由服务
 * 负责请求路由和转发
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dynamicRoutesService: DynamicRoutesService,
    private readonly apiProxyService: ApiProxyService,
    private readonly apiRpcProxyService: ApiRpcProxyService,
    private readonly webhooksProxyService: WebhooksProxyService,
    private readonly webhooksRpcProxyService: WebhooksRpcProxyService,
    private readonly workerProxyService: WorkerProxyService,
  ) {}

  /**
   * 路由请求
   */
  async route(
    method: string,
    path: string,
    originalRequest?: any,
  ): Promise<AxiosResponse> {
    this.logger.log('Routing request', { method, path });

    // 先匹配静态 ROUTES（与代码中的 RPC/HTTP 契约一致），再查动态路由（仅作扩展）
    const stat = findRoute(path, method);
    let route: Route | undefined = stat?.route;
    let routeParams: Record<string, string> = stat?.params || {};

    if (!route) {
      const dyn = this.dynamicRoutesService.findRoute(path);
      route = dyn?.route;
      routeParams = dyn?.params || {};
    }

    if (!route) {
      this.logger.warn('Route not found', { path });
      throw new GatewayException(
        ErrorCode.ROUTING_ROUTE_NOT_FOUND,
        `Route not found: ${path}`,
        404,
      );
    }

    this.logger.debug('Route found', { 
      path, 
      route: route.path, 
      service: route.service,
      authRequired: route.authRequired,
    });

    // 方法约束（最佳实践：避免同一路径不同 method 混淆）
    if (route.methods?.length) {
      const allowed = route.methods.map((m) => m.toUpperCase());
      if (!allowed.includes(method.toUpperCase())) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          `Method not allowed for route: ${method} ${path}`,
          405,
        );
      }
    }

    // 检查是否需要认证
    if (route.authRequired && !originalRequest?.user) {
      this.logger.warn('Authentication required but no user found', { path });
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Authentication required',
        401,
      );
    }

    // 重写路径
    const rewrittenPath = this.rewritePath(path, route, routeParams);
    this.logger.log('Path rewritten', { original: path, rewritten: rewrittenPath });

    // 根据服务类型选择代理
    try {
      const routeTimeout = route.rpcTimeoutMs ?? route.timeout ?? 5000;
      const timeoutMs = Math.max(routeTimeout, this.configService.getApiRpcMinTimeoutMs());
      const companyId = resolveCompanyIdFromRequest(originalRequest);
      const actor = originalRequest?.user
        ? {
            id: originalRequest.user.id,
            roles: originalRequest.user.roles,
            permissions: originalRequest.user.permissions,
            email: originalRequest.user.email,
            username: originalRequest.user.username,
            companyId,
          }
        : undefined;
      const rpcPayload = compactRpcPayload(
        this.buildRpcPayload({
          method,
          rpcPattern: route.rpcPattern,
          originalRequest,
          routeParams,
          actor,
          companyId,
        }),
      );

      switch (route.service) {
        case 'api':
          if (route.transport === 'rpc') {
            if (!route.rpcPattern) {
              throw new GatewayException(
                ErrorCode.ROUTING_SERVICE_ERROR,
                `RPC route missing rpcPattern: ${route.path}`,
                500,
              );
            }

            const data = await this.apiRpcProxyService.send<any, any>(
              route.rpcPattern,
              rpcPayload,
              timeoutMs,
            );

            // 统一返回 AxiosResponse shape 给 ProxyController
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {},
              data,
            } as AxiosResponse;
          }

          this.logger.log('Proxying to API service', { method, rewrittenPath });
          return this.apiProxyService.proxyToApi(method, rewrittenPath, originalRequest, {
            timeout: route.timeout,
            responseType: route.proxyResponseType,
          });
        case 'webhooks':
          if (route.transport === 'rpc') {
            if (!route.rpcPattern) {
              throw new GatewayException(
                ErrorCode.ROUTING_SERVICE_ERROR,
                `RPC route missing rpcPattern: ${route.path}`,
                500,
              );
            }
            const data = await this.webhooksRpcProxyService.send<any, any>(
              route.rpcPattern,
              rpcPayload,
              timeoutMs,
            );
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {},
              data,
            } as AxiosResponse;
          }
          return this.webhooksProxyService.proxyToWebhooks(
            method,
            this.rewritePath(path, route, routeParams),
            originalRequest,
          );
        case 'worker':
          return this.workerProxyService.proxyToWorker(
            method,
            this.rewritePath(path, route, routeParams),
            originalRequest,
          );
        default:
          throw new GatewayException(
            ErrorCode.ROUTING_SERVICE_ERROR,
            `Unknown service: ${route.service}`,
            500,
          );
      }
    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.message === 'Request timeout') {
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_TIMEOUT,
          'Service timeout',
          504,
        );
      }
      if (error.response?.status === 503) {
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
          'Service unavailable',
          503,
        );
      }
      throw error;
    }
  }

  /**
   * 重写路径
   */
  private substitutePathParams(
    template: string,
    params: Record<string, string>,
  ): string {
    let out = template;
    for (const [key, val] of Object.entries(params)) {
      if (key === 'wildcard') continue;
      out = out.replace(new RegExp(`:${key}(?=/|$)`, 'g'), val);
    }
    return out;
  }

  private rewritePath(
    path: string,
    route: Route,
    params: Record<string, string>,
  ): string {
    // 如果路由有rewritePath，使用它
    if (route.rewritePath) {
      if (route.rewritePath !== '/') {
        // 支持 * 的后缀拼接
        const wildcard = params?.wildcard;
        if (wildcard) {
          const suffix = wildcard.startsWith('/') ? wildcard : `/${wildcard}`;
          return `${route.rewritePath}${suffix}`;
        }
        return this.substitutePathParams(route.rewritePath, params);
      }
    }

    // 如果有target，使用target（兼容旧配置）
    if ((route as any).target && (route as any).target !== '/') {
      // 移除路由前缀，添加目标前缀
      const wildcard = params?.wildcard;
      if (wildcard) {
        const suffix = wildcard.startsWith('/') ? wildcard : `/${wildcard}`;
        const rewritten = `${(route as any).target}${suffix}`;
        this.logger.debug('Path rewritten using target', { 
          original: path, 
          rewritten,
          matchedSuffix: wildcard,
        });
        return rewritten;
      }
      
      // 如果没有匹配到通配符部分，直接返回target
      const rewritten = (route as any).target;
      this.logger.debug('Path rewritten to target (no suffix match)', { 
        original: path, 
        rewritten,
      });
      return rewritten;
    }

    this.logger.debug('Path not rewritten', { path });
    return path;
  }

  private buildRpcPayload(args: {
    method: string;
    rpcPattern?: string;
    originalRequest?: any;
    routeParams: Record<string, string>;
    actor?: Record<string, unknown>;
    companyId?: string;
  }): Record<string, unknown> {
    const {
      method,
      rpcPattern,
      originalRequest,
      routeParams,
      actor,
      companyId,
    } = args;
    const upperMethod = method.toUpperCase();
    const query = originalRequest?.query || {};
    const body = originalRequest?.body || {};

    const base = {
      actor,
      companyId,
      ...routeParams,
    };

    // Billing RPC contracts (apps/api/src/modules/billing/billing.rpc.controller.ts)
    if (rpcPattern === 'billing.records.list') {
      return {
        ...base,
        query,
      };
    }

    if (rpcPattern === 'memory.entries.list') {
      const toArray = (v: unknown): string[] | undefined => {
        if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
        if (typeof v === 'string' && v.trim()) return [v.trim()];
        return undefined;
      };
      const topKRaw = query.topK;
      const topKNum = typeof topKRaw === 'string' ? Number.parseInt(topKRaw, 10) : Number(topKRaw);
      return compactRpcPayload({
        ...base,
        namespaces: toArray(query.namespaces),
        sourceTypes: toArray(query.sourceTypes),
        createdAfter: typeof query.createdAfter === 'string' ? query.createdAfter : undefined,
        topK: Number.isFinite(topKNum) && topKNum > 0 ? topKNum : undefined,
      });
    }
    if (rpcPattern === 'billing.agentUsage.listCompanyDaily') {
      const raw = query.date;
      const dateStr = typeof raw === 'string' ? raw.trim() : '';
      return {
        ...base,
        ...(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? { date: dateStr } : {}),
      };
    }
    if (rpcPattern === 'billing.agentUsage.listRange') {
      return {
        ...base,
        query,
      };
    }
    if (rpcPattern === 'billing.costTrend.get') {
      const rawDays = query.days;
      const daysNum = typeof rawDays === 'string' ? Number.parseInt(rawDays, 10) : Number(rawDays);
      return {
        ...base,
        ...(Number.isFinite(daysNum) && daysNum > 0 ? { days: daysNum } : {}),
      };
    }
    if (
      rpcPattern === 'billing.record.append' ||
      rpcPattern === 'billing.budget.upsert' ||
      rpcPattern === 'billing.settings.update'
    ) {
      return {
        ...base,
        data: body,
      };
    }

    if (rpcPattern === 'companies.createDraft') {
      return {
        actor,
        companyId,
        ip: originalRequest?.ip,
        userAgent: originalRequest?.headers?.['user-agent'],
      };
    }

    if (rpcPattern === 'companies.completeWizard') {
      return {
        id: routeParams.id,
        data: body,
        actor,
        companyId,
        ip: originalRequest?.ip,
        userAgent: originalRequest?.headers?.['user-agent'],
      };
    }

    if (
      rpcPattern === 'marketplace.skills.listAvailableVersions' ||
      rpcPattern === 'marketplace.skills.upgradeVersion'
    ) {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      if (upperMethod === 'GET') {
        return {
          companyId: cid,
          actor,
          skillName: typeof query.skillName === 'string' ? query.skillName : undefined,
        };
      }
      return {
        companyId: cid,
        actor,
        fromSkillId: body.fromSkillId,
        toSkillId: body.toSkillId,
        workerAutoSafeOnly: body.workerAutoSafeOnly,
      };
    }

    if (rpcPattern === 'marketplace.agents.purchase') {
      const orgFromBody =
        typeof body.organizationNodeId === 'string' ? body.organizationNodeId.trim() : undefined;
      const orgFromQuery =
        typeof query.organizationNodeId === 'string' ? query.organizationNodeId.trim() : undefined;
      const organizationNodeId = orgFromBody || orgFromQuery;
      if (!organizationNodeId) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          '安装商城 Agent 必须提供 organizationNodeId（query 或 body）',
          400,
        );
      }
      const cid =
        (typeof query.companyId === 'string' ? query.companyId.trim() : undefined) || companyId;
      return {
        actor,
        companyId: cid,
        id: routeParams.id,
        organizationNodeId,
      };
    }

    if (rpcPattern === 'marketplace.hireRequests.create') {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      return {
        actor,
        companyId: cid,
        data: compactRpcPayload({
          marketplaceAgentId: body.marketplaceAgentId,
          organizationNodeId: body.organizationNodeId,
          employmentType: body.employmentType,
          projectId: body.projectId,
          requestedReason: body.requestedReason,
        }),
      };
    }

    if (rpcPattern === 'marketplace.hireRequests.list') {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      const pageRaw = query.page;
      const pageSizeRaw = query.pageSize;
      const toOptInt = (raw: unknown): number | undefined => {
        if (raw === undefined || raw === '') return undefined;
        const n = Number(Array.isArray(raw) ? raw[0] : raw);
        return Number.isFinite(n) ? n : undefined;
      };
      return {
        actor,
        companyId: cid,
        page: toOptInt(pageRaw),
        pageSize: toOptInt(pageSizeRaw),
        status: typeof query.status === 'string' ? query.status : undefined,
      };
    }

    if (
      rpcPattern === 'marketplace.hireRequests.findOne' ||
      rpcPattern === 'marketplace.hireRequests.approve'
    ) {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      return {
        actor,
        companyId: cid,
        id: routeParams.hireId,
      };
    }

    if (rpcPattern === 'marketplace.hireRequests.reject') {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      return {
        actor,
        companyId: cid,
        id: routeParams.hireId,
        rejectReason: body.rejectReason,
      };
    }

    if (rpcPattern === 'billing.rechargeOrders.list') {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      const toOptInt = (raw: unknown): number | undefined => {
        if (raw === undefined || raw === '') return undefined;
        const n = Number(Array.isArray(raw) ? raw[0] : raw);
        return Number.isFinite(n) ? n : undefined;
      };
      return {
        actor,
        companyId: cid,
        query: {
          status: typeof query.status === 'string' ? query.status : undefined,
          limit: toOptInt(query.limit),
          offset: toOptInt(query.offset),
        },
      };
    }

    if (rpcPattern === 'billing.rechargeOrders.create') {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      return {
        actor,
        companyId: cid,
        data: body,
      };
    }

    if (rpcPattern === 'billing.rechargeOrders.approve') {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      return {
        actor,
        companyId: cid,
        orderId: routeParams.orderId,
      };
    }

    if (rpcPattern === 'billing.rechargeOrders.reject') {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      return {
        actor,
        companyId: cid,
        orderId: routeParams.orderId,
        rejectReason: body.rejectReason,
      };
    }

    if (rpcPattern === 'companies.membership.findActive') {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      const userId = actor && typeof (actor as { id?: unknown }).id === 'string' ? (actor as { id: string }).id : undefined;
      return {
        companyId: cid,
        userId,
        actor,
      };
    }

    if (rpcPattern?.startsWith('scheduledPlaybooks.')) {
      const cid = (routeParams.id as string | undefined)?.trim() || companyId;
      const scheduleId = routeParams.scheduleId;
      const toOptInt = (raw: unknown): number | undefined => {
        if (raw === undefined || raw === '') return undefined;
        const n = Number(Array.isArray(raw) ? raw[0] : raw);
        return Number.isFinite(n) ? n : undefined;
      };
      if (rpcPattern === 'scheduledPlaybooks.list') {
        return compactRpcPayload({
          actor,
          companyId: cid,
          query: {
            page: toOptInt(query.page),
            pageSize: toOptInt(query.pageSize),
            enabled:
              query.enabled === undefined
                ? undefined
                : query.enabled === true || query.enabled === 'true' || query.enabled === '1',
          },
        });
      }
      if (rpcPattern === 'scheduledPlaybooks.create') {
        return { actor, companyId: cid, data: body };
      }
      if (
        rpcPattern === 'scheduledPlaybooks.get' ||
        rpcPattern === 'scheduledPlaybooks.remove' ||
        rpcPattern === 'scheduledPlaybooks.triggerNow'
      ) {
        return { actor, companyId: cid, scheduleId };
      }
      if (rpcPattern === 'scheduledPlaybooks.update') {
        return { actor, companyId: cid, scheduleId, data: body };
      }
    }

    if (rpcPattern?.startsWith('organization.')) {
      const nodeId = (routeParams.id as string | undefined)?.trim() || undefined;

      if (
        rpcPattern === 'organization.node.create' ||
        rpcPattern === 'organization.department.addFromPlatform'
      ) {
        return {
          ...base,
          data: organizationRpcDataBody(body),
        };
      }

      if (
        rpcPattern === 'organization.node.update' ||
        rpcPattern === 'organization.node.move' ||
        rpcPattern === 'organization.node.skills.bind' ||
        rpcPattern === 'organization.node.skills.unbind'
      ) {
        return {
          ...base,
          id: nodeId,
          data: organizationRpcDataBody(body),
        };
      }

      if (rpcPattern === 'organization.node.remove') {
        return {
          ...base,
          id: nodeId,
        };
      }

      if (
        rpcPattern === 'organization.node.agents' ||
        rpcPattern === 'organization.node.reportingChain' ||
        rpcPattern === 'organization.node.skills.list' ||
        rpcPattern === 'organization.node.knowledgeSummary'
      ) {
        const includeSelfRaw = query.includeSelf;
        const includeSelf =
          includeSelfRaw === undefined
            ? undefined
            : includeSelfRaw === true ||
              includeSelfRaw === 'true' ||
              includeSelfRaw === '1';
        return compactRpcPayload({
          ...base,
          id: nodeId,
          ...(includeSelf !== undefined ? { includeSelf } : {}),
        });
      }

      if (rpcPattern === 'organization.audit.logs') {
        const toOptInt = (raw: unknown): number | undefined => {
          if (raw === undefined || raw === '') return undefined;
          const n = Number(Array.isArray(raw) ? raw[0] : raw);
          return Number.isFinite(n) ? n : undefined;
        };
        return {
          ...base,
          nodeId: typeof query.nodeId === 'string' ? query.nodeId : undefined,
          action: typeof query.action === 'string' ? query.action : undefined,
          page: toOptInt(query.page),
          pageSize: toOptInt(query.pageSize),
        };
      }
    }

    if (rpcPattern?.startsWith('tasks.')) {
      const taskId = (routeParams.id as string | undefined)?.trim();
      const runId = (routeParams.runId as string | undefined)?.trim();
      const roomIdFromRoute = (routeParams.roomId as string | undefined)?.trim();

      if (rpcPattern === 'tasks.supervision.resolve') {
        const routeId = taskId;
        const nested = body?.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {};
        const flat = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
        const parentTaskId =
          routeId ||
          (typeof nested.parentTaskId === 'string' ? nested.parentTaskId : '') ||
          (typeof flat.parentTaskId === 'string' ? String(flat.parentTaskId) : '');
        const decision = (nested.decision ?? flat.decision) as string;
        return {
          actor,
          companyId,
          data: {
            parentTaskId,
            decision,
            summary:
              typeof nested.summary === 'string'
                ? nested.summary
                : typeof flat.summary === 'string'
                  ? flat.summary
                  : undefined,
            failureReason:
              typeof nested.failureReason === 'string'
                ? nested.failureReason
                : typeof flat.failureReason === 'string'
                  ? flat.failureReason
                  : undefined,
          },
        };
      }

      if (rpcPattern === 'tasks.create' || rpcPattern === 'tasks.requestBreakdown') {
        return { actor, companyId, data: body };
      }

      if (rpcPattern === 'tasks.remove' && taskId) {
        return { actor, companyId, id: taskId };
      }

      if (rpcPattern === 'tasks.reviewBatchByDirector') {
        return { actor, companyId, ...body };
      }

      if (
        rpcPattern === 'tasks.goals.ensureMain' ||
        rpcPattern === 'tasks.director.generateProgressReport'
      ) {
        return { actor, companyId, data: body };
      }

      if (runId) {
        if (upperMethod === 'GET') {
          return { actor, companyId, runId, ...query };
        }
        return { actor, companyId, runId, data: body };
      }

      if (roomIdFromRoute) {
        if (upperMethod === 'GET') {
          return { actor, companyId, roomId: roomIdFromRoute, ...query };
        }
        return { actor, companyId, roomId: roomIdFromRoute, data: body };
      }

      if (taskId) {
        if (upperMethod === 'GET') {
          return { actor, companyId, id: taskId, ...query };
        }
        return { actor, companyId, id: taskId, data: body };
      }

      if (upperMethod === 'GET') {
        return { actor, companyId, ...query };
      }
    }

    if (upperMethod === 'GET') {
      return {
        ...query,
        ...base,
      };
    }

    return {
      ...body,
      ...query,
      ...base,
      ip: originalRequest?.ip,
      userAgent: originalRequest?.headers?.['user-agent'],
    };
  }
}








