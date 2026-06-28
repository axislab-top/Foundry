import { Logger } from '@nestjs/common';
import { CeoChatModelFactory } from './ceo-chat-model.factory.js';

describe('CeoChatModelFactory', () => {
  function makeFactory() {
    const config = {
      getCeoLlmTimeoutMs: () => 20_000,
      getCeoLlmMaxOutputTokens: () => 600,
      getOpenAiApiKey: () => 'sk-openai-test',
      getAnthropicApiKey: () => 'sk-anthropic-test',
    } as any;
    return new CeoChatModelFactory(config);
  }

  it('logs keyLength instead of keyFingerprint for openai route', () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const factory = makeFactory();
    factory.create('gpt-4o-mini', 'sk-override', 'openai', 'https://api.example/v1');
    const payload = debugSpy.mock.calls.find((x) => String(x?.[0] ?? '').includes('chat_factory.build'))?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(payload).toBeTruthy();
    expect(payload?.keyLength).toBeGreaterThan(0);
    expect(payload?.keyFingerprint).toBeUndefined();
  });
});
