import { create } from "zustand";

/**
 * W15：可选 dev 线（仅 Phase 3 Flag 打开时写入；不参与业务渲染路径）。
 */
type Phase3DevWireState = {
  lastEvent: string | null;
  lastAt: string | null;
  lastPayloadPreview: string | null;
  record: (event: string, payload: unknown) => void;
  clear: () => void;
};

function previewPayload(payload: unknown): string {
  try {
    const s = JSON.stringify(payload);
    return s.length > 400 ? `${s.slice(0, 400)}…` : s;
  } catch {
    return String(payload);
  }
}

export const usePhase3DevWire = create<Phase3DevWireState>((set) => ({
  lastEvent: null,
  lastAt: null,
  lastPayloadPreview: null,
  record: (event, payload) =>
    set({
      lastEvent: event,
      lastAt: new Date().toISOString(),
      lastPayloadPreview: previewPayload(payload),
    }),
  clear: () => set({ lastEvent: null, lastAt: null, lastPayloadPreview: null }),
}));
