import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { IntentLayerService } from './intent-layer.service.js';
import { ContextGroundingPlannerService } from '../context/context-grounding-planner.service.js';
import { RoomContextService } from '../context/room-context.service.js';
import { MainRoomAudienceRoutingContextService } from './main-room-audience-routing-context.service.js';
import type { CollaborationPipelineV2RunInput } from '../pipeline-v2/collaboration-pipeline-v2.types.js';

class IntentPreviewInternalDto {
  @IsString()
  companyId!: string;

  @IsString()
  roomId!: string;

  @IsString()
  messageId!: string;

  @IsString()
  contentText!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedAgentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedNodeIds?: string[];

  @IsOptional()
  @IsString()
  ceoAgentId?: string | null;

  @IsOptional()
  @IsString()
  messageCategory?: string | null;

  @IsOptional()
  @IsString()
  threadId?: string | null;
}

@Controller('internal/collaboration')
export class IntentPreviewInternalController {
  constructor(
    private readonly roomContextService: RoomContextService,
    private readonly intentLayer: IntentLayerService,
    private readonly contextGroundingPlanner: ContextGroundingPlannerService,
    private readonly mainRoomAudienceRoutingContext: MainRoomAudienceRoutingContextService,
  ) {}

  private assertInternalAuth(header: string | undefined): void {
    const expected = process.env.WORKER_INTERNAL_API_SECRET?.trim();
    if (!expected) {
      throw new UnauthorizedException('internal collaboration routes disabled');
    }
    if (header !== expected) {
      throw new UnauthorizedException('invalid internal auth');
    }
  }

  @Post(['intent-preview', 'audience-routing-preview'])
  @HttpCode(HttpStatus.OK)
  async preview(@Headers('x-internal-auth') internalAuth: string | undefined, @Body() body: IntentPreviewInternalDto) {
    this.assertInternalAuth(internalAuth);
    const roomContext = await this.roomContextService.buildRoomContext({
      companyId: body.companyId,
      roomId: body.roomId,
    });
    if (roomContext.roomType !== 'main') {
      throw new BadRequestException('Preview requires main room (audience routing is main-only)');
    }

    const runInput: CollaborationPipelineV2RunInput = {
      companyId: body.companyId,
      roomId: body.roomId,
      messageId: body.messageId,
      contentText: body.contentText,
      mentionedAgentIds: body.mentionedAgentIds ?? [],
      mentionedNodeIds: body.mentionedNodeIds ?? [],
      ceoAgentId: body.ceoAgentId ?? null,
      threadId: body.threadId ?? null,
      messageCategory: body.messageCategory ?? null,
    };

    const routingCtx = await this.mainRoomAudienceRoutingContext.prepareMainRoomAudienceRoutingRecognizeContext({
      input: runInput,
      roomContext,
      traceId: body.messageId,
      nonDestructiveFollowupHint: true,
    });

    const [intent, contextGroundingPlan] = await Promise.all([
      this.intentLayer.recognizeIntent({
        companyId: body.companyId,
        roomContext,
        contentText: routingCtx.audienceRoutingTurnText,
        originalContentText: body.contentText,
        messageId: body.messageId,
        threadId: body.threadId ?? null,
        traceId: body.messageId,
        mentionedAgentIds: body.mentionedAgentIds ?? [],
        mentionedNodeIds: body.mentionedNodeIds ?? [],
        ceoAgentId: body.ceoAgentId ?? null,
        recentTranscriptDigest: routingCtx.recentTranscriptDigest,
        audienceRoutingRecentTurnFacts: routingCtx.audienceRoutingRecentTurnFacts,
        audienceRoutingMemoryDigest: routingCtx.audienceRoutingMemoryDigest,
      }),
      this.contextGroundingPlanner.planGrounding({
        companyId: body.companyId,
        roomContext,
        contentText: body.contentText,
        messageId: body.messageId,
        threadId: body.threadId ?? null,
        traceId: body.messageId,
        ceoAgentId: body.ceoAgentId ?? null,
        messageCategory: body.messageCategory ?? null,
        recentTranscriptDigest: routingCtx.recentTranscriptDigest,
        audienceRoutingRecentTurnFacts: routingCtx.audienceRoutingRecentTurnFacts,
        audienceRoutingMemoryDigest: routingCtx.audienceRoutingMemoryDigest,
      }),
    ]);

    return { intent, contextGroundingPlan };
  }
}
