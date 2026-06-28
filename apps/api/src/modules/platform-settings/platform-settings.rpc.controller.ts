import { Controller, Logger } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { PlatformSettingsService } from './platform-settings.service.js';

/** Worker 拉取平台协作主链开关（DB 为单一事实来源，env 为启动回退） */
@Controller()
export class PlatformSettingsRpcController {
  private readonly logger = new Logger(PlatformSettingsRpcController.name);

  constructor(private readonly settings: PlatformSettingsService) {}

  @MessagePattern('platformSettings.collaborationMainChain.get')
  async collaborationMainChainGet() {
    return await executeRpc({
      logger: this.logger,
      pattern: 'platformSettings.collaborationMainChain.get',
      timeoutMs: 10_000,
      payload: {},
      handler: () => this.settings.getCollaborationMainChainSettings(),
    });
  }
}
