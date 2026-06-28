import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../exceptions/error-codes.js';

function formatValidationErrors(errors: ReturnType<typeof validateSync>): string[] {
  const out: string[] = [];
  for (const e of errors) {
    const constraints = e.constraints ? Object.values(e.constraints) : [];
    if (constraints.length) {
      out.push(...constraints.map(String));
      continue;
    }
    if (e.children?.length) {
      out.push(...formatValidationErrors(e.children));
    }
  }
  return out.slice(0, 12);
}

/**
 * Gateway → API RPC DTO 校验。
 * 使用 HttpException（BadRequestException）而非裸 RpcException，确保 RMQ request/reply 能可靠回包；
 * 各 RPC handler 的 `toRpcError` 会将其序列化为 Gateway 可识别的 400。
 */
export function validateRpcDto<T extends object>(
  cls: new () => T,
  payload: unknown,
): T {
  const instance = plainToInstance(cls, payload ?? {}, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  if (errors.length > 0) {
    const messages = formatValidationErrors(errors);
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: messages[0] ?? 'Validation error',
      errors: messages,
    });
  }
  return instance;
}
