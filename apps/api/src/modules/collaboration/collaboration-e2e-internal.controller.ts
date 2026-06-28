import { Body, Controller, Headers, HttpCode, HttpStatus, Post, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TENANT_REQUIRED_METADATA_KEY } from '@service/tenant';
import { Public } from '../../common/decorators/public.decorator.js';
import { Company } from '../companies/entities/company.entity.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { ChatRoom } from './entities/chat-room.entity.js';
import { RoomMember } from './entities/room-member.entity.js';
import { ChatRoomService } from './services/chat-room.service.js';
import { ChatMessageService } from './services/chat-message.service.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';

class CollaborationE2ERunDto {
  @IsOptional()
  @IsString()
  messageText?: string;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(120_000)
  timeoutMs?: number;
}

@ApiTags('internal.collaboration-e2e')
@Public()
@SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
@Controller('internal/collaboration-e2e')
export class CollaborationE2EInternalController {
  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
    @InjectRepository(OrganizationNode) private readonly orgNodes: Repository<OrganizationNode>,
    @InjectRepository(ChatRoom) private readonly roomsRepo: Repository<ChatRoom>,
    @InjectRepository(RoomMember) private readonly roomMembers: Repository<RoomMember>,
    private readonly rooms: ChatRoomService,
    private readonly messages: ChatMessageService,
  ) {}

  private assertInternalAuth(header: string | undefined): void {
    const expected = process.env.API_INTERNAL_AUTH_SECRET?.trim();
    if (!expected) throw new UnauthorizedException('internal e2e routes disabled');
    if (header !== expected) throw new UnauthorizedException('invalid internal auth');
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create fresh room and run end-to-end: human message -> CEO reply' })
  async run(
    @Headers('x-internal-auth') internalAuth: string | undefined,
    @Body() body: CollaborationE2ERunDto,
  ) {
    this.assertInternalAuth(internalAuth);

    const testId = randomUUID().slice(0, 8);
    const companyId = randomUUID();
    const roomHumanActorId = randomUUID();
    const now = new Date();

    const company = await this.companies.save(
      this.companies.create({
        id: companyId,
        name: `Intent E2E Test Co ${testId}`,
        slug: `intent-e2e-${testId}`,
        industry: '测试',
        industryCode: 'other',
        scale: 'small',
        goal: 'E2E testing',
        initialBudget: '0',
        isActive: true,
        createdBy: null,
        status: 'active',
        description: 'Created by internal collaboration e2e controller',
        logoUrl: null,
        contactEmail: null,
        contactPhone: null,
        timezone: 'Asia/Shanghai',
        defaultLanguage: 'zh-CN',
        executionPaused: false,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const orgMarketingId = randomUUID();
    const orgOpsId = randomUUID();
    const ceoAgentId = randomUUID();
    const agentAId = randomUUID();
    const agentBId = randomUUID();

    await this.orgNodes.save([
      this.orgNodes.create({
        id: orgOpsId,
        companyId: company.id,
        parentId: null,
        type: 'department',
        name: `Ops-${testId}`,
        description: 'E2E org node',
        agentId: null,
        order: 0,
        metadata: { e2e: true, testId },
      }),
      this.orgNodes.create({
        id: orgMarketingId,
        companyId: company.id,
        parentId: null,
        type: 'department',
        name: `Marketing-${testId}`,
        description: 'E2E org node',
        agentId: null,
        order: 1,
        metadata: { e2e: true, testId },
      }),
    ]);

    await this.agents.save([
      this.agents.create({
        id: ceoAgentId,
        companyId: company.id,
        name: `CEO-${testId}`,
        role: 'ceo',
        status: 'active',
        organizationNodeId: orgOpsId,
        reportsToAgentId: null,
        hierarchyVersion: 1,
        expertise: 'CEO',
        avatarUrl: null,
        systemPrompt: null,
        llmModel: 'gpt-4o-mini',
        llmKeyId: null,
        personality: null,
        humanInLoop: false,
        pendingConfig: null,
        metadata: { e2e: true, testId },
      }),
      this.agents.create({
        id: agentAId,
        companyId: company.id,
        name: `Marketing-${testId}`,
        role: 'executor',
        status: 'active',
        organizationNodeId: orgMarketingId,
        reportsToAgentId: ceoAgentId,
        hierarchyVersion: 1,
        expertise: 'Marketing executor',
        avatarUrl: null,
        systemPrompt: null,
        llmModel: 'gpt-4o-mini',
        llmKeyId: null,
        personality: null,
        humanInLoop: false,
        pendingConfig: null,
        metadata: { e2e: true, testId },
      }),
      this.agents.create({
        id: agentBId,
        companyId: company.id,
        name: `Ops-${testId}`,
        role: 'executor',
        status: 'active',
        organizationNodeId: orgOpsId,
        reportsToAgentId: ceoAgentId,
        hierarchyVersion: 1,
        expertise: 'Ops executor',
        avatarUrl: null,
        systemPrompt: null,
        llmModel: 'gpt-4o-mini',
        llmKeyId: null,
        personality: null,
        humanInLoop: false,
        pendingConfig: null,
        metadata: { e2e: true, testId },
      }),
    ]);

    const room = await this.rooms.createRoom(company.id, {
      roomType: 'custom',
      name: `Intent E2E Room ${testId}`,
      createdBy: null,
      metadata: {
        e2e: true,
        testId,
      },
    });

    await this.roomMembers.save([
      this.roomMembers.create({
        companyId: company.id,
        roomId: room.id,
        memberType: 'human',
        memberId: roomHumanActorId,
        leftAt: null,
        lastReadSeq: '0',
      }),
      this.roomMembers.create({
        companyId: company.id,
        roomId: room.id,
        memberType: 'agent',
        memberId: ceoAgentId,
        leftAt: null,
        lastReadSeq: '0',
      }),
      this.roomMembers.create({
        companyId: company.id,
        roomId: room.id,
        memberType: 'agent',
        memberId: agentAId,
        leftAt: null,
        lastReadSeq: '0',
      }),
      this.roomMembers.create({
        companyId: company.id,
        roomId: room.id,
        memberType: 'agent',
        memberId: agentBId,
        leftAt: null,
        lastReadSeq: '0',
      }),
    ]);

    // Use system message as actor to bypass membership/role gating, but keep senderType=human.
    const humanText = String(body.messageText ?? '').trim() || '大家同步一下：现在进展如何？';
    const humanMessage = await this.messages.appendSystemMessageAsActor(
      company.id,
      room.id,
      roomHumanActorId,
      humanText,
      { e2e: true, testId, traceId: `e2e:${testId}` },
    );

    const timeoutMs = Math.max(500, Math.min(120_000, body.timeoutMs ?? 8_000));
    const deadline = Date.now() + timeoutMs;
    let lastItems: any[] = [];
    while (Date.now() < deadline) {
      const res = await this.messages.listMessages(company.id, { roomId: room.id, limit: 50 });
      lastItems = res.items ?? [];
      const agentReply = lastItems.find((m) => m.senderType === 'agent' && m.senderId === ceoAgentId);
      if (agentReply) {
        return {
          ok: true,
          companyId: company.id,
          roomId: room.id,
          ceoAgentId,
          agentIds: [ceoAgentId, agentAId, agentBId],
          humanActorId: roomHumanActorId,
          humanMessageId: humanMessage.id,
          agentReplyMessageId: agentReply.id,
          items: [
            { id: humanMessage.id, senderType: humanMessage.senderType, senderId: humanMessage.senderId, messageType: humanMessage.messageType, content: humanMessage.content, metadata: humanMessage.metadata },
            { id: agentReply.id, senderType: agentReply.senderType, senderId: agentReply.senderId, messageType: agentReply.messageType, content: agentReply.content, metadata: agentReply.metadata },
          ],
        };
      }
      await this.sleep(400);
    }

    return {
      ok: false,
      timeoutMs,
      companyId: company.id,
      roomId: room.id,
      ceoAgentId,
      humanMessageId: humanMessage.id,
      lastSeq: lastItems.length ? lastItems[lastItems.length - 1]?.seq : null,
      lastItems: lastItems.slice(-5).map((m) => ({
        id: m.id,
        senderType: m.senderType,
        senderId: m.senderId,
        messageType: m.messageType,
        content: String(m.content ?? '').slice(0, 200),
      })),
    };
  }
}

