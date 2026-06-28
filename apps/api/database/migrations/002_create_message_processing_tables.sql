-- Create audit table for message processing decisions
CREATE TABLE IF NOT EXISTS message_processing_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  message_id UUID NOT NULL,
  room_id UUID NOT NULL,
  correlation_id VARCHAR(128),
  trace_id VARCHAR(128),
  policy_version VARCHAR(32) NOT NULL,
  action VARCHAR(64) NOT NULL,
  decision VARCHAR(32) NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_processing_decisions_company_message_created
  ON message_processing_decisions(company_id, message_id, created_at DESC);

COMMENT ON TABLE message_processing_decisions IS '消息处理策略决策审计表';
COMMENT ON COLUMN message_processing_decisions.policy_version IS '策略版本';
COMMENT ON COLUMN message_processing_decisions.action IS '动作类型';
COMMENT ON COLUMN message_processing_decisions.decision IS 'allow/deny 决策';
COMMENT ON COLUMN message_processing_decisions.reason_codes IS '命中的原因码';
COMMENT ON COLUMN message_processing_decisions.profile IS '语义画像';
COMMENT ON COLUMN message_processing_decisions.correlation_id IS '跨处理链路关联 ID';
COMMENT ON COLUMN message_processing_decisions.trace_id IS '调用链追踪 ID';

-- Create job table for asynchronous side effects
CREATE TABLE IF NOT EXISTS message_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  message_id UUID NOT NULL,
  room_id UUID NOT NULL,
  domain VARCHAR(32) NOT NULL DEFAULT 'message',
  job_type VARCHAR(64) NOT NULL,
  dedupe_key VARCHAR(256) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  payload JSONB,
  aggregate_type VARCHAR(64),
  aggregate_id UUID,
  parent_job_id UUID,
  correlation_id VARCHAR(128),
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_message_processing_jobs_dedupe UNIQUE (company_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_message_processing_jobs_company_status_next
  ON message_processing_jobs(company_id, status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_message_processing_jobs_company_domain_status_next
  ON message_processing_jobs(company_id, domain, status, next_run_at);

COMMENT ON TABLE message_processing_jobs IS '消息处理异步任务表';
COMMENT ON COLUMN message_processing_jobs.domain IS '任务领域：message/task/report/escalation/memory/routing';
COMMENT ON COLUMN message_processing_jobs.job_type IS '任务类型';
COMMENT ON COLUMN message_processing_jobs.dedupe_key IS '幂等去重键';
COMMENT ON COLUMN message_processing_jobs.status IS 'pending/running/succeeded/failed/skipped';
COMMENT ON COLUMN message_processing_jobs.payload IS '任务载荷';
COMMENT ON COLUMN message_processing_jobs.aggregate_type IS '聚合根类型';
COMMENT ON COLUMN message_processing_jobs.aggregate_id IS '聚合根 ID';
COMMENT ON COLUMN message_processing_jobs.parent_job_id IS '父任务 ID';
COMMENT ON COLUMN message_processing_jobs.correlation_id IS '跨处理链路关联 ID';
COMMENT ON COLUMN message_processing_jobs.attempt_count IS '重试次数';
COMMENT ON COLUMN message_processing_jobs.next_run_at IS '下次可执行时间';
