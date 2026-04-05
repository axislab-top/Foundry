import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { AlertsService } from './alerts.service.js';
import { AlertsListRpcDto } from './dto/query-alerts.dto.js';
import { AlertsResolveRpcDto } from './dto/resolve-alert.dto.js';

@Controller()
export class AlertsRpcController {
  private readonly logger = new Logger(AlertsRpcController.name);

  constructor(private readonly alerts: AlertsService) {}

  @MessagePattern('alerts.list')
  async list(@Payload() payload: unknown) {
    const dto = validateRpcDto(AlertsListRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'alerts.list',
      timeoutMs: 15000,
      payload,
      handler: () => this.alerts.listAlerts(dto),
    });
  }

  @MessagePattern('alerts.resolve')
  async resolve(@Payload() payload: unknown) {
    const dto = validateRpcDto(AlertsResolveRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'alerts.resolve',
      timeoutMs: 15000,
      payload,
      handler: () => this.alerts.resolveAlert(dto),
    });
  }
}

