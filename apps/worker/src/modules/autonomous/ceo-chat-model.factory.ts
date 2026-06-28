import { Injectable, Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConfigService } from '../../common/config/config.service.js';
import {
  COLLAB_LLM_TRACE,
  safeLlmBaseUrlForLog,
} from '../../common/logging/collab-llm-trace.util.js';

/**
 * 按 billing.modelRouter 解析出的 modelName 构造聊天模型；不做隐式模型兜底。
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
    /** 覆盖温度（temperature）；不传则使用模型默认/SDK默认 */
    temperatureOverride?: number,
    /** 仅在特定模型路由下启用 "关闭思考/推理" 提示参数。 */
    disableReasoning?: boolean,
  ): BaseChatModel {
    const name = (modelName || '').trim().toLowerCase();
    if (/\bembedding(s)?\b/.test(name) || name.includes('text-embedding') || name.includes('bge-')) {
      throw new Error(`chat_model_not_supported_for_embedding_model:${modelName}`);
    }
    const timeout = timeoutMsOverride ?? this.config.getCeoLlmTimeoutMs();
    const maxTokens = maxTokensOverride ?? this.config.getCeoLlmMaxOutputTokens();
    const temperature =
      typeof temperatureOverride === 'number' && Number.isFinite(temperatureOverride)
        ? Math.max(0, Math.min(2, temperatureOverride))
        : undefined;

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
        throw new Error('ANTHROPIC_API_KEY is required for anthropic model route');
      }
      const cfg: Record<string, unknown> = {
        model: modelName,
        anthropicApiKey: key,
        maxTokens,
        clientOptions: { timeout },
      };
      if (temperature !== undefined) cfg.temperature = temperature;
      // ChatAnthropic 读 anthropicApiUrl；勿用顶层 baseURL（会被忽略）
      if (requestUrl?.trim()) cfg.anthropicApiUrl = requestUrl.trim();
      this.logger.debug(`${COLLAB_LLM_TRACE} | chat_factory.build`, {
        kind: 'anthropic',
        model: modelName,
        baseUrl: safeLlmBaseUrlForLog(requestUrl),
        keyLength: key.length,
        timeoutMs: timeout,
        maxTokens,
        temperature: temperature ?? null,
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
      if (temperature !== undefined) cfg.temperature = temperature;
      if (disableReasoning) {
        cfg.modelKwargs = { thinking: { type: 'disabled' } };
      }
      // ChatOpenAI 只认 configuration.baseURL；顶层 baseURL 会被忽略 → 误连 api.openai.com → 第三方 key 报 401
      if (requestUrl?.trim()) {
        cfg.configuration = { baseURL: requestUrl.trim() };
      }
      this.logger.debug(`${COLLAB_LLM_TRACE} | chat_factory.build`, {
        kind: 'openai',
        model: modelName,
        baseUrl: safeLlmBaseUrlForLog(requestUrl),
        keyLength: key.length,
        keyFromDb: Boolean(apiKey?.trim()),
        timeoutMs: timeout,
        maxTokens,
        temperature: temperature ?? null,
      });
      return new ChatOpenAI(cfg as never);
    }

    throw new Error(`unsupported_model_provider_route:${modelName}`);
  }
}
