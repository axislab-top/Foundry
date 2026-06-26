import { metrics } from '@opentelemetry/api';

export type ReplayDelegatePhase = 'fact' | 'tools' | 'decision' | 'tools_decision';

const replayDelegatePhaseHistogram = metrics
  .getMeter('foundry.collaboration')
  .createHistogram('foundry.collaboration.replay_delegate_phase_ms', {
    description: 'Replay delegate sub-phase latency in milliseconds',
  });

export function recordReplayDelegatePhaseMs(phase: ReplayDelegatePhase, startedAtMs: number): void {
  replayDelegatePhaseHistogram.record(Math.max(0, Date.now() - startedAtMs), { phase });
}
