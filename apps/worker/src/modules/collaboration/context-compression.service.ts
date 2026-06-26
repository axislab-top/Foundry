import { Injectable } from '@nestjs/common';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

type CompressionInput = {
  transcript: BaseMessage[];
  stateBlock: string;
  retrievalBlock: string;
  hardBudgetTokens: number;
  rawTranscriptMaxTurns: number;
};

export type CompressionOutput = {
  messages: BaseMessage[];
  summaryBlock: string;
  diagnostics: {
    triggered: boolean;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    transcriptKeptTurns: number;
  };
};

@Injectable()
export class ContextCompressionService {
  compress(input: CompressionInput): CompressionOutput {
    const transcriptText = input.transcript
      .map((m) => String((m as { content?: unknown }).content ?? ''))
      .join('\n');
    const inputChars = transcriptText.length + input.stateBlock.length + input.retrievalBlock.length;
    const estimatedInputTokens = this.estimateTokens(inputChars);
    const triggered = estimatedInputTokens > Math.max(128, Math.floor(input.hardBudgetTokens * 0.7));

    const keptTranscript = input.transcript.slice(-Math.max(2, input.rawTranscriptMaxTurns));
    const summaryBlock = this.buildSummaryBlock({
      stateBlock: input.stateBlock,
      retrievalBlock: input.retrievalBlock,
      transcript: input.transcript,
      compressed: triggered,
    });

    const messages: BaseMessage[] = [];
    if (summaryBlock.trim()) {
      messages.push(new HumanMessage(summaryBlock));
    }
    messages.push(...keptTranscript);

    const outputChars = messages
      .map((m) => String((m as { content?: unknown }).content ?? ''))
      .join('\n').length;

    return {
      messages,
      summaryBlock,
      diagnostics: {
        triggered,
        estimatedInputTokens,
        estimatedOutputTokens: this.estimateTokens(outputChars),
        transcriptKeptTurns: keptTranscript.length,
      },
    };
  }

  private buildSummaryBlock(params: {
    stateBlock: string;
    retrievalBlock: string;
    transcript: BaseMessage[];
    compressed: boolean;
  }): string {
    const facts = this.extractRecentFacts(params.transcript);
    const lines = [
      '【Memory Context Pack】',
      params.compressed ? 'compression=on' : 'compression=off',
      params.stateBlock ? `state:\n${params.stateBlock}` : '',
      facts ? `facts:\n${facts}` : '',
      params.retrievalBlock ? `retrieval:\n${params.retrievalBlock}` : '',
    ].filter(Boolean);
    return lines.join('\n\n').slice(0, 3200);
  }

  private extractRecentFacts(transcript: BaseMessage[]): string {
    const tail = transcript.slice(-10);
    const lines = tail
      .map((m) => String((m as { content?: unknown }).content ?? '').trim())
      .filter(Boolean)
      .slice(-4);
    return lines.map((x, i) => `- f${i + 1}: ${x}`).join('\n');
  }

  private estimateTokens(chars: number): number {
    return Math.ceil(Math.max(0, chars) / 4);
  }
}

