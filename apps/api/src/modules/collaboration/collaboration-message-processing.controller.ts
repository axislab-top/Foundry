import { Controller, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MessageProcessingWorkerService } from './services/message-processing-worker.service.js';

@ApiTags('collaboration-message-processing')
@ApiBearerAuth('JWT-auth')
@Controller('v1/collaboration/message-processing')
export class CollaborationMessageProcessingController {
  constructor(private readonly worker: MessageProcessingWorkerService) {}

  @Post('process-once')
  @ApiOperation({ summary: 'Process pending collaboration message jobs once' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async processOnce(@Query('limit') limit?: string) {
    return this.worker.processOnce(limit ? Number(limit) : 50);
  }
}
