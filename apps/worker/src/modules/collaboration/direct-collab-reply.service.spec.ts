import { of } from 'rxjs';
import { ReplyMode } from './reply-mode.js';
import { DirectCollabReplyService } from './direct-collab-reply.service.js';

describe('DirectCollabReplyService', () => {
  it('direct-reply-double-failure-diagnostic', async () => {
    const streamPublisher = { publishIncrementalStream: jest.fn(async () => undefined) };
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      isCollabDirectReplyStreamingEnabledForRoom: () => false,
      getCollabDirectReplyStreamChunkChars: () => 200,
      getCeoLightTimeoutMs: () => 1000,
      getCeoLightPrimaryTimeoutMs: () => 1000,
      getCeoLightFallbackTimeoutMs: () => 500,
      getCollaborationLlmTimeoutMs: () => 1000,
      getCollabDirectReplyModel: () => 'gpt-4o-mini',
      getCeoHeavyTimeoutMs: () => 1500,
      isDirectReplyAutoConsolidateEnabled: () => false,
      getCollabStreamMinIntervalMs: () => 50,
      getCollabStreamMinChars: () => 10,
    } as any;
    const monitoring = {
      observeCeoPipelineLayerSeconds: jest.fn(),
      observeCollaborationReplySeconds: jest.fn(),
      observeCollaborationReplyFirstTokenSeconds: jest.fn(),
      incCollaborationReplyChunkMerged: jest.fn(),
      incCollaborationReplyChunkOriginal: jest.fn(),
      incCollabFallbackStage: jest.fn(),
    } as any;
    const collabLlm = {
      createChatModelResolved: jest.fn(async () => ({
        model: {
          invoke: jest.fn(async () => {
            throw new Error('primary failed');
          }),
        },
        llmKeyId: 'kid-test',
      })),
    } as any;
    const groupChat = {
      buildAuxiliaryContextForReply: jest.fn(async () => ({
        transcript: [],
        auxiliarySystemText: '',
        memoryEntryIds: [],
      })),
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini' })),
      getFullPrompt: jest.fn(async () => 'system'),
    } as any;
    const diagnosticFallback = {
      appendDiagnosticFallback: jest.fn(async () => undefined),
    } as any;
    const outputSanitizer = {
      sanitizeAssistantText: jest.fn((s: string) => s),
      toVisibleLayer: jest.fn((s: string) => s),
    } as any;
    const billingTokenMiddleware = {
      wrapChatModel: jest.fn((m: unknown) => m),
      recordConsumption: jest.fn(async () => undefined),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'agents.findOne') {
          return of({ id: 'a1', name: 'CEO', role: 'ceo', llmModel: 'gpt-4o-mini' });
        }
        if (pattern === 'collaboration.rooms.findOne') return of({ id: 'r1', taskId: null });
        if (pattern === 'collaboration.messages.appendAgent') return of({ id: 'msg-1' });
        return of({});
      }),
    } as any;

    const svc = new DirectCollabReplyService(config, apiRpc, streamPublisher as any);

    await expect(
      svc.reply({
        companyId: 'c1',
        roomId: 'r1',
        agentId: 'a1',
        sourceMessageId: 'm1',
        output: {
          version: 'v2',
          nextStep: 'structured_reply',
          finalText: 'x',
          commitmentText: 'x',
          suggestedTasks: [],
          memoryReferences: [],
          metadata: {},
        } as any,
      }),
    ).resolves.toBeUndefined();

    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        companyId: 'c1',
        roomId: 'r1',
        agentId: 'a1',
      }),
    );
  });

  it('uses friendly diagnostic message on double timeout', async () => {
    const streamPublisher = { publishIncrementalStream: jest.fn(async () => undefined) };
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      isCollabDirectReplyStreamingEnabledForRoom: () => false,
      getCollabDirectReplyStreamChunkChars: () => 200,
      getCeoLightTimeoutMs: () => 1000,
      getCeoLightPrimaryTimeoutMs: () => 1000,
      getCeoLightFallbackTimeoutMs: () => 500,
      getCollaborationLlmTimeoutMs: () => 1000,
      getCollabDirectReplyModel: () => 'gpt-4o-mini',
      getCeoHeavyTimeoutMs: () => 1500,
      isDirectReplyAutoConsolidateEnabled: () => false,
      getCollabStreamMinIntervalMs: () => 50,
      getCollabStreamMinChars: () => 10,
    } as any;
    const monitoring = {
      observeCeoPipelineLayerSeconds: jest.fn(),
      observeCollaborationReplySeconds: jest.fn(),
      observeCollaborationReplyFirstTokenSeconds: jest.fn(),
      incCollaborationReplyChunkMerged: jest.fn(),
      incCollaborationReplyChunkOriginal: jest.fn(),
      incCollabFallbackStage: jest.fn(),
    } as any;
    const collabLlm = {
      createChatModelResolved: jest.fn(async () => ({
        model: {
          invoke: jest.fn(async () => {
            throw new Error('direct_reply.invoke hard timeout after 45000ms');
          }),
        },
        llmKeyId: 'kid-test',
      })),
    } as any;
    const groupChat = {
      buildAuxiliaryContextForReply: jest.fn(async () => ({
        transcript: [],
        auxiliarySystemText: '',
        memoryEntryIds: [],
      })),
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini' })),
      getFullPrompt: jest.fn(async () => 'system'),
    } as any;
    const diagnosticFallback = {
      appendDiagnosticFallback: jest.fn(async () => undefined),
    } as any;
    const outputSanitizer = {
      sanitizeAssistantText: jest.fn((s: string) => s),
      toVisibleLayer: jest.fn((s: string) => s),
    } as any;
    const billingTokenMiddleware = {
      wrapChatModel: jest.fn((m: unknown) => m),
      recordConsumption: jest.fn(async () => undefined),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'agents.findOne') {
          return of({ id: 'a1', name: 'CEO', role: 'ceo', llmModel: 'gpt-4o-mini' });
        }
        if (pattern === 'collaboration.rooms.findOne') return of({ id: 'r1', taskId: null });
        if (pattern === 'collaboration.messages.appendAgent') return of({ id: 'msg-2' });
        return of({});
      }),
    } as any;

    const svc = new DirectCollabReplyService(config, apiRpc, streamPublisher as any);

    await expect(
      svc.reply({
        companyId: 'c1',
        roomId: 'r1',
        agentId: 'a1',
        sourceMessageId: 'm2',
        output: {
          version: 'v2',
          nextStep: 'structured_reply',
          finalText: 'x',
          commitmentText: 'x',
          suggestedTasks: [],
          memoryReferences: [],
          metadata: {},
        } as any,
      }),
    ).resolves.toBeUndefined();

    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        companyId: 'c1',
        roomId: 'r1',
        agentId: 'a1',
      }),
    );
  });

  it('skips simulated publishIncrementalStream when generation.tokenStreamed is true', async () => {
    const streamPublisher = { publishIncrementalStream: jest.fn(async () => undefined) };
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      isCollabDirectReplyStreamingEnabledForRoom: () => true,
      getCollabDirectReplyStreamChunkChars: () => 200,
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.appendAgent') return of({ id: 'msg-final' });
        return of({});
      }),
    } as any;

    const svc = new DirectCollabReplyService(config, apiRpc, streamPublisher as any);
    const longText = '长回复'.repeat(120);

    await svc.reply({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      sourceMessageId: 'm-stream',
      output: {
        version: 'v2',
        nextStep: 'structured_reply',
        finalText: longText,
        commitmentText: longText,
        suggestedTasks: [],
        memoryReferences: [],
        metadata: {},
      } as any,
      generation: {
        text: longText,
        truncatedByLength: false,
        continuationRounds: 0,
        extremeCapApplied: false,
        originalCharLength: longText.length,
        tokenStreamed: true,
      },
    });

    expect(streamPublisher.publishIncrementalStream).not.toHaveBeenCalled();
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        messageType: 'text',
        content: longText,
      }),
    );
  });
});

