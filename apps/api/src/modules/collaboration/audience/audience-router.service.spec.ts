import { AudienceRouterService } from './audience-router.service.js';
import type { ChatRoom } from '../entities/chat-room.entity.js';

function room(overrides: Partial<ChatRoom>): ChatRoom {
  return {
    id: 'room-1',
    companyId: 'company-1',
    name: '测试房间',
    roomType: 'main',
    organizationNodeId: null,
    taskId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ChatRoom;
}

describe('AudienceRouterService', () => {
  const service = new AudienceRouterService();

  it('routes a single mentioned agent to direct employee reply', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'main' }),
      messageId: 'message-1',
      messageCategory: 'decision',
      metadata: { mentionedAgentIds: ['agent-1'] },
    });

    expect(decision).toMatchObject({
      responderType: 'employee_agent',
      targetAgentIds: ['agent-1'],
      responseMode: 'direct_reply',
      source: 'mention',
      reasons: ['single_agent_mention'],
    });
  });

  it('routes multiple mentioned agents into discussion mode', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'main' }),
      messageId: 'message-1',
      messageCategory: 'decision',
      metadata: { mentionedAgentIds: ['agent-1', 'agent-2'] },
    });

    expect(decision).toMatchObject({
      responderType: 'employee_agent',
      targetAgentIds: ['agent-1', 'agent-2'],
      responseMode: 'discussion',
      source: 'mention',
      reasons: ['multiple_targets_mentioned'],
    });
  });

  it('routes multiple departments into multi-department discussion mode', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'main' }),
      messageId: 'message-1',
      messageCategory: 'coordination',
      metadata: { mentionedDepartmentSlugs: ['marketing', 'sales'] },
    });

    expect(decision).toMatchObject({
      responderType: 'multi_department',
      targetDepartmentSlugs: ['marketing', 'sales'],
      responseMode: 'discussion',
      source: 'mention',
      reasons: ['multiple_targets_mentioned'],
    });
  });

  it('routes main room default messages to CEO direct reply', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'main' }),
      messageId: 'message-1',
      messageCategory: 'decision',
      metadata: {},
    });

    expect(decision).toMatchObject({
      responderType: 'ceo',
      responseMode: 'direct_reply',
      source: 'room_default',
      reasons: ['main_room_default_ceo'],
    });
  });

  it('routes main room coordination messages to CEO handoff', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'main' }),
      messageId: 'message-1',
      messageCategory: 'coordination',
      metadata: {},
    });

    expect(decision).toMatchObject({
      responderType: 'ceo',
      responseMode: 'handoff',
      source: 'room_default',
    });
  });

  it('routes department room defaults to department head', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'department', organizationNodeId: 'node-1' }),
      messageId: 'message-1',
      messageCategory: 'decision',
      metadata: {},
    });

    expect(decision).toMatchObject({
      responderType: 'department_head',
      targetNodeIds: ['node-1'],
      responseMode: 'direct_reply',
      source: 'room_default',
      reasons: ['department_room_default_head'],
    });
  });

  it('routes department upgrade requests to department head handoff', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'department', organizationNodeId: 'node-1' }),
      messageId: 'message-1',
      messageCategory: 'upgrade_request',
      metadata: {},
    });

    expect(decision).toMatchObject({
      responderType: 'department_head',
      targetNodeIds: ['node-1'],
      responseMode: 'handoff',
      source: 'room_default',
    });
  });

  it('routes task room defaults to employee agent direct reply', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'task' }),
      messageId: 'message-1',
      messageCategory: 'decision',
      metadata: {},
    });

    expect(decision).toMatchObject({
      responderType: 'employee_agent',
      responseMode: 'direct_reply',
      source: 'room_default',
      reasons: ['task_room_default_assignee'],
    });
  });

  it('routes custom rooms without explicit targets to silent', () => {
    const decision = service.decide({
      companyId: 'company-1',
      room: room({ roomType: 'custom' }),
      messageId: 'message-1',
      messageCategory: 'decision',
      metadata: {},
    });

    expect(decision).toMatchObject({
      responderType: 'none',
      responseMode: 'silent',
      source: 'room_default',
      reasons: ['custom_room_no_default_responder'],
    });
  });
});
