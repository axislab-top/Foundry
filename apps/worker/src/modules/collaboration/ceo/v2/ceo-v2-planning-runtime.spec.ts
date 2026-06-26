import { isPlanningModelCapabilityAccepted, planningStructuredOutputMethod } from './ceo-v2-planning-runtime.js';

describe('ceo-v2-planning-runtime', () => {
  it('accepts gpt/o-series models for strict json_schema planning', () => {
    expect(planningStructuredOutputMethod('gpt-4o')).toBe('jsonSchema');
    expect(isPlanningModelCapabilityAccepted('o3')).toBe(true);
  });

  it('uses json_mode for gpt-4o-mini / gpt-4o-nano (substring gpt-4o must not force json_schema)', () => {
    expect(planningStructuredOutputMethod('gpt-4o-mini')).toBe('jsonMode');
    expect(planningStructuredOutputMethod('gpt-4o-mini-2024-07-18')).toBe('jsonMode');
    expect(planningStructuredOutputMethod('gpt-4o-nano')).toBe('jsonMode');
    expect(planningStructuredOutputMethod('gpt-5-mini')).toBe('jsonMode');
    expect(planningStructuredOutputMethod('gpt-5-nano')).toBe('jsonMode');
    expect(isPlanningModelCapabilityAccepted('gpt-4o-mini')).toBe(true);
  });

  it('accepts json_mode providers for structured planning (strategy admin pool models)', () => {
    expect(planningStructuredOutputMethod('glm-4-flash-250414')).toBe('jsonMode');
    expect(planningStructuredOutputMethod('deepseek-chat')).toBe('jsonMode');
    expect(planningStructuredOutputMethod('mimo-v2.5-pro')).toBe('jsonMode');
    expect(isPlanningModelCapabilityAccepted('deepseek-chat')).toBe(true);
    expect(isPlanningModelCapabilityAccepted('mimo-v2.5-pro')).toBe(true);
  });

  it('rejects empty model id', () => {
    expect(isPlanningModelCapabilityAccepted('')).toBe(false);
    expect(isPlanningModelCapabilityAccepted('   ')).toBe(false);
  });
});
