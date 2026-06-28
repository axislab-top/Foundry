import { readAiPromptFile } from './read-ai-prompt-file.js';

export function getCeoEarlyExitDeciderPrompt(): string {
  return readAiPromptFile('ceo-early-exit-decider.prompt.md');
}
