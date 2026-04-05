import { Injectable, Logger } from '@nestjs/common';
import type { TaskRunFailedEvent } from '@contracts/events';
import { RunbookId, renderRunbookSnippet } from '@foundry/observability-core';
import { ConfigService } from '../../common/config/config.service.js';

@Injectable()
export class AlertWebhookService {
  private readonly logger = new Logger(AlertWebhookService.name);

  constructor(private readonly config: ConfigService) {}

  async notifyTaskRunFailed(evt: TaskRunFailedEvent): Promise<void> {
    const urls = this.config.getAlertWebhookUrls();
    if (!urls.length) {
      return;
    }
    const base = this.config.getAdminPublicBaseUrl();
    const companyId = evt.data.companyId;
    const runId = evt.data.runId;
    const deepLink = base
      ? `${base.replace(/\/$/, '')}/companies/${encodeURIComponent(companyId)}?tab=board&runId=${encodeURIComponent(runId)}`
      : '';
    const body = {
      severity: 'P1',
      title: 'Task run failed',
      runId,
      companyId,
      taskId: null as string | null,
      errorSummary: evt.data.errorSummary,
      deepLink,
      runbookId: RunbookId.TaskRunFailed,
      runbookMarkdownSnippet: renderRunbookSnippet({
        runbookId: RunbookId.TaskRunFailed,
        placeholders: { runId },
      }),
    };
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          this.logger.warn(`alert webhook non-OK ${res.status} ${url}`);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn(`alert webhook failed ${url}: ${message}`);
      }
    }
  }
}
