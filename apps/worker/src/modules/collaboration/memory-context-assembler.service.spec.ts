import { HumanMessage } from '@langchain/core/messages';
import { MemoryContextAssemblerService } from './memory-context-assembler.service.js';

describe('MemoryContextAssemblerService', () => {
  function makeSvc() {
    const config = {
      getCollaborationMentionRpcTimeoutMs: jest.fn(() => 5000),
      getGroupChatMemoryRetrievalTopK: jest.fn(() => 4),
    } as any;
    const groupChatContext = {
      loadTranscriptMessages: jest.fn(async () => [new HumanMessage('h1'), new HumanMessage('h2')]),
      buildConversationStateBlock: jest.fn(async () => ({ block: 'state-block' })),
      buildRetrievedMemoryBlock: jest.fn(async () => ({ block: 'retrieval-block', entryIds: ['m1'] })),
      formatLeadCollaborationMemoryHitsAsRetrievalPack: jest.fn(() => ({
        block: '【会话相关知识检索】mock-lead-pack',
        entryIds: ['e1'],
        memoryReferences: [],
      })),
      buildAuxiliaryContextForReply: jest.fn(async () => ({
        transcript: [new HumanMessage('aux-h1')],
        auxiliarySystemText: 'aux-system',
        memoryEntryIds: [],
      })),
    } as any;
    const compression = {
      compress: jest.fn((input: any) => ({
        messages: input.transcript,
        summaryBlock: '',
        diagnostics: {
          triggered: false,
          estimatedInputTokens: 100,
          estimatedOutputTokens: 50,
          transcriptKeptTurns: Array.isArray(input.transcript) ? input.transcript.length : 0,
        },
      })),
    } as any;
    const memoryCrossCut = {
      recordRetrievalDuplicateSkipped: jest.fn(),
    } as any;
    const orgContextPack = {
      buildDepartmentRosterPromptForAgent: jest.fn(async () => ({ block: '', pack: null })),
    } as any;
    config.isMemoryRetrievalDeduplicationEnabled = jest.fn(() => true);
    const svc = new MemoryContextAssemblerService(
      config,
      groupChatContext,
      compression,
      memoryCrossCut,
      orgContextPack,
    );
    return { svc, groupChatContext, compression, memoryCrossCut, orgContextPack };
  }

  it('assembles orchestration context via transcript/state/retrieval', async () => {
    const { svc, compression, groupChatContext } = makeSvc();
    const out = await svc.assembleForOrchestration({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      latestUserText: 'hello',
    });
    expect(groupChatContext.loadTranscriptMessages).toHaveBeenCalled();
    expect(groupChatContext.buildConversationStateBlock).toHaveBeenCalled();
    expect(groupChatContext.buildRetrievedMemoryBlock).toHaveBeenCalled();
    expect(compression.compress).toHaveBeenCalled();
    expect(out.messages.length).toBe(2);
  });

  it('skips roster injection when injectRoomMemberDirectory is false', async () => {
    const { svc, compression } = makeSvc();
    const roster = '【room_member_directory】\n1. Agent';
    const out = await svc.assembleForOrchestration({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      latestUserText: '你在吗',
      roomMemberPromptBlock: roster,
      injectRoomMemberDirectory: false,
    });
    expect(out.messages.every((m) => !String((m as HumanMessage).content ?? '').includes('room_member_directory'))).toBe(
      true,
    );
    expect(compression.compress).toHaveBeenCalled();
  });

  it('injects roster only when contextGroundingPlan includes room_roster', async () => {
    const { svc } = makeSvc();
    const roster = '【room_member_directory】\n1. Agent';
    const withRoster = await svc.assembleForOrchestration({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      latestUserText: '群里有哪些人',
      roomMemberPromptBlock: roster,
      collaborationExecutionContext: {
        contextGroundingPlan: {
          prefetchBlocks: ['speaker', 'transcript', 'room_roster'],
          factsQueryTypes: ['room_members'],
          toolPolicy: 'tools_allowed',
          confidence: 0.9,
          source: 'llm',
        },
      } as any,
    });
    expect(
      withRoster.messages.some((m) => String((m as HumanMessage).content ?? '').includes('room_member_directory')),
    ).toBe(true);

    const withoutRoster = await svc.assembleForOrchestration({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm2',
      latestUserText: '你在吗',
      roomMemberPromptBlock: roster,
      collaborationExecutionContext: {
        contextGroundingPlan: {
          prefetchBlocks: ['speaker', 'transcript'],
          factsQueryTypes: [],
          toolPolicy: 'tools_allowed',
          confidence: 0.5,
          source: 'llm_fallback',
        },
      } as any,
    });
    expect(
      withoutRoster.messages.every((m) => !String((m as HumanMessage).content ?? '').includes('room_member_directory')),
    ).toBe(true);
  });

  it('assembles directed context via auxiliary context and compression', async () => {
    const { svc, groupChatContext, compression } = makeSvc();
    const out = await svc.assembleForDirected({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      messageId: 'm2',
      latestUserText: 'ping',
    });
    expect(groupChatContext.buildAuxiliaryContextForReply).toHaveBeenCalled();
    expect(compression.compress).toHaveBeenCalled();
    expect(out.auxiliarySystemText).toContain('aux-system');
  });

  it('keeps session memory retrieval block for employee-mode directed context', async () => {
    const { svc, groupChatContext } = makeSvc();
    groupChatContext.buildAuxiliaryContextForReply.mockResolvedValueOnce({
      transcript: [new HumanMessage('aux-h1')],
      auxiliarySystemText:
        '【直聊任务】\n你被点名\n\n【会话相关知识检索（memory_entry，供对照与引用；优先与当前讨论相关）】\n- hit1',
      memoryEntryIds: [],
    });
    const out = await svc.assembleForDirected({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      agentRole: 'executor',
      messageId: 'm2',
      latestUserText: 'ping',
    });
    expect(out.auxiliarySystemText).toContain('【会话相关知识检索');
    expect(out.auxiliarySystemText).toContain('【直聊任务】');
  });

  it('applies employee narrow-memory policy for directed context', async () => {
    const { svc, groupChatContext } = makeSvc();
    groupChatContext.buildAuxiliaryContextForReply.mockResolvedValueOnce({
      transcript: [new HumanMessage('aux-h1')],
      auxiliarySystemText:
        '【Reply Facts】\ncompanyName=demo\n\n【对话状态（Conversation State）】\nwaiting_for=a1\n\n【公司档案】\nxxx',
      memoryEntryIds: [],
    });
    const out = await svc.assembleForDirected({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      agentRole: 'member',
      messageId: 'm2',
      latestUserText: 'ping',
    });
    expect(out.auxiliarySystemText).toContain('【对话状态');
    expect(out.auxiliarySystemText).not.toContain('【Reply Facts】');
    expect(out.auxiliarySystemText).not.toContain('【公司档案】');
  });

  it('passes directSummonOptions when intentDecision2026_1 targets direct_summon', async () => {
    const { svc, groupChatContext } = makeSvc();
    await svc.assembleForDirected({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      messageId: 'm2',
      latestUserText: 'ping',
      intentDecision2026_1: {
        intentType: 'direct_summon',
        confidence: 0.9,
        routingHints: { shouldExecute: true, riskLevel: 'low', targetAgentIds: ['a1'] },
      } as any,
    });
    expect(groupChatContext.buildAuxiliaryContextForReply).toHaveBeenCalledWith(
      expect.objectContaining({
        directSummonOptions: { isDirectSummoned: true, targetAgentId: 'a1' },
      }),
    );
  });

  it('reuses lead memory hits in orchestration assemble when dedup context is present', async () => {
    const { svc, groupChatContext, memoryCrossCut } = makeSvc();
    await svc.assembleForOrchestration({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      latestUserText: 'hello',
      collaborationExecutionContext: {
        traceId: 't1',
        memoryHits: [{ id: 'e1', content: 'fact', score: 0.9 }],
        retrievedAt: new Date(),
        leadMemorySearchDone: true,
      },
    });
    expect(memoryCrossCut.recordRetrievalDuplicateSkipped).toHaveBeenCalledWith('orchestration_assemble');
    expect(groupChatContext.buildRetrievedMemoryBlock).not.toHaveBeenCalled();
    expect(groupChatContext.formatLeadCollaborationMemoryHitsAsRetrievalPack).toHaveBeenCalled();
  });

  it('reuses lead memory hits for auxiliary when dedup context is present', async () => {
    const { svc, groupChatContext, memoryCrossCut } = makeSvc();
    await svc.assembleForDirected({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      messageId: 'm2',
      latestUserText: 'ping',
      collaborationExecutionContext: {
        traceId: 't1',
        memoryHits: [{ id: 'e1', content: 'fact', score: 0.9 }],
        retrievedAt: new Date(),
        leadMemorySearchDone: true,
      },
    });
    expect(memoryCrossCut.recordRetrievalDuplicateSkipped).toHaveBeenCalledWith('group_chat_auxiliary');
    expect(groupChatContext.buildAuxiliaryContextForReply).toHaveBeenCalledWith(
      expect.objectContaining({
        reuseLeadCollaborationMemorySearch: true,
        leadCollaborationMemoryHits: [{ id: 'e1', content: 'fact', score: 0.9 }],
      }),
    );
  });

  it('does not reuse empty lead memory hits for orchestration; falls back to retrieval', async () => {
    const { svc, groupChatContext, memoryCrossCut } = makeSvc();
    await svc.assembleForOrchestration({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      latestUserText: 'hello',
      collaborationExecutionContext: {
        traceId: 't1',
        memoryHits: [],
        retrievedAt: new Date(),
        leadMemorySearchDone: true,
      },
    });
    expect(memoryCrossCut.recordRetrievalDuplicateSkipped).not.toHaveBeenCalled();
    expect(groupChatContext.buildRetrievedMemoryBlock).toHaveBeenCalled();
  });

  it('does not reuse empty lead hits for directed auxiliary', async () => {
    const { svc, groupChatContext, memoryCrossCut } = makeSvc();
    await svc.assembleForDirected({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      messageId: 'm2',
      latestUserText: 'ping',
      collaborationExecutionContext: {
        traceId: 't1',
        memoryHits: [],
        retrievedAt: new Date(),
        leadMemorySearchDone: true,
      },
    });
    expect(memoryCrossCut.recordRetrievalDuplicateSkipped).not.toHaveBeenCalled();
    expect(groupChatContext.buildAuxiliaryContextForReply).toHaveBeenCalledWith(
      expect.objectContaining({
        reuseLeadCollaborationMemorySearch: false,
      }),
    );
  });
});

