import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Empty, Input, Modal, Select, Spin, Tag, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../modules/auth/AuthProvider';
import { useCompany } from '../../contexts/CompanyContext';
import { useCollaborationSocket } from '../../hooks/useCollaborationSocket';
import type {
  ChatMessage,
  ChatRoom,
  ChatRoomType,
  CollaborationMode,
} from '../../services/collaborationApi';
import {
  createDiscussionThread,
  getRoom,
  listDiscussionThreads,
  listMessages,
  listRoomMembers,
  listRooms,
  roomsQueryKey,
  sendMessage,
  resolveCeoApproval,
} from '../../services/collaborationApi';
import { updateTaskProgress, type TaskStatus } from '../../services/tasksApi';

const ROOM_SECTIONS: { type: ChatRoomType; label: string }[] = [
  { type: 'main', label: '主协作' },
  { type: 'department', label: '部门' },
  { type: 'task', label: '任务群' },
  { type: 'custom', label: '其他' },
];

/** 由 CEO 与后台自动维护，仅供只读展示 */
const COLLAB_MODE_LABEL: Record<CollaborationMode, string> = {
  discussion: '讨论中',
  direct: '直聊',
  execution: '执行中',
  approval_wait: '待审批',
};

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function formatMsgTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function avatarHue(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 42% 46%)`;
}

function groupRoomsByType(rooms: ChatRoom[]): Record<ChatRoomType, ChatRoom[]> {
  const empty: Record<ChatRoomType, ChatRoom[]> = {
    main: [],
    department: [],
    task: [],
    custom: [],
  };
  for (const r of rooms) {
    const t = r.roomType ?? 'custom';
    if (empty[t]) {
      empty[t].push(r);
    } else {
      empty.custom.push(r);
    }
  }
  return empty;
}

/**
 * REST 历史里的 stream_chunk 默认被 UI 过滤掉；若 WebSocket 未连接，用户会「只看到我自己」。
 * - 已有同 trace 的 system 消息时丢弃对应 ceo_report chunk（避免重复）。
 * - 否则按 streamId 折叠 chunk 为一条 agent 文本，便于离线/刷新后仍能看到 CEO 输出。
 */
function mergeHistoryStreamChunks(items: ChatMessage[], activeStreamIds: string[] = []): ChatMessage[] {
  if (!items.length) return items;
  const active = new Set(activeStreamIds);

  const systemTraces = new Set<string>();
  for (const m of items) {
    if (m.messageType !== 'system') continue;
    const tid =
      m.metadata && typeof (m.metadata as { traceId?: unknown }).traceId === 'string'
        ? (m.metadata as { traceId: string }).traceId
        : '';
    if (tid) systemTraces.add(tid);
  }

  type Group = {
    seq: number;
    senderType: ChatMessage['senderType'];
    senderId: string;
    streamId: string;
    parts: Map<number, string>;
    chunkCount?: number;
    createdAt?: string;
    roomId: string;
  };
  const groups = new Map<string, Group>();

  for (const m of items) {
    if (m.messageType !== 'stream_chunk') continue;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const streamId = typeof meta.streamId === 'string' ? meta.streamId : '';
    if (!streamId) continue;

    const traceFromStream = streamId.startsWith('ceo_report:')
      ? streamId.slice('ceo_report:'.length)
      : '';
    if (traceFromStream && systemTraces.has(traceFromStream)) {
      continue;
    }

    let g = groups.get(streamId);
    const seqNum = m.seq != null ? Number(m.seq) : NaN;
    const seq = Number.isFinite(seqNum) ? seqNum : 0;
    if (!g) {
      g = {
        seq,
        senderType: m.senderType,
        senderId: m.senderId,
        streamId,
        parts: new Map(),
        createdAt: m.createdAt,
        roomId: m.roomId,
      };
      groups.set(streamId, g);
    }
    g.seq = Math.min(g.seq, seq);
    const idxRaw = meta.chunkIndex;
    const idx =
      typeof idxRaw === 'number'
        ? idxRaw
        : typeof idxRaw === 'string'
          ? Number(idxRaw)
          : NaN;
    const ci = Number.isFinite(idx) ? idx : g.parts.size;
    g.parts.set(ci, m.content ?? '');
    const ccRaw = meta.chunkCount;
    const cc =
      typeof ccRaw === 'number' ? ccRaw : typeof ccRaw === 'string' ? Number(ccRaw) : NaN;
    if (Number.isFinite(cc)) g.chunkCount = cc;
    if (m.createdAt) g.createdAt = m.createdAt;
  }

  const synthetics: ChatMessage[] = [];
  for (const g of groups.values()) {
    if (active.has(g.streamId)) continue;
    const content =
      typeof g.chunkCount === 'number' && g.chunkCount > 0
        ? Array.from({ length: g.chunkCount }, (_, i) => g.parts.get(i) ?? '').join('')
        : [...g.parts.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, s]) => s)
            .join('');
    if (!content.trim()) continue;
    synthetics.push({
      id: `hist-stream:${g.streamId}`,
      roomId: g.roomId,
      seq: String(g.seq),
      senderType: g.senderType,
      senderId: g.senderId,
      messageType: 'text',
      content,
      metadata: { foldedStreamId: g.streamId, foldedFromHistory: true },
      createdAt: g.createdAt,
    });
  }

  const rest = items.filter((m) => {
    if (m.messageType !== 'stream_chunk') return true;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const streamId = typeof meta.streamId === 'string' ? meta.streamId : '';
    const traceFromStream = streamId.startsWith('ceo_report:')
      ? streamId.slice('ceo_report:'.length)
      : '';
    if (traceFromStream && systemTraces.has(traceFromStream)) return false;
    return false;
  });

  return [...rest, ...synthetics].sort((a, b) => {
    const sa = a.seq != null ? Number(a.seq) : 0;
    const sb = b.seq != null ? Number(b.seq) : 0;
    if (sa !== sb) return sa - sb;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
}

export const CollaborationPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { companyId, isLoading: companiesLoading } = useCompany();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [approvalNeeded, setApprovalNeeded] = useState<
    | null
    | {
        agentId?: string;
        reason?: string;
        approvalId?: string;
        kind?: string;
        taskId?: string;
        reportPreview?: string;
      }
  >(null);
  const [streamBuffers, setStreamBuffers] = useState<
    Record<
      string,
      {
        streamId: string;
        content: string;
        senderType?: 'human' | 'agent';
        senderId?: string;
        firstSeq?: number;
        lastSeq?: number;
        chunkParts: string[];
        chunkCount?: number;
        updatedAt?: string;
      }
    >
  >({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const roomsQ = useQuery({
    queryKey: roomsQueryKey(companyId),
    queryFn: listRooms,
    enabled: Boolean(companyId),
  });

  const rooms = roomsQ.data ?? [];

  useEffect(() => {
    if (!selectedRoomId && rooms.length > 0) {
      const main = rooms.find((r) => r.roomType === 'main');
      setSelectedRoomId(main?.id ?? rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  const { connected, error: wsError } = useCollaborationSocket({
    roomId: selectedRoomId,
    onMessageNew: (payload) => {
      const msg = payload as unknown as ChatMessage;
      if (
        msg.messageType === 'system' &&
        msg.metadata &&
        typeof (msg.metadata as { traceId?: string }).traceId === 'string'
      ) {
        const streamId = `ceo_report:${(msg.metadata as { traceId: string }).traceId}`;
        setStreamBuffers((prev) => {
          if (!prev[streamId]) return prev;
          const { [streamId]: _omit, ...rest } = prev;
          return rest;
        });
      }
      setLive((prev) => {
        if (msg.id && prev.some((p) => p.id === msg.id)) {
          return prev;
        }
        return [...prev, msg];
      });
    },
    onApprovalNeeded: (payload) => {
      setApprovalNeeded(
        payload as {
          agentId?: string;
          reason?: string;
          approvalId?: string;
          kind?: string;
          taskId?: string;
          reportPreview?: string;
        },
      );
    },
    onMessageChunk: (payload) => {
      const p = payload as Record<string, unknown>;
      const streamId = typeof p.streamId === 'string' ? p.streamId : undefined;
      if (!streamId) return;
      const chunk = typeof p.content === 'string' ? p.content : '';
      const senderType = (p.senderType === 'human' || p.senderType === 'agent'
        ? p.senderType
        : undefined) as 'human' | 'agent' | undefined;
      const senderId = typeof p.senderId === 'string' ? p.senderId : undefined;
      const updatedAt = typeof p.createdAt === 'string' ? p.createdAt : undefined;

      const seqNum =
        typeof p.seq === 'number' ? p.seq : typeof p.seq === 'string' ? Number(p.seq) : NaN;
      const seq = Number.isFinite(seqNum) ? seqNum : undefined;

      const metadata = typeof p.metadata === 'object' && p.metadata ? (p.metadata as Record<string, unknown>) : {};
      const chunkIndexNum =
        typeof metadata.chunkIndex === 'number'
          ? metadata.chunkIndex
          : typeof metadata.chunkIndex === 'string'
            ? Number(metadata.chunkIndex)
            : NaN;
      const chunkIndex = Number.isFinite(chunkIndexNum) ? chunkIndexNum : undefined;

      const chunkCountNum =
        typeof metadata.chunkCount === 'number'
          ? metadata.chunkCount
          : typeof metadata.chunkCount === 'string'
            ? Number(metadata.chunkCount)
            : NaN;
      const chunkCount = Number.isFinite(chunkCountNum) ? chunkCountNum : undefined;

      setStreamBuffers((prev) => {
        const prevEntry = prev[streamId];
        const nextChunkParts = prevEntry?.chunkParts ? [...prevEntry.chunkParts] : [];

        if (typeof chunkIndex === 'number') {
          nextChunkParts[chunkIndex] = chunk;
        } else {
          nextChunkParts.push(chunk);
        }

        const nextContent =
          typeof chunkCount === 'number'
            ? Array.from({ length: chunkCount }, (_v, i) => nextChunkParts[i] ?? '').join('')
            : nextChunkParts.join('');

        return {
          ...prev,
          [streamId]: {
            streamId,
            content: nextContent,
            senderType: senderType ?? prevEntry?.senderType,
            senderId: senderId ?? prevEntry?.senderId,
            firstSeq:
              typeof prevEntry?.firstSeq === 'number'
                ? prevEntry.firstSeq
                : typeof seq === 'number'
                  ? seq
                  : undefined,
            lastSeq: typeof seq === 'number' ? seq : prevEntry?.lastSeq,
            chunkParts: nextChunkParts,
            chunkCount: chunkCount ?? prevEntry?.chunkCount,
            updatedAt: updatedAt ?? prevEntry?.updatedAt,
          },
        };
      });
    },
  });

  const membersQ = useQuery({
    queryKey: [...roomsQueryKey(companyId), 'members', selectedRoomId] as const,
    queryFn: () => listRoomMembers(selectedRoomId!),
    enabled: Boolean(companyId && selectedRoomId),
  });

  const roomDetailQ = useQuery({
    queryKey: [...roomsQueryKey(companyId), 'room', selectedRoomId] as const,
    queryFn: () => getRoom(selectedRoomId!),
    enabled: Boolean(companyId && selectedRoomId),
  });

  const threadsQ = useQuery({
    queryKey: [...roomsQueryKey(companyId), 'threads', selectedRoomId] as const,
    queryFn: () => listDiscussionThreads(selectedRoomId!),
    enabled: Boolean(companyId && selectedRoomId),
  });

  const messagesQ = useQuery({
    queryKey: [...roomsQueryKey(companyId), 'messages', selectedRoomId] as const,
    queryFn: () => listMessages(selectedRoomId!, { limit: 100 }),
    enabled: Boolean(companyId && selectedRoomId),
    /** WebSocket 离线时仅靠首屏 GET 会看不到 CEO（chunk 被过滤）；定时拉取补全 */
    refetchInterval: connected ? false : 20_000,
  });

  const messages = useMemo(() => {
    const base = mergeHistoryStreamChunks(
      messagesQ.data?.items ?? [],
      Object.keys(streamBuffers),
    );
    const merged = [...base];
    const ids = new Set(base.map((m) => m.id));

    // 将 stream_chunk 折叠后的“正在生成”占位消息插回时间线，
    // 使其与普通消息按照 seq/createdAt 统一排序，而不是固定渲染在底部。
    const streamPlaceholders: ChatMessage[] = Object.values(streamBuffers).map((s) => ({
      id: `stream:${s.streamId}`,
      roomId: selectedRoomId ?? '',
      // 动态：使用 lastSeq 让占位消息随 chunk 到达“往后移动”
      seq:
        typeof s.lastSeq === 'number'
          ? String(s.lastSeq)
          : typeof s.firstSeq === 'number'
            ? String(s.firstSeq)
            : undefined,
      senderType: s.senderType ?? 'human',
      senderId: s.senderId ?? s.streamId,
      messageType: 'text',
      content: s.content,
      metadata: {
        isStreamPlaceholder: true,
        streamId: s.streamId,
      },
      createdAt: s.updatedAt,
    }));

    for (const ph of streamPlaceholders) {
      if (!ph.id || ids.has(ph.id)) continue;
      merged.push(ph);
      ids.add(ph.id);
    }

    for (const m of live) {
      if (m.id && !ids.has(m.id)) {
        merged.push(m);
        ids.add(m.id);
      }
    }
    return merged
      .sort((a, b) => {
      const sa = a.seq != null ? Number(a.seq) : 0;
      const sb = b.seq != null ? Number(b.seq) : 0;
      if (sa !== sb) return sa - sb;
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
      })
      .filter((m) => m.messageType !== 'stream_chunk');
  }, [messagesQ.data?.items, live, streamBuffers, selectedRoomId]);

  useEffect(() => {
    setLive([]);
    setStreamBuffers({});
    setApprovalNeeded(null);
    setSelectedThreadId(null);
  }, [selectedRoomId]);

  const createThreadMut = useMutation({
    mutationFn: async () => {
      if (!selectedRoomId) return;
      const title = window.prompt('新讨论线程标题', '新话题')?.trim();
      if (!title) return;
      const t = await createDiscussionThread(selectedRoomId, { title });
      setSelectedThreadId(t.id);
      return t;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [...roomsQueryKey(companyId), 'threads', selectedRoomId],
      });
    },
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamBuffers, selectedRoomId]);

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!selectedRoomId || !draft.trim()) {
        return;
      }
      const metadata: Record<string, unknown> = {};
      if (approvalNeeded?.approvalId) {
        metadata.approvalId = approvalNeeded.approvalId;
      }
      await sendMessage({
        roomId: selectedRoomId,
        content: draft.trim(),
        messageType: 'text',
        ...(selectedThreadId ? { threadId: selectedThreadId } : {}),
        ...(Object.keys(metadata).length ? { metadata } : {}),
      });
    },
    onSuccess: async () => {
      setDraft('');
      await queryClient.invalidateQueries({
        queryKey: [...roomsQueryKey(companyId), 'messages', selectedRoomId],
      });
    },
  });

  const currentRoom: ChatRoom | undefined =
    roomDetailQ.data ?? rooms.find((r) => r.id === selectedRoomId);
  const title = currentRoom?.name || '协作';
  const collabMode: CollaborationMode = currentRoom?.collaborationMode ?? 'discussion';
  const grouped = useMemo(() => groupRoomsByType(rooms), [rooms]);

  const roomTypeLabel = (t: ChatRoomType): string =>
    ROOM_SECTIONS.find((s) => s.type === t)?.label ?? t;

  if (!companyId && companiesLoading) {
    return (
      <div className="content-area content-area--flush collab-hub collab-hub--loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="content-area content-area--flush collab-hub">
        <Empty
          className="collab-hub__empty"
          description="请先选择公司后再使用协作中心"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <button type="button" className="qa-btn primary" onClick={() => navigate('/companies/new')}>
            创建公司
          </button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="content-area content-area--flush collab-hub" style={{ flex: 1, minHeight: 0 }}>
      <div className="collab-hub__frame">
        <aside className="collab-hub__sidebar">
          <div className="collab-hub__sidebar-head">
            <h1 className="collab-hub__title">协作中心</h1>
            <p className="collab-hub__subtitle">房间与消息与后端实时同步</p>
          </div>
          {roomsQ.isLoading ? (
            <div className="collab-hub__sidebar-loading">
              <Spin size="small" />
            </div>
          ) : rooms.length === 0 ? (
            <p className="orgos-muted collab-hub__sidebar-empty">暂无房间。创建公司后通常会生成主协作群。</p>
          ) : (
            ROOM_SECTIONS.map(({ type, label }) => {
              const list = grouped[type];
              if (!list.length) return null;
              return (
                <div key={type} className="collab-hub__section">
                  <div className="collab-hub__section-label">{label}</div>
                  <ul className="collab-hub__room-list" role="list">
                    {list.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className={`collab-hub__room-btn${selectedRoomId === r.id ? ' collab-hub__room-btn--active' : ''}`}
                          onClick={() => setSelectedRoomId(r.id)}
                        >
                          <span className="collab-hub__room-name">{r.name}</span>
                          {r.roomType === 'main' ? (
                            <span className="collab-hub__room-tag" title="主协作群">
                              主
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </aside>

        <section className="collab-hub__main">
          <header className="collab-hub__header">
            <div className="collab-hub__header-text">
              <span className="collab-hub__header-title">{title}</span>
              {currentRoom ? (
                <span className="collab-hub__header-meta">{roomTypeLabel(currentRoom.roomType)}</span>
              ) : null}
            </div>
            <div className="collab-hub__header-right">
              {selectedRoomId ? (
                <>
                  <Tooltip title="协作阶段由 CEO 根据对话自动判定，无需手动切换">
                    <Tag className="collab-hub__mode-tag" style={{ marginRight: 8 }}>
                      {COLLAB_MODE_LABEL[collabMode]}
                    </Tag>
                  </Tooltip>
                  <Select<string | null>
                    size="small"
                    allowClear
                    placeholder="线程"
                    value={selectedThreadId}
                    onChange={(v) => setSelectedThreadId(v ?? null)}
                    options={[
                      ...(threadsQ.data ?? []).map((t) => ({
                        value: t.id,
                        label: t.title || shortId(t.id),
                      })),
                    ]}
                    style={{ width: 120, marginRight: 8 }}
                  />
                  <Button size="small" type="link" onClick={() => createThreadMut.mutate()}>
                    新线程
                  </Button>
                </>
              ) : null}
              <Tooltip title={connected ? 'WebSocket 已连接' : '未连接实时通道（消息仍可通过刷新加载）'}>
                <span className={`collab-hub__live${connected ? ' collab-hub__live--on' : ''}`}>
                  {connected ? '实时' : '离线'}
                </span>
              </Tooltip>
              <div className="collab-hub__members" aria-label="房间成员">
                {membersQ.isLoading ? (
                  <Spin size="small" />
                ) : (
                  (membersQ.data ?? []).slice(0, 8).map((m) => (
                    <Tooltip
                      key={m.id}
                      title={`${m.memberType === 'agent' ? 'Agent' : '成员'} ${shortId(m.memberId)}`}
                    >
                      <span
                        className="collab-hub__member-avatar"
                        style={{ background: avatarHue(m.memberId) }}
                      >
                        {m.memberType === 'agent' ? 'A' : '人'}
                      </span>
                    </Tooltip>
                  ))
                )}
                {(membersQ.data?.length ?? 0) > 8 ? (
                  <span className="collab-hub__member-more">+{(membersQ.data?.length ?? 0) - 8}</span>
                ) : null}
              </div>
            </div>
          </header>

          {wsError ? (
            <div className="collab-hub__alert">
              <Alert type="warning" message={wsError} showIcon />
            </div>
          ) : null}
          {messagesQ.error ? (
            <div className="collab-hub__alert">
              <Alert type="error" message={(messagesQ.error as Error).message} showIcon />
            </div>
          ) : null}

          <div ref={scrollRef} className="collab-hub__messages">
            {!selectedRoomId ? (
              <p className="orgos-muted">请选择左侧房间</p>
            ) : messagesQ.isLoading ? (
              <div className="collab-hub__messages-loading">
                <Spin />
              </div>
            ) : messages.length === 0 ? (
              <Empty
                className="collab-hub__empty-inline"
                description="暂无消息，在下方输入第一条"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              messages.map((m) => {
                const isSelf = m.senderType === 'human' && user?.id && m.senderId === user.id;
                const isStreamPlaceholder = Boolean(
                  m.metadata && (m.metadata as any).isStreamPlaceholder === true,
                );
                const foldedHist =
                  m.metadata && (m.metadata as { foldedFromHistory?: boolean }).foldedFromHistory === true;
                const senderLabel = isStreamPlaceholder
                  ? '正在生成'
                  : m.messageType === 'system'
                    ? '系统'
                    : m.senderType === 'agent'
                      ? foldedHist
                        ? 'CEO'
                        : `Agent ${shortId(m.senderId)}`
                      : isSelf
                        ? '我'
                        : `成员 ${shortId(m.senderId)}`;
                return (
                  <div
                    key={m.id}
                    className={`collab-hub__msg${isSelf ? ' collab-hub__msg--self' : ''}`}
                  >
                    <div
                      className="collab-hub__msg-avatar"
                      style={{ background: avatarHue(m.senderId) }}
                      aria-hidden
                    >
                      {m.senderType === 'agent' ? 'A' : '人'}
                    </div>
                    <div className="collab-hub__msg-body">
                      <div className="collab-hub__msg-meta">
                        <span className="collab-hub__msg-sender">{senderLabel}</span>
                        <span className="collab-hub__msg-time">{formatMsgTime(m.createdAt)}</span>
                        {m.messageType !== 'text' && !isStreamPlaceholder ? (
                          <span className="collab-hub__msg-type">{m.messageType}</span>
                        ) : null}
                      </div>
                      <div className="collab-hub__msg-text">{m.content}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <Modal
            open={approvalNeeded != null}
            title="需要人工确认"
            onCancel={() => setApprovalNeeded(null)}
            footer={null}
            destroyOnClose
          >
            <div style={{ whiteSpace: 'pre-wrap' }}>
              <div style={{ marginBottom: 12, color: '#555' }}>{approvalNeeded?.reason ?? ''}</div>
              {approvalNeeded?.reportPreview ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>CEO 计划预览</div>
                  <div>{approvalNeeded.reportPreview}</div>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  type="primary"
                  onClick={async () => {
                    if (!approvalNeeded) return;
                    try {
                      if (approvalNeeded.taskId) {
                        await updateTaskProgress(approvalNeeded.taskId, {
                          status: 'in_progress' as TaskStatus,
                          approvalId: approvalNeeded.approvalId,
                        });
                      } else if (approvalNeeded.approvalId) {
                        await resolveCeoApproval(approvalNeeded.approvalId, 'approved');
                      }
                    } finally {
                      setApprovalNeeded(null);
                    }
                  }}
                >
                  通过
                </Button>
                <Button
                  onClick={async () => {
                    if (!approvalNeeded) return;
                    try {
                      if (approvalNeeded.taskId) {
                        await updateTaskProgress(approvalNeeded.taskId, {
                          status: 'blocked' as TaskStatus,
                          blockedReason: '用户拒绝',
                          approvalId: approvalNeeded.approvalId,
                        });
                      } else if (approvalNeeded.approvalId) {
                        await resolveCeoApproval(approvalNeeded.approvalId, 'rejected');
                      }
                    } finally {
                      setApprovalNeeded(null);
                    }
                  }}
                >
                  拒绝
                </Button>
                <Button
                  onClick={async () => {
                    if (!approvalNeeded) return;
                    try {
                      if (approvalNeeded.taskId) {
                        await updateTaskProgress(approvalNeeded.taskId, {
                          status: 'in_progress' as TaskStatus,
                          approvalId: approvalNeeded.approvalId,
                        });
                      } else if (approvalNeeded.approvalId) {
                        const note = window.prompt('请输入修改说明（可选）') ?? undefined;
                        await resolveCeoApproval(
                          approvalNeeded.approvalId,
                          'modified',
                          note && note.trim().length ? note.trim() : undefined,
                        );
                      }
                    } finally {
                      setApprovalNeeded(null);
                    }
                  }}
                >
                  修改
                </Button>
              </div>
            </div>
          </Modal>

          <footer className="collab-hub__composer">
            <Input
              placeholder="输入消息，使用 @CEO 呼叫 CEO，Enter 发送"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  sendMut.mutate();
                }
              }}
              disabled={!selectedRoomId || sendMut.isPending}
              className="collab-hub__composer-input"
            />
            <button
              type="button"
              className="qa-btn primary collab-hub__composer-send"
              onClick={() => sendMut.mutate()}
              disabled={!selectedRoomId || !draft.trim() || sendMut.isPending}
            >
              发送
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
};
