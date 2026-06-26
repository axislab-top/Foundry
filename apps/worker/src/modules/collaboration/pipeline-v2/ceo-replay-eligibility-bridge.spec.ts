/**
 * 校验 `@service/ai` 导出的 replay 门控纯函数；**不代表** Worker 主群管线会调用它们。
 */
import { computeReplayTranscriptContextBoost, evaluateCeoReplayEligibility } from '@service/ai';

describe('evaluateCeoReplayEligibility (audience summon dropped)', () => {
  function base(over: Record<string, unknown> = {}) {
    return {
      replayEnabled: true,
      confidenceThreshold: 0.92,
      followupHintActive: false,
      mainRoomIntentGuardOk: true,
      intentType: 'audience_resolution',
      intentConfidence: 0.92,
      contentText: '你好',
      memoryHits: [] as unknown[],
      ...over,
    };
  }

  it('memory below threshold blocks replay by default', () => {
    const r = evaluateCeoReplayEligibility(
      base({ memoryHits: [{ snippet: 'x' }] }) as Parameters<typeof evaluateCeoReplayEligibility>[0],
    );
    expect(r.shouldHandle).toBe(false);
    expect(r.reason).toBe('memory_graph_confidence_below_threshold');
  });

  it('skips memory gate when audience targets were all dropped after whitelist', () => {
    const r = evaluateCeoReplayEligibility(
      base({
        memoryHits: [{ snippet: 'x' }],
        mainRoomAudiencePolicyBlocksAutoHandoff: true,
      }) as Parameters<typeof evaluateCeoReplayEligibility>[0],
    );
    expect(r.shouldHandle).toBe(true);
    expect(r.reason).toBe('ceo_replay_eligible_main_room_policy_blocked_handoff');
    expect(r.confidence).toBe(0.92);
  });

  it('allows replay when memory empty but replay transcript excerpt is substantial', () => {
    const digest = `【最近对话 — 节选】\n${'x'.repeat(2000)}`;
    expect(computeReplayTranscriptContextBoost(digest)).toBeGreaterThan(0.2);
    const r = evaluateCeoReplayEligibility(
      base({
        memoryHits: [],
        replayTranscriptBlock: digest,
      }) as Parameters<typeof evaluateCeoReplayEligibility>[0],
    );
    expect(r.shouldHandle).toBe(true);
    expect(r.reason).toBe('ceo_replay_eligible_transcript_context_boost');
  });

  it('computeReplayTranscriptContextBoost returns 0 for failure sentinel transcript', () => {
    expect(
      computeReplayTranscriptContextBoost('【最近对话 — 节选】（collaboration.messages.list 拉取失败；x'.repeat(80)),
    ).toBe(0);
  });
});
