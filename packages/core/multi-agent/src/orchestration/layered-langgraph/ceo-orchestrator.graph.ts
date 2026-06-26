import type { LayeredGraphNodeInput, LayeredGraphNodeOutput } from './types.js';

export async function ceoBreakdownNode(input: LayeredGraphNodeInput): Promise<LayeredGraphNodeOutput> {
  return {
    next: 'dept',
    payload: {
      goal: input.goal ?? '',
      sourceLayer: 'ceo',
    },
  };
}
