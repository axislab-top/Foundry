import { Injectable } from '@nestjs/common';

/**
 * 脱敏规则类型
 */
export enum MaskingType {
  FULL = 'full', // 完全脱敏：显示为 ***
  PARTIAL = 'partial', // 部分脱敏：显示部分字符
  REGEX = 'regex', // 正则表达式匹配脱敏
}

/**
 * 脱敏规则配置
 */
export interface MaskingRule {
  // 字段名匹配（支持正则表达式）
  fieldPattern: string | RegExp;
  // 脱敏类型
  type: MaskingType;
  // 脱敏后的显示值（FULL类型时使用）
  maskValue?: string;
  // 部分脱敏配置（PARTIAL类型时使用）
  partialConfig?: {
    prefixLength?: number; // 保留前缀长度
    suffixLength?: number; // 保留后缀长度
    maskChar?: string; // 脱敏字符
  };
  // 正则表达式匹配和替换（REGEX类型时使用）
  regexConfig?: {
    pattern: RegExp; // 匹配模式
    replacement: string; // 替换值
  };
}

/**
 * 数据脱敏服务
 * 提供敏感数据的脱敏功能
 */
@Injectable()
export class DataMaskingService {
  // 默认脱敏规则
  private readonly defaultRules: MaskingRule[] = [
    // 密码类字段 - 完全脱敏
    {
      fieldPattern: /^password$/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
    {
      fieldPattern: /password/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
    // Token类字段 - 完全脱敏
    {
      fieldPattern: /^(token|access_token|refresh_token|auth_token)$/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
    {
      fieldPattern: /token/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
    // Secret类字段 - 完全脱敏
    {
      fieldPattern: /^(secret|api_secret|client_secret|private_key)$/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
    {
      fieldPattern: /secret/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
    // Key类字段 - 完全脱敏
    {
      fieldPattern: /^(api_key|private_key|public_key)$/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
    {
      fieldPattern: /key$/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
    // 授权头 - 部分脱敏（保留类型前缀）
    {
      fieldPattern: /^authorization$/i,
      type: MaskingType.REGEX,
      regexConfig: {
        pattern: /^(Bearer|Basic|Digest)\s+(.+)$/i,
        replacement: '$1 ***',
      },
    },
    // 手机号 - 部分脱敏（显示前3位和后4位）
    {
      fieldPattern: /^(phone|mobile|phone_number|mobile_number)$/i,
      type: MaskingType.PARTIAL,
      partialConfig: {
        prefixLength: 3,
        suffixLength: 4,
        maskChar: '*',
      },
    },
    {
      fieldPattern: /phone/i,
      type: MaskingType.PARTIAL,
      partialConfig: {
        prefixLength: 3,
        suffixLength: 4,
        maskChar: '*',
      },
    },
    // 身份证号 - 部分脱敏（显示前6位和后4位）
    {
      fieldPattern: /^(id_card|id_number|identity_card|idCard|idNumber)$/i,
      type: MaskingType.PARTIAL,
      partialConfig: {
        prefixLength: 6,
        suffixLength: 4,
        maskChar: '*',
      },
    },
    {
      fieldPattern: /id[_-]?card|id[_-]?number/i,
      type: MaskingType.PARTIAL,
      partialConfig: {
        prefixLength: 6,
        suffixLength: 4,
        maskChar: '*',
      },
    },
    // 银行卡号 - 部分脱敏（显示前4位和后4位）
    {
      fieldPattern: /^(card_number|bank_card|credit_card|cardNumber|bankCard)$/i,
      type: MaskingType.PARTIAL,
      partialConfig: {
        prefixLength: 4,
        suffixLength: 4,
        maskChar: '*',
      },
    },
    {
      fieldPattern: /card[_-]?number|bank[_-]?card/i,
      type: MaskingType.PARTIAL,
      partialConfig: {
        prefixLength: 4,
        suffixLength: 4,
        maskChar: '*',
      },
    },
    // 邮箱 - 部分脱敏（显示@前的部分字符和@后的完整域名）
    {
      fieldPattern: /^(email|email_address)$/i,
      type: MaskingType.REGEX,
      regexConfig: {
        pattern: /^(.{1,3})(.*)@(.+)$/,
        replacement: '$1***@$3',
      },
    },
    // Cookie - 完全脱敏
    {
      fieldPattern: /^cookie$/i,
      type: MaskingType.FULL,
      maskValue: '***',
    },
  ];

  // 自定义规则（可以通过配置添加）
  private customRules: MaskingRule[] = [];

  /**
   * 添加自定义脱敏规则
   */
  addRule(rule: MaskingRule): void {
    this.customRules.push(rule);
  }

  /**
   * 设置自定义规则（替换所有规则）
   */
  setRules(rules: MaskingRule[]): void {
    this.customRules = rules;
  }

  /**
   * 获取所有规则（默认规则 + 自定义规则）
   */
  private getAllRules(): MaskingRule[] {
    return [...this.defaultRules, ...this.customRules];
  }

  /**
   * 脱敏对象（递归处理）
   */
  maskObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // 数组处理
    if (Array.isArray(obj)) {
      return obj.map((item) => this.maskObject(item));
    }

    // 对象处理
    if (typeof obj === 'object') {
      const masked: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // 查找匹配的脱敏规则
        const rule = this.findMatchingRule(key);
        if (rule) {
          masked[key] = this.maskValue(value, rule);
        } else if (typeof value === 'object') {
          // 递归处理嵌套对象
          masked[key] = this.maskObject(value);
        } else {
          masked[key] = value;
        }
      }
      return masked;
    }

    // 原始值直接返回
    return obj;
  }

  /**
   * 脱敏字符串（基于JSON字符串）
   */
  maskString(str: string): string {
    if (!str) return str;

    try {
      // 尝试解析为JSON
      const data = JSON.parse(str);
      const masked = this.maskObject(data);
      return JSON.stringify(masked);
    } catch {
      // 如果不是JSON，尝试作为普通字符串脱敏
      // 检查是否包含常见的敏感信息模式
      return this.maskPlainString(str);
    }
  }

  /**
   * 脱敏普通字符串
   */
  private maskPlainString(str: string): string {
    let masked = str;

    // 手机号脱敏（11位数字）
    masked = masked.replace(/(\d{3})\d{4}(\d{4})/g, (match, prefix, suffix) => {
      return `${prefix}****${suffix}`;
    });

    // 身份证号脱敏（18位）
    masked = masked.replace(/(\d{6})\d{8}(\d{4})/g, (match, prefix, suffix) => {
      return `${prefix}${'*'.repeat(8)}${suffix}`;
    });

    // 银行卡号脱敏（16-19位）
    masked = masked.replace(/(\d{4})\d{8,11}(\d{4})/g, (match, prefix, suffix) => {
      return `${prefix}${'*'.repeat(match.length - 8)}${suffix}`;
    });

    return masked;
  }

  /**
   * 脱敏请求头
   */
  maskHeaders(headers: Record<string, any>): Record<string, string> {
    if (!headers) return {};

    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const rule = this.findMatchingRule(key);
      if (rule) {
        masked[key] = String(this.maskValue(value, rule));
      } else {
        // 限制长度，防止日志过大
        masked[key] = String(value).substring(0, 500);
      }
    }
    return masked;
  }

  /**
   * 查找匹配的脱敏规则
   */
  private findMatchingRule(fieldName: string): MaskingRule | null {
    const rules = this.getAllRules();
    for (const rule of rules) {
      if (rule.fieldPattern instanceof RegExp) {
        if (rule.fieldPattern.test(fieldName)) {
          return rule;
        }
      } else if (typeof rule.fieldPattern === 'string') {
        // 字符串匹配（支持部分匹配）
        const regex = new RegExp(rule.fieldPattern, 'i');
        if (regex.test(fieldName)) {
          return rule;
        }
      }
    }
    return null;
  }

  /**
   * 根据规则脱敏值
   */
  private maskValue(value: any, rule: MaskingRule): any {
    if (value === null || value === undefined) {
      return value;
    }

    const strValue = String(value);

    switch (rule.type) {
      case MaskingType.FULL:
        return rule.maskValue || '***';

      case MaskingType.PARTIAL:
        return this.partialMask(
          strValue,
          rule.partialConfig?.prefixLength || 0,
          rule.partialConfig?.suffixLength || 0,
          rule.partialConfig?.maskChar || '*',
        );

      case MaskingType.REGEX:
        if (rule.regexConfig) {
          const { pattern, replacement } = rule.regexConfig;
          // 支持函数替换（用于复杂场景）
          if (typeof replacement === 'function') {
            return strValue.replace(pattern, replacement as any);
          }
          // 字符串替换
          return strValue.replace(pattern, replacement);
        }
        return strValue;

      default:
        return '***';
    }
  }

  /**
   * 部分脱敏
   */
  private partialMask(
    value: string,
    prefixLength: number,
    suffixLength: number,
    maskChar: string = '*',
  ): string {
    if (!value || value.length === 0) {
      return value;
    }

    // 如果值太短，完全脱敏
    if (value.length <= prefixLength + suffixLength) {
      return maskChar.repeat(value.length);
    }

    const prefix = value.substring(0, prefixLength);
    const suffix = value.substring(value.length - suffixLength);
    const middleLength = value.length - prefixLength - suffixLength;
    const middle = maskChar.repeat(middleLength);

    return `${prefix}${middle}${suffix}`;
  }
}

