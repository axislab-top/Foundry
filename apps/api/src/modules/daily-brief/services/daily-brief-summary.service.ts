import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DailyBriefSummarySource } from '@contracts/types';
import {
  CompanyDailyBriefSnapshot,
  type DailyBriefSnapshotSource,
} from '../entities/company-daily-brief-snapshot.entity.js';
import type { DailyBriefKeyMetrics } from './daily-brief-metrics.service.js';
import { getCompanyLocalDateString } from '../utils/daily-brief-time.util.js';

const SUMMARY_MAX_LEN = 800;

export type YesterdaySummaryResult = {
  text: string;
  source: DailyBriefSummarySource;
  briefDate: string;
  generatedAt: string | null;
};

@Injectable()
export class DailyBriefSummaryService {
  constructor(
    @InjectRepository(CompanyDailyBriefSnapshot)
    private readonly snapshotsRepo: Repository<CompanyDailyBriefSnapshot>,
  ) {}

  async resolveYesterdaySummary(
    companyId: string,
    timezone: string,
    metrics: DailyBriefKeyMetrics,
  ): Promise<YesterdaySummaryResult> {
    const yesterdayDate = getCompanyLocalDateString(timezone, -1);
    const snapshot = await this.snapshotsRepo.findOne({
      where: { companyId, briefDate: yesterdayDate },
    });

    if (snapshot?.summaryText?.trim()) {
      return {
        text: sanitizeSummaryText(snapshot.summaryText),
        source: 'heartbeat',
        briefDate: yesterdayDate,
        generatedAt: snapshot.updatedAt?.toISOString() ?? null,
      };
    }

    const templateText = buildTemplateSummary(metrics);
    if (templateText) {
      return {
        text: templateText,
        source: 'template',
        briefDate: yesterdayDate,
        generatedAt: null,
      };
    }

    return {
      text: '昨日暂无团队运行记录。今日可以从处理待办事项或下达新任务开始。',
      source: 'empty',
      briefDate: yesterdayDate,
      generatedAt: null,
    };
  }

  async upsertHeartbeatSnapshot(params: {
    companyId: string;
    briefDate: string;
    summaryText: string;
    heartbeatRunId?: string | null;
    metrics?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const text = sanitizeSummaryText(params.summaryText);
    if (!text) return;

    const source: DailyBriefSnapshotSource = 'heartbeat';
    await this.snapshotsRepo
      .createQueryBuilder()
      .insert()
      .into(CompanyDailyBriefSnapshot)
      .values({
        companyId: params.companyId,
        briefDate: params.briefDate,
        source,
        summaryText: text,
        heartbeatRunId: params.heartbeatRunId ?? null,
        metrics: params.metrics ?? null,
        metadata: params.metadata ?? null,
      })
      .orUpdate(
        ['source', 'summary_text', 'heartbeat_run_id', 'metrics', 'metadata', 'updated_at'],
        ['company_id', 'brief_date'],
      )
      .execute();
  }
}

function sanitizeSummaryText(raw: string): string {
  const trimmed = raw.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return '';
  if (trimmed.length <= SUMMARY_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, SUMMARY_MAX_LEN - 1)}…`;
}

function buildTemplateSummary(metrics: DailyBriefKeyMetrics): string | null {
  const { tasksExecutedYesterday, successRatePercent, approvalsHandledYesterday, failedRunsYesterday } =
    metrics;
  const hasActivity =
    tasksExecutedYesterday > 0 ||
    approvalsHandledYesterday > 0 ||
    failedRunsYesterday > 0;
  if (!hasActivity) return null;

  const parts: string[] = [];
  parts.push(
    `昨日团队共完成 ${tasksExecutedYesterday} 项任务运行` +
      (successRatePercent != null ? `，成功率 ${successRatePercent}%` : '') +
      `，处理 ${approvalsHandledYesterday} 笔审批。`,
  );
  if (failedRunsYesterday > 0) {
    parts.push(`有 ${failedRunsYesterday} 次运行失败，建议今日优先排查相关任务。`);
  } else {
    parts.push('整体运行平稳，无重大异常。');
  }
  return parts.join('');
}
