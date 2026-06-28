import { Injectable, Logger } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { randomUUID } from 'node:crypto';
import { formatUnknownError, stackFromUnknown } from '@service/logging';
import { MessagingService } from '@service/messaging';
import type { BillingConsumptionRequestedEvent } from '@contracts/events';
import { getLlmBillingContext, type LlmBillingContext } from './billing-token.context.js';
import {
  estimateFromMessages,
  extractUsage,
  extractUsageFromStreamTail,
  stringifyLlmChunk,
} from './billing-token.usage.js';

export interface WrapChatModelOpts {
  modelName: string;
  llmKeyId: string;
  /** 覆盖上下文中的 callsite，用于幂等键区分 */
  callsite?: string;
  /**
   * 显式归因（协作 Bridge 注入）。若省略则回退 AsyncLocalStorage（Runner/legacy）。
   */
  attribution?: LlmBillingContext;
}

@Injectable()
export class BillingTokenMiddleware {
  private readonly logger = new Logger(BillingTokenMiddleware.name);

  constructor(private readonly messaging: MessagingService) {}

  /**
   * 包装 LangChain ChatModel：在 invoke / stream 完成后发布恰好一条消耗事件（stream 不重复计费）。
   */
  wrapChatModel<M extends BaseChatModel>(model: M, opts: WrapChatModelOpts): M {
    const normalizeInputToMessages = this.normalizeInputToMessages.bind(this);
    const recordConsumptionFromInvokeResult = this.recordConsumptionFromInvokeResult.bind(this);
    const recordConsumptionFromStreamEnd = this.recordConsumptionFromStreamEnd.bind(this);
    const m = model as M & Record<string, unknown>;
    let invokeSeq = 0;
    let streamSeq = 0;
    const invokeOrig = (m as { invoke: (...a: unknown[]) => Promise<unknown> }).invoke.bind(m);
    (m as { invoke: (...a: unknown[]) => Promise<unknown> }).invoke = async (input: unknown, options?: unknown) => {
      invokeSeq += 1;
      const res = await invokeOrig(input, options);
      const messages = normalizeInputToMessages(input);
      await recordConsumptionFromInvokeResult(messages, res, opts, invokeSeq);
      return res;
    };

    if (typeof (m as { stream?: unknown }).stream === 'function') {
      const streamOrig = (m as { stream: (...a: unknown[]) => unknown }).stream.bind(m);
      (m as { stream: (...a: unknown[]) => unknown }).stream = async function* streamWithBilling(
        input: unknown,
        options?: unknown,
      ) {
        streamSeq += 1;
        const messages = normalizeInputToMessages(input);
        let acc = '';
        let last: unknown;
        const raw = streamOrig(input, options);
        const iterable: AsyncIterable<unknown> =
          raw != null && typeof (raw as Promise<AsyncIterable<unknown>>).then === 'function'
            ? await (raw as Promise<AsyncIterable<unknown>>)
            : (raw as AsyncIterable<unknown>);
        for await (const chunk of iterable) {
          last = chunk;
          acc += stringifyLlmChunk(chunk);
          yield chunk as never;
        }
        await recordConsumptionFromStreamEnd(messages, acc, last, opts, streamSeq);
      };
    }

    return model;
  }

  /**
   * 手动入账（例如非 ChatModel 的自定义 HTTP 调用），仍复用同一事件与幂等策略。
   */
  async recordConsumption(params: {
    ctx: LlmBillingContext;
    modelName: string;
    llmKeyId: string;
    inputTokens: number;
    outputTokens: number;
    callsite?: string;
    invokeSeq?: number;
  }): Promise<void> {
    await this.publishEvent(params.ctx, {
      modelName: params.modelName,
      llmKeyId: params.llmKeyId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      callsite: params.callsite ?? 'manual',
      invokeSeq: params.invokeSeq,
    });
  }

  private normalizeInputToMessages(input: unknown): BaseMessage[] {
    if (Array.isArray(input)) {
      return input as BaseMessage[];
    }
    return [input as BaseMessage];
  }

  private async recordConsumptionFromInvokeResult(
    messages: BaseMessage[],
    res: unknown,
    opts: WrapChatModelOpts,
    invokeSeq: number,
  ): Promise<void> {
    const ctx = opts.attribution ?? getLlmBillingContext();
    if (!ctx?.companyId || !ctx.agentId) {
      return;
    }
    const usage = extractUsage(res) ?? estimateFromMessages(messages, this.stringifyInvokeOutput(res));
    await this.publishEvent(ctx, {
      modelName: opts.modelName,
      llmKeyId: opts.llmKeyId,
      inputTokens: usage.input,
      outputTokens: usage.output,
      callsite: opts.callsite ?? 'invoke',
      invokeSeq,
    });
  }

  private async recordConsumptionFromStreamEnd(
    messages: BaseMessage[],
    accText: string,
    lastChunk: unknown,
    opts: WrapChatModelOpts,
    streamSeq: number,
  ): Promise<void> {
    const ctx = opts.attribution ?? getLlmBillingContext();
    if (!ctx?.companyId || !ctx.agentId) {
      return;
    }
    const fromTail = extractUsageFromStreamTail(lastChunk);
    const usage = fromTail ?? estimateFromMessages(messages, accText);
    await this.publishEvent(ctx, {
      modelName: opts.modelName,
      llmKeyId: opts.llmKeyId,
      inputTokens: usage.input,
      outputTokens: usage.output,
      callsite: opts.callsite ?? 'stream',
      invokeSeq: streamSeq,
    });
  }

  private stringifyInvokeOutput(res: unknown): string {
    if (res == null) {
      return '';
    }
    if (typeof res === 'object' && res !== null && 'content' in res) {
      const c = (res as { content: unknown }).content;
      if (typeof c === 'string') {
        return c;
      }
      if (Array.isArray(c)) {
        return c.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('');
      }
    }
    return JSON.stringify(res);
  }

  private async publishEvent(
    ctx: LlmBillingContext,
    body: {
      modelName: string;
      llmKeyId: string;
      inputTokens: number;
      outputTokens: number;
      callsite: string;
      invokeSeq?: number;
    },
  ): Promise<void> {
    const nominalOnly = ctx.employeeLlmBilling === false;
    const idempotencyKey = this.buildIdempotencyKey(ctx, body);
    const evt: BillingConsumptionRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'billing.consumption.requested',
      aggregateId: ctx.agentId,
      aggregateType: 'billing',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: ctx.companyId,
      data: {
        companyId: ctx.companyId,
        recordType: 'llm',
        agentId: ctx.agentId,
        departmentId: ctx.departmentId ?? undefined,
        taskId: ctx.taskId ?? undefined,
        skillId: ctx.skillId ?? undefined,
        modelName: body.modelName,
        llmKeyId: body.llmKeyId,
        inputTokens: body.inputTokens,
        outputTokens: body.outputTokens,
        idempotencyKey,
        pricingSnapshotJson: ctx.pricingSnapshotJson,
        pricingSource: ctx.pricingSource ?? (ctx.pricingSnapshotJson ? 'snapshot' : undefined),
        metadata: {
          source: 'billing_token_middleware',
          traceId: ctx.traceId ?? null,
          messageId: ctx.messageId ?? null,
          callsite: body.callsite,
          invokeSeq: body.invokeSeq ?? null,
        },
        ...(nominalOnly ? { isNominal: true } : {}),
      },
    };
    try {
      await this.messaging.publish(evt, {
        routingKey: 'billing.consumption.requested',
        persistent: true,
      });
    } catch (e: unknown) {
      this.logger.error(
        `billing.consumption.requested publish failed: ${formatUnknownError(e)}`,
        stackFromUnknown(e),
      );
      throw e;
    }
  }

  private buildIdempotencyKey(
    ctx: LlmBillingContext,
    body: { modelName: string; llmKeyId: string; callsite: string; invokeSeq?: number },
  ): string {
    const mid = ctx.messageId?.trim();
    if (mid) {
      const seq = body.invokeSeq ?? 0;
      const cs = (body.callsite ?? '').trim() || 'invoke';
      const stable = `llm:${ctx.companyId}:${ctx.agentId}:msg:${mid}:${cs}:${seq}`;
      return stable.length <= 128 ? stable : stable.slice(0, 128);
    }
    const parts = [
      'llm',
      ctx.companyId,
      ctx.agentId,
      ctx.callId ?? 'nocall',
      body.callsite,
      body.modelName,
      body.llmKeyId,
      ctx.messageId ?? '',
      ctx.traceId ?? '',
    ];
    return parts.join(':').slice(0, 128);
  }
}
