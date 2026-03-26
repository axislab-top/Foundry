import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RpcException } from '@nestjs/microservices';

export function validateRpcDto<T extends object>(
  cls: new () => T,
  payload: unknown,
): T {
  const instance = plainToInstance(cls, payload ?? {}, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(instance as any, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new RpcException({
      status: 400,
      message: 'Validation error',
      errors,
    });
  }
  return instance;
}

