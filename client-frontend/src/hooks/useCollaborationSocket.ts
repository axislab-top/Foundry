import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { authSession } from '../services/authSession';
import { companySession } from '../services/companySession';

const gatewayOrigin = import.meta.env.VITE_GATEWAY_ORIGIN || window.location.origin;

export interface UseCollaborationSocketOptions {
  roomId: string | null;
  /** Append incoming WS messages (e.g. message:new) */
  onMessageNew?: (msg: Record<string, unknown>) => void;
  /** Human-in-the-loop approval request (approval:needed) */
  onApprovalNeeded?: (payload: Record<string, unknown>) => void;
  /** LLM stream chunk (message:chunk) */
  onMessageChunk?: (payload: Record<string, unknown>) => void;
}

/**
 * Connects to gateway `/collaboration` namespace; re-joins room on reconnect.
 */
export function useCollaborationSocket({
  roomId,
  onMessageNew,
  onApprovalNeeded,
  onMessageChunk,
}: UseCollaborationSocketOptions): {
  connected: boolean;
  error: string | null;
} {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onMessageRef = useRef(onMessageNew);
  const onApprovalRef = useRef<((payload: Record<string, unknown>) => void) | undefined>(undefined);
  const onChunkRef = useRef<((payload: Record<string, unknown>) => void) | undefined>(undefined);
  onMessageRef.current = onMessageNew;
  onApprovalRef.current = onApprovalNeeded;
  onChunkRef.current = onMessageChunk;

  const joinRoom = useCallback((socket: Socket, id: string) => {
    socket.emit('join_room', { roomId: id });
    socket.emit('join_company_tasks', {});
  }, []);

  useEffect(() => {
    const token = authSession.getAccessToken();
    const companyId = companySession.getCompanyId();
    if (!roomId || !token || !companyId) {
      setConnected(false);
      return;
    }

    const socket = io(`${gatewayOrigin}/collaboration`, {
      auth: { token, companyId },
      transports: ['websocket'],
    });

    const onConnect = () => {
      setConnected(true);
      setError(null);
      joinRoom(socket, roomId);
    };

    socket.on('connect', onConnect);
    socket.on('reconnect', () => {
      joinRoom(socket, roomId);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      setError(err.message);
      setConnected(false);
    });
    socket.on('message:new', (payload: Record<string, unknown>) => {
      onMessageRef.current?.(payload);
    });
    socket.on('approval:needed', (payload: Record<string, unknown>) => {
      onApprovalRef.current?.(payload);
    });
    socket.on('message:chunk', (payload: Record<string, unknown>) => {
      onChunkRef.current?.(payload);
    });
    socket.on('error', (payload: { message?: string }) => {
      if (payload?.message) {
        setError(payload.message);
      }
    });

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [roomId, joinRoom]);

  return { connected, error };
}
