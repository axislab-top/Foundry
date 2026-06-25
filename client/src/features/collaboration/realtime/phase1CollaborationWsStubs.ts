import type { Socket } from "socket.io-client";
import { COLLABORATION_CORE_ROOM_WS_EVENTS } from "./phase3-ws-contract";

/**
 * W8：协作 WS 领域事件桩 — 仅 console / 可选 dev store，不改变既有消息处理逻辑。
 * 事件名与 Worker 出站 routing 对齐（网关转发时可能带命名空间前缀，此处监听 canonical 名）。
 */
export function attachPhase1CollaborationWsStubs(socket: Socket, opts?: { debug?: boolean }): () => void {
  const debug = opts?.debug ?? import.meta.env?.DEV === true;

  const onDomainV2 = (payload: unknown) => {
    if (debug) console.debug("[foundry][phase1] agent-message.domain.v2", payload);
  };
  const onTaskDelegation = (payload: unknown) => {
    if (debug) console.debug("[foundry][phase1] task.delegation.requested", payload);
  };
  const onDirectorProposed = (payload: unknown) => {
    if (debug) console.debug("[foundry][phase1] director.autonomous.proposed", payload);
  };
  const onCoreRoomEvent = (ev: string, payload: unknown) => {
    if (debug) console.debug(`[foundry][phase1] ${ev}`, payload);
  };

  socket.on("agent-message.domain.v2", onDomainV2);
  socket.on("task.delegation.requested", onTaskDelegation);
  socket.on("director.autonomous.proposed", onDirectorProposed);
  for (const ev of COLLABORATION_CORE_ROOM_WS_EVENTS) {
    socket.on(ev, (payload: unknown) => onCoreRoomEvent(ev, payload));
  }
  socket.on("responder:thinking", (payload: unknown) => onCoreRoomEvent("responder:thinking", payload));
  socket.on("message:chunk", (payload: unknown) => onCoreRoomEvent("message:chunk", payload));
  socket.on("message:new", (payload: unknown) => onCoreRoomEvent("message:new", payload));

  return () => {
    socket.off("agent-message.domain.v2", onDomainV2);
    socket.off("task.delegation.requested", onTaskDelegation);
    socket.off("director.autonomous.proposed", onDirectorProposed);
    for (const ev of COLLABORATION_CORE_ROOM_WS_EVENTS) {
      socket.off(ev);
    }
    socket.off("responder:thinking");
    socket.off("message:chunk");
    socket.off("message:new");
  };
}
