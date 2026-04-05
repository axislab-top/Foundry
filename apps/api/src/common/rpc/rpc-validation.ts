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
    // Gateway 会在 RPC 载荷上附加 actor、companyId、追踪头等；各 DTO 只声明业务字段。
    // forbid=true 会导致几乎所有 RPC 在校验阶段失败；内网 RPC 信任网关，仅白名单剥离即可。
    forbidNonWhitelisted: false,
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

