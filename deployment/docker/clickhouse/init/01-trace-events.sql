CREATE DATABASE IF NOT EXISTS foundry_obs;

CREATE TABLE IF NOT EXISTS foundry_obs.trace_events
(
    event_time DateTime64(3) DEFAULT now64(3),
    company_id String,
    run_id String,
    task_id Nullable(String),
    agent_id Nullable(String),
    request_id String DEFAULT '',
    trace_id String DEFAULT '',
    span_id String DEFAULT '',
    parent_span_id String DEFAULT '',
    event_type String DEFAULT 'execution_log',
    source_service String DEFAULT 'api',
    payload_json String
)
ENGINE = MergeTree
ORDER BY (company_id, run_id, event_time);
