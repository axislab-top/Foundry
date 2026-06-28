import { readAiPromptFile } from './read-ai-prompt-file.js';

export function getCeoMemoryCortexSummaryPrompt(): string {
  return readAiPromptFile('ceo-memory-cortex-summary.prompt.md');
}
