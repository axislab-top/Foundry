import { runWithLlmBillingContext, type LlmBillingContext } from './billing-token.context.js';

/**
 * 为类方法包裹 `runWithLlmBillingContext`。
 * `getCtx` 可同步或异步，入参为被装饰方法的原始参数。
 *
 * @example
 * ```ts
 * \@WithTokenBilling((_companyId: string, agentId: string) => ({
 *   companyId: '...',
 *   agentId,
 * }))
 * async handleReply(companyId: string, agentId: string) { ... }
 * ```
 */
export function WithTokenBilling(
  getCtx: (...args: unknown[]) => LlmBillingContext | Promise<LlmBillingContext>,
): MethodDecorator {
  return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const orig = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = async function withBillingContextWrapped(this: unknown, ...args: unknown[]) {
      const ctx = await Promise.resolve(getCtx(...args));
      return runWithLlmBillingContext(ctx, () => orig.apply(this, args));
    };
    return descriptor;
  };
}
