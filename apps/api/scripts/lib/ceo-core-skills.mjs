/**
 * Single source of truth for CEO marketplace core skill **names** (kebab-case).
 * Keep in sync with: seed-ceo-skills.mjs (CEO_SKILLS[].name), seed-ceo-agent recommended_skills,
 * update-ceo-layer-config.mjs ceo_layer_config.skillIds.
 */
export const CEO_CORE_SKILL_NAMES = [
  'ceo-strategic-breakdown',
  'ceo-heartbeat-orchestrator',
  'ceo-task-assigner',
  'ceo-budget-guardian',
  'ceo-approval-initiator',
  'ceo-memory-strategist',
  'ceo-cross-department-coordinator',
  'ceo-performance-analyzer',
  'ceo-risk-assessor',
  'ceo-model-router-optimizer',
];

/** 主群 replay 层：Agent 间点名接话（绑定 message_send_to_agent）。 */
export const CEO_PEER_SUMMON_SKILL_NAMES = ['collab-room-peer-summon'];

/** Platform skills for chat-managed scheduled playbooks (companions must be bound for prompt_completion). */
export const CEO_SCHEDULE_PLAYBOOK_SKILL_NAMES = [
  'schedule-playbook-manager',
  'scheduled_playbooks_list',
  'scheduled_playbooks_create',
  'scheduled_playbooks_update',
  'scheduled_playbooks_delete',
];

export const CEO_RECOMMENDED_SKILL_NAMES = [
  ...CEO_CORE_SKILL_NAMES,
  ...CEO_PEER_SUMMON_SKILL_NAMES,
  ...CEO_SCHEDULE_PLAYBOOK_SKILL_NAMES,
];
