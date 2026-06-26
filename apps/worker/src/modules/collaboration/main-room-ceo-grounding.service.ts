import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { CompanyCortexService } from '../company-runtime/company-cortex.service.js';
import type { RoomContext } from './contracts/collaboration-2026.contracts.js';
import {
  buildCeoSpeakerPromptLine,
  buildOrgSnapshotPromptBlock,
  buildRoomMemberPromptBlock,
} from './context/room-context.service.js';
import type {
  MainRoomReplayFactLayerMode,
  MainRoomReplayLlmContextPack,
} from './pipeline-v2/collaboration-pipeline-v2.types.js';
import { MemoryCrossCutService } from './memory/memory-cross-cut.service.js';
import type { MemoryLayerRoomHint } from './memory/memory-cross-cut.service.js';
import { buildStrategyCeoPackMemoryQuerySuffix } from './strategy-planning-profile.util.js';
import {
  MAIN_ROOM_REPLAY_FACT_LAYER_CHAR_LIMITS as FACT_LIMITS,
  MAIN_ROOM_REPLAY_MINIMAL_BASELINE_LIMITS as MIN_BASE,
} from './replay/main-room-replay-fact-layer.contract.js';
import { wrapReplayUntrustedMemoryBlock, wrapReplayUntrustedTranscriptBlock } from './replay/main-room-replay-trust-boundary.util.js';
import type { RoomMemberDirectoryEntry } from './contracts/collaboration-2026.contracts.js';
import {
  buildMinimalContextGroundingFallback,
  planIncludesBlock,
  type ContextGroundingPlan,
} from './context/context-grounding-plan.js';

/**
 * 主群 CEO replay：**单一事实层装配器**（按 ContextGroundingPlan 按需拼接各块）。
 * 顺序与截断只在此处维护；{@link MainRoomReplayExecutionDelegateService} 只拼接控制面与用户句。
 */
export type MainRoomReplayFactLayerTruncation = {
  profile: boolean;
  roomRoster: boolean;
  orgSnapshot: boolean;
  cortexCore: boolean;
  companyMemoryFacts: boolean;
};

export type MainRoomReplayFactLayerDiagnostics = {
  syncedCompanyProfileChars: number;
  speakerChars: number;
  roomRosterChars: number;
  factsChars: number;
  orgSnapshotChars: number;
  cortexCoreChars: number;
  companyMemoryFactsChars: number;
  transcriptChars: number;
  memoryChars: number;
  truncation: MainRoomReplayFactLayerTruncation;
  factLayerMode: MainRoomReplayFactLayerMode;
  prefetchBlocks: string[];
};

@Injectable()
export class MainRoomCeoGroundingService {
  constructor(
    private readonly config: ConfigService,
    private readonly companyCortex: CompanyCortexService,
    private readonly memoryCrossCut: MemoryCrossCutService,
  ) {}

  private memoryLayerHint(roomContext: RoomContext): MemoryLayerRoomHint {
    return {
      organizationNodeId: roomContext.organizationNodeId,
      orgDepartments: roomContext.orgSnapshot.departments,
    };
  }

  /**
   * 装配 replay 委托的 **事实层** 长文（不含 intent 元数据、草稿、用户原话）。
   */
  async buildReplayDelegateFactLayer(params: {
    companyId: string;
    roomContext: RoomContext;
    ceoAgentId: string | null;
    userText: string;
    traceId: string;
    threadId?: string | null;
    pack: MainRoomReplayLlmContextPack;
    factLayerMode?: MainRoomReplayFactLayerMode;
    plan?: ContextGroundingPlan | null;
  }): Promise<{ serialized: string; diagnostics: MainRoomReplayFactLayerDiagnostics }> {
    if (params.roomContext.roomType !== 'main') {
      throw new Error('main_room_ceo_grounding_requires_main_room');
    }

    const mode = params.factLayerMode ?? params.pack.factLayerMode ?? 'minimal_tools';
    const plan = params.plan ?? buildMinimalContextGroundingFallback('disabled');
    const roomId = params.roomContext.roomId;

    const want = (block: Parameters<typeof planIncludesBlock>[1]) => planIncludesBlock(plan, block);

    const speakerBlock = want('speaker')
      ? buildCeoSpeakerPromptLine(params.ceoAgentId, params.roomContext.memberDirectory ?? [])
      : '';

    let roomMemberBlock = '';
    let roomRosterTruncated = false;
    if (want('room_roster')) {
      if (mode === 'minimal_tools') {
        const compact = this.buildCompactRoomRosterSummary(params.roomContext.memberDirectory ?? []);
        const directory = params.roomContext.memberDirectory ?? [];
        roomRosterTruncated =
          directory.length > MIN_BASE.rosterMaxEntries || compact.length >= MIN_BASE.rosterMaxChars;
        roomMemberBlock = compact;
      } else {
        const roomMemberFull = buildRoomMemberPromptBlock(params.roomContext.memberDirectory ?? []);
        roomRosterTruncated = roomMemberFull.length > FACT_LIMITS.roomMemberDirectory;
        roomMemberBlock = roomMemberFull.slice(0, FACT_LIMITS.roomMemberDirectory);
      }
    }

    const factsBlock =
      want('company_people') || (plan.factsQueryTypes?.length ?? 0) > 0
        ? String(params.pack.factsBlock ?? '').trim()
        : '';

    let orgBlock = '';
    let orgRaw = '';
    let orgTruncated = false;
    if (want('org_snapshot')) {
      if (mode === 'minimal_tools') {
        orgRaw = this.buildCompactOrgSummary(params.roomContext.orgSnapshot.departments);
        orgTruncated =
          params.roomContext.orgSnapshot.departments.length > MIN_BASE.orgMaxDepartments ||
          orgRaw.length >= MIN_BASE.orgLineMaxChars;
        orgBlock = orgRaw ? `【组织部门 — 摘要】\n${orgRaw}` : '';
      } else {
        orgRaw = buildOrgSnapshotPromptBlock(params.roomContext.orgSnapshot.departments);
        orgTruncated = orgRaw.length > FACT_LIMITS.orgSnapshot;
        const orgSliced = orgRaw.slice(0, FACT_LIMITS.orgSnapshot);
        orgBlock = orgRaw ? `【组织部门事实】\n${orgSliced}` : '';
      }
    }

    let profileBlock = '';
    let profileRaw = '';
    let profileTruncated = false;
    let cortexBlock = '';
    let cortexCoreTruncated = false;
    let companyMemoryBlock = '';
    let companyMemoryFactsTruncated = false;

    if (want('company_profile') || want('memory')) {
      const cortex = await this.companyCortex
        .getCompanyBrainContext({
          companyId: params.companyId,
          roomId,
          userMessage: params.userText,
          includeProfileGapAssessment: false,
        })
        .catch(() => null);

      if (want('company_profile') && cortex) {
        profileRaw = String(cortex.profile ?? '').trim();
        profileTruncated = profileRaw.length > FACT_LIMITS.profile;
        const profileSliced = profileRaw.slice(0, FACT_LIMITS.profile);
        profileBlock = profileRaw
          ? `【公司档案（Cortex / memory.companyProfile）】\n${profileSliced}`
          : '';

        const deptLine = params.roomContext.orgSnapshot.departments
          .slice(0, 16)
          .map((d) => `${d.name}(${d.slug})`)
          .join('、');
        const cortexCoreLines: string[] = [];
        cortexCoreLines.push(`room_members_count: ${cortex.roomMemberCount}`);
        cortexCoreLines.push(`active_agents: ${cortex.activeAgentCount}`);
        cortexCoreLines.push(`company_profile_hit: ${cortex.profileHit}`);
        if (deptLine && !orgBlock) cortexCoreLines.push(`key_departments: ${deptLine}`);
        if (cortex.strategicNotes?.length) {
          cortexCoreLines.push(`strategic_notes: ${cortex.strategicNotes.join(' | ').slice(0, 600)}`);
        }
        if (cortex.memorySignals?.length) {
          cortexCoreLines.push(`memory_signals: ${cortex.memorySignals.join(' | ').slice(0, 600)}`);
        }
        const cortexCoreBody = cortexCoreLines.join('\n').trim();
        cortexCoreTruncated = cortexCoreBody.length > FACT_LIMITS.cortexCore;
        const cortexCoreSliced = cortexCoreBody.slice(0, FACT_LIMITS.cortexCore);
        cortexBlock = cortexCoreSliced ? `【Cortex 核心】\n${cortexCoreSliced}` : '';
      }

      if (want('memory')) {
        const ceoPackQuery = `${params.userText} ${buildStrategyCeoPackMemoryQuerySuffix()}`.trim();
        const memPack = await this.memoryCrossCut
          .retrieveTopCompanyFactsForCeoPack({
            companyId: params.companyId,
            roomId,
            traceId: params.traceId,
            query: ceoPackQuery.slice(0, 2000),
            limit: 3,
            layerRoomHint: this.memoryLayerHint(params.roomContext),
          })
          .catch(() => ({ lines: [] as string[] }));

        const memoryFactLines = memPack.lines.filter((x) => String(x).trim());
        const companyMemoryBodyUnpacked =
          memoryFactLines.length > 0
            ? `【公司级 Memory 事实 · Top ${memoryFactLines.length}】\n${memoryFactLines
                .map((x, i) => `${i + 1}. ${String(x).slice(0, 480)}`)
                .join('\n')}`
            : '';
        companyMemoryFactsTruncated =
          companyMemoryBodyUnpacked.length > FACT_LIMITS.companyMemoryFactsPack;
        companyMemoryBlock = companyMemoryBodyUnpacked
          ? wrapReplayUntrustedMemoryBlock(
              companyMemoryBodyUnpacked.slice(0, FACT_LIMITS.companyMemoryFactsPack),
            )
          : '';
      }
    }

    const transcriptBlock = want('transcript')
      ? wrapReplayUntrustedTranscriptBlock(String(params.pack.transcriptBlock ?? '').trim())
      : '';
    const memoryBlock = want('memory')
      ? wrapReplayUntrustedMemoryBlock(String(params.pack.memoryBlock ?? '').trim())
      : '';

    const truncation: MainRoomReplayFactLayerTruncation = {
      profile: profileTruncated,
      roomRoster: roomRosterTruncated,
      orgSnapshot: orgTruncated,
      cortexCore: cortexCoreTruncated,
      companyMemoryFacts: companyMemoryFactsTruncated,
    };

    const sections = [
      profileBlock,
      speakerBlock,
      roomMemberBlock,
      factsBlock,
      orgBlock,
      cortexBlock,
      companyMemoryBlock,
      transcriptBlock,
      memoryBlock,
    ]
      .map((s) => String(s).trim())
      .filter(Boolean);

    if (Object.values(truncation).some(Boolean)) {
      const labels: string[] = [];
      if (truncation.profile) labels.push('档案');
      if (truncation.roomRoster) labels.push('房内目录');
      if (truncation.orgSnapshot) labels.push('组织部门');
      if (truncation.cortexCore) labels.push('Cortex核心');
      if (truncation.companyMemoryFacts) labels.push('公司Memory事实');
      sections.push(`【容量边界】${labels.join('、')}已截断；未展示勿编造。`);
    }

    return {
      serialized: sections.join('\n\n'),
      diagnostics: {
        syncedCompanyProfileChars: profileRaw.length,
        speakerChars: speakerBlock.length,
        roomRosterChars: roomMemberBlock.length,
        factsChars: factsBlock.length,
        orgSnapshotChars: orgRaw.length,
        cortexCoreChars: cortexBlock.length,
        companyMemoryFactsChars: companyMemoryBlock.length,
        transcriptChars: transcriptBlock.length,
        memoryChars: memoryBlock.length,
        truncation,
        factLayerMode: mode,
        prefetchBlocks: plan.prefetchBlocks,
      },
    };
  }

  private buildCompactRoomRosterSummary(directory: RoomMemberDirectoryEntry[]): string {
    if (!Array.isArray(directory) || directory.length === 0) {
      return '【房内成员 — 摘要】当前房间暂无活跃成员登记。';
    }
    const slice = directory.slice(0, MIN_BASE.rosterMaxEntries);
    const lines = slice.map((m, idx) => {
      const kind = m.memberType === 'agent' ? 'Agent' : 'Human';
      const name = (m.displayName ?? '').trim() || m.memberId;
      const dept =
        m.memberType === 'agent' && (m.departmentDisplayName ?? '').trim()
          ? ` — dept:${String(m.departmentDisplayName).trim()}`
          : '';
      return `${idx + 1}. [${kind}] ${name}${dept} — id:${m.memberId}`;
    });
    const body = [
      '【房内成员 — 摘要】',
      `共 ${directory.length} 条登记（展示前 ${slice.length} 条）：`,
      ...lines,
    ].join('\n');
    return body.slice(0, MIN_BASE.rosterMaxChars);
  }

  private buildCompactOrgSummary(
    departments: Array<{ name: string; slug: string }>,
  ): string {
    if (!Array.isArray(departments) || departments.length === 0) return '';
    const slice = departments.slice(0, MIN_BASE.orgMaxDepartments);
    const line = slice
      .map((d) => `${String(d.name ?? '').trim() || '未命名'}(${String(d.slug ?? '').trim() || '—'})`)
      .join('、');
    const body = `共 ${departments.length} 个部门（展示前 ${slice.length} 个）：${line}`;
    return body.slice(0, MIN_BASE.orgLineMaxChars);
  }
}
