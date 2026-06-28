import { BadRequestException, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import type { SkillImplementationType } from '../entities/skill.entity.js';

/**
 * Validates tool_schema shape for OpenAI-style function parameters (JSON Schema subset).
 */
@Injectable()
export class SkillValidatorService {
  scanSkillRisk(dto: {
    toolSchema?: Record<string, unknown> | null;
    promptTemplate?: string | null;
    name?: string;
  }): { riskLevel: 'low' | 'medium' | 'high'; findings: string[] } {
    const findings: string[] = [];
    const tool = dto.toolSchema ? JSON.stringify(dto.toolSchema).toLowerCase() : '';
    const prompt = dto.promptTemplate ? dto.promptTemplate.toLowerCase() : '';

    if (/(ignore|bypass|override).*(system|developer)|不要遵循.*(system|developer)/i.test(dto.promptTemplate ?? '')) {
      findings.push('promptTemplate 可能包含提示注入指令（ignore/bypass/override）');
    }

    const hasUrl = tool.includes('"url"') || tool.includes('url');
    const hasMethod = tool.includes('"method"') || tool.includes('\\"method\\"');
    if (hasUrl && hasMethod) {
      findings.push('toolSchema 包含外部 HTTP 请求参数（url + method）');
    }

    const sensitiveHints = ['payment', 'credit', 'card', 'charge', 'refund', 'transfer', 'delete', 'drop table'];
    const hasSensitive = sensitiveHints.some((h) => tool.includes(h) || prompt.includes(h));
    if (hasSensitive) {
      findings.push('toolSchema/promptTemplate 包含敏感操作提示（payment/DB modify 等）');
    }

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (findings.some((f) => f.includes('提示注入') || f.includes('HTTP 请求') || f.includes('敏感'))) {
      riskLevel = 'high';
    } else if (findings.length >= 2) {
      riskLevel = 'medium';
    }

    if (dto.name?.toLowerCase().includes('http') || dto.name?.toLowerCase().includes('payment')) {
      riskLevel = 'high';
    }
    return { riskLevel, findings };
  }

  validateToolSchema(toolSchema: Record<string, unknown> | null | undefined): void {
    if (toolSchema == null) {
      return;
    }
    if (typeof toolSchema !== 'object' || Array.isArray(toolSchema)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'toolSchema 必须是 JSON 对象',
      });
    }
    const t = toolSchema.type;
    if (t !== undefined && t !== 'object') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'toolSchema.type 应为 object（function parameters）',
      });
    }
    if (toolSchema.properties !== undefined && typeof toolSchema.properties !== 'object') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'toolSchema.properties 必须是对象',
      });
    }
  }

  validateHandlerConfig(
    implementationType: SkillImplementationType | string | null | undefined,
    handlerConfig: Record<string, unknown> | null | undefined,
  ): void {
    if (handlerConfig == null) {
      return;
    }
    if (typeof handlerConfig !== 'object' || Array.isArray(handlerConfig)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'handlerConfig 必须是 JSON 对象',
      });
    }

    if (implementationType !== 'external') {
      if (implementationType === 'builtin') {
        const builtinTools = (handlerConfig as any).builtinTools;
        if (builtinTools !== undefined) {
          if (!Array.isArray(builtinTools)) {
            throw new BadRequestException({
              code: ErrorCode.BAD_REQUEST,
              message: 'builtin handlerConfig.builtinTools 必须是数组',
            });
          }
          const seen = new Set<string>();
          for (const t of builtinTools as unknown[]) {
            if (!t || typeof t !== 'object' || Array.isArray(t)) {
              throw new BadRequestException({
                code: ErrorCode.BAD_REQUEST,
                message: 'builtinTools 项必须是对象',
              });
            }
            const name = typeof (t as any).name === 'string' ? String((t as any).name).trim() : '';
            if (!name) {
              throw new BadRequestException({
                code: ErrorCode.BAD_REQUEST,
                message: 'builtinTools[].name 必填',
              });
            }
            if (seen.has(name)) {
              throw new BadRequestException({
                code: ErrorCode.BAD_REQUEST,
                message: `builtinTools 存在重复 name: ${name}`,
              });
            }
            seen.add(name);
            const schema = (t as any).inputSchema ?? (t as any).jsonSchema;
            if (schema !== undefined && schema !== null) {
              this.validateToolSchema(schema as Record<string, unknown>);
            }
            const perms = (t as any).requiredPermissions;
            if (perms !== undefined && (!Array.isArray(perms) || perms.some((x) => !String(x ?? '').trim()))) {
              throw new BadRequestException({
                code: ErrorCode.BAD_REQUEST,
                message: 'builtinTools[].requiredPermissions 必须是非空字符串数组',
              });
            }
          }
        }
      }
      // For now, only enforce strict schema for external/http; builtin does lightweight builtinTools checks.
      return;
    }

    const kind = (handlerConfig as any).kind;
    if (kind !== 'http') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'external Skill handlerConfig.kind 必须为 http',
      });
    }

    const url = typeof (handlerConfig as any).url === 'string' ? (handlerConfig as any).url.trim() : '';
    const baseUrl = typeof (handlerConfig as any).baseUrl === 'string' ? (handlerConfig as any).baseUrl.trim() : '';
    if (!url && !baseUrl) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'external/http handlerConfig 需要提供 url 或 baseUrl',
      });
    }

    const method = (handlerConfig as any).method;
    if (method !== undefined) {
      const m = String(method).toUpperCase();
      const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      if (!allowed.includes(m)) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: `external/http handlerConfig.method 不支持: ${m}`,
        });
      }
    }

    const headers = (handlerConfig as any).headers;
    if (headers !== undefined) {
      if (typeof headers !== 'object' || headers == null || Array.isArray(headers)) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'external/http handlerConfig.headers 必须是对象',
        });
      }
      for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
        if (typeof v !== 'string') {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: `external/http handlerConfig.headers.${k} 必须是字符串`,
          });
        }
      }
    }
  }
}
