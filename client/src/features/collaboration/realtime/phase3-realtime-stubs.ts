import type { Socket } from "socket.io-client";
import { isPhase3FrontendEnabled } from "@/shared/config/env";
import { PHASE3_COLLABORATION_WS_EVENTS } from "./phase3-ws-contract";
import { usePhase3DevWire } from "./phase3DevWire";

/** 与 `VITE_PHASE3_FRONTEND_ENABLED` 对齐：仅桩/监听，不改变消息主路径 */
export function isPhase3RealtimeStubEnabled(): boolean {
  return isPhase3FrontendEnabled();
}

/**
 * W15：Phase 3 领域事件桩 — `console.debug` + 可选 Zustand dev wire。
 * 必须在 {@link isPhase3RealtimeStubEnabled} 为真时才会注册 handler。
 */
export function attachPhase3RealtimeStubs(socket: Socket, opts?: { debug?: boolean }): () => void {
  if (!isPhase3RealtimeStubEnabled()) {
    return () => undefined;
  }

  const debug = opts?.debug ?? import.meta.env?.DEV === true;
  const handlers: Array<{ ev: string; fn: (payload: unknown) => void }> = [];

  for (const ev of PHASE3_COLLABORATION_WS_EVENTS) {
    const fn = (payload: unknown) => {
      if (debug) console.debug(`[foundry][phase3] ${ev}`, payload);
      try {
        usePhase3DevWire.getState().record(ev, payload);
      } catch {
        // ignore store errors in non-React contexts
      }
    };
    handlers.push({ ev, fn });
    socket.on(ev, fn);
  }

  return () => {
    for (const { ev, fn } of handlers) {
      socket.off(ev, fn);
    }
  };
}
