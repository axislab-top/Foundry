export interface BufferedStreamOptions {
  minIntervalMs: number;
  minChars: number;
}

/**
 * Merge tiny model deltas into user-friendly chunks:
 * - flush when buffered chars >= minChars
 * - or when elapsed time >= minIntervalMs
 */
export class BufferedStreamTransformer {
  constructor(private readonly options: BufferedStreamOptions) {}

  async *transform(source: AsyncIterable<string>): AsyncGenerator<string> {
    let buffer = '';
    let timerStartedAt = 0;

    for await (const piece of source) {
      if (!piece) continue;
      buffer += piece;
      if (!timerStartedAt) timerStartedAt = Date.now();

      const shouldFlushByChars = buffer.length >= this.options.minChars;
      const shouldFlushByTime = Date.now() - timerStartedAt >= this.options.minIntervalMs;
      if (shouldFlushByChars || shouldFlushByTime) {
        yield buffer;
        buffer = '';
        timerStartedAt = 0;
      }
    }

    if (buffer) {
      yield buffer;
    }
  }
}

