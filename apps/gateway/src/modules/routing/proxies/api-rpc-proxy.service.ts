import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { API_RPC_CLIENT } from '../../../common/rpc/rpc.constants.js';
import { throwGatewayFromApiRpcError } from '../../../common/rpc/handle-api-rpc-error.js';

@Injectable()
export class ApiRpcProxyService {
  private readonly logger = new Logger(ApiRpcProxyService.name);

  constructor(@Inject(API_RPC_CLIENT) private readonly client: ClientProxy) {}

  async send<TResponse = any, TRequest = any>(
    pattern: string,
    data: TRequest,
    timeoutMs: number,
  ): Promise<TResponse> {
    try {
      return await firstValueFrom(
        this.client.send<TResponse, TRequest>(pattern, data).pipe(timeout(timeoutMs)),
      );
    } catch (error: unknown) {
      throwGatewayFromApiRpcError(error, pattern, this.logger);
    }
  }
}
