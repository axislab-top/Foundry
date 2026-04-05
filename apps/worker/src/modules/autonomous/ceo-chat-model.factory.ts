import { Injectable, Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConfigService } from '../../common/config/config.service.js';
import {
  COLLAB_LLM_TRACE,
  llmSecretFingerprint,
  safeLlmBaseUrlForLog,
} from '../../common/logging/collab-llm-trace.util.js';

/**
 * 按 billing.modelRouter 解析出的 modelName 构造聊天模型；未知模型回退到 gpt-4o-mini（OpenAI）。
 */
@Injectable()
export class CeoChatModelFactory {
  private readonly logger = new Logger(CeoChatModelFactory.name);

  constructor(private readonly config: ConfigService) {}

  create(
    modelName: string,
    apiKey?: string,
    providerKind?: string,
    requestUrl?: string,
    /** 覆盖 CEO_LLM_TIMEOUT_MS（协作回复等场景） */
    timeoutMsOverride?: number,
    /** 覆盖 CEO_LLM_MAX_OUTPUT_TOKENS（如 GLM breakdown 缩短生成） */
    maxTokensOverride?: number,
  ): BaseChatModel {
    const name = (modelName || '').trim().toLowerCase();
    const timeout = timeoutMsOverride ?? this.config.getCeoLlmTimeoutMs();
    const maxTokens = maxTokensOverride ?? this.config.getCeoLlmMaxOutputTokens();

    const resolvedKind =
      providerKind === 'anthropic'
        ? 'anthropic'
        : providerKind === 'openai'
          ? 'openai'
          : name.includes('claude')
            ? 'anthropic'
            : 'openai';

    if (resolvedKind === 'anthropic') {
      const key = (apiKey ?? this.config.getAnthropicApiKey())?.trim();
      if (!key) {
        this.logger.warn('ANTHROPIC_API_KEY missing; falling back to OpenAI gpt-4o-mini');
        return this.openaiFallback(timeout, maxTokens);
      }
      const cfg: Record<string, unknown> = {
        model: modelName,
        anthropicApiKey: key,
        maxTokens,
        clientOptions: { timeout },
      };
      // ChatAnthropic 读 anthropicApiUrl；勿用顶层 baseURL（会被忽略）
      if (requestUrl?.trim()) cfg.anthropicApiUrl = requestUrl.trim();
      this.logger.log(`${COLLAB_LLM_TRACE} | chat_factory.build`, {
        kind: 'anthropic',
        model: modelName,
        baseUrl: safeLlmBaseUrlForLog(requestUrl),
        keyFingerprint: llmSecretFingerprint(key),
        timeoutMs: timeout,
        maxTokens,
      });
      return new ChatAnthropic(cfg as never);
    }

    if (resolvedKind === 'openai') {
      const key = (apiKey ?? this.config.getOpenAiApiKey())?.trim();
      if (!key) {
        throw new Error('OPENAI_API_KEY is required for this model route');
      }
      const cfg: Record<string, unknown> = {
        model: modelName,
        apiKey: key,
        maxTokens,
        timeout,
      };
      // ChatOpenAI 只认 configuration.baseURL；顶层 baseURL 会被忽略 → 误连 api.openai.com → 第三方 key 报 401
      if (requestUrl?.trim()) {
        cfg.configuration = { baseURL: requestUrl.trim() };
      }
      this.logger.log(`${COLLAB_LLM_TRACE} | chat_factory.build`, {
        kind: 'openai',
        model: modelName,
        baseUrl: safeLlmBaseUrlForLog(requestUrl),
        keyFingerprint: llmSecretFingerprint(key),
        keyFromDb: Boolean(apiKey?.trim()),
        timeoutMs: timeout,
        maxTokens,
      });
      return new ChatOpenAI(cfg as never);
    }

    this.logger.warn(`Unknown model "${modelName}", using gpt-4o-mini`);
    return this.openaiFallback(timeout, maxTokens);
  }

  private openaiFallback(timeout: number, maxTokens: number, apiKey?: string): ChatOpenAI {
    const key = (apiKey ?? this.config.getOpenAiApiKey())?.trim();
    if (!key) {
      throw new Error('OPENAI_API_KEY is required for CEO LLM fallback');
    }
    this.logger.log(`${COLLAB_LLM_TRACE} | chat_factory.build`, {
      kind: 'openai_fallback',
      model: 'gpt-4o-mini',
      baseUrl: safeLlmBaseUrlForLog(undefined),
      keyFingerprint: llmSecretFingerprint(key),
      keyFromDb: Boolean(apiKey?.trim()),
      timeoutMs: timeout,
      maxTokens,
    });
    return new ChatOpenAI({
      model: 'gpt-4o-mini',
      apiKey: key,
      maxTokens,
      timeout,
    });
  }
}
