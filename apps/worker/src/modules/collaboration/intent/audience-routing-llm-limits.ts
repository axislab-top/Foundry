/**
 * Single place for audience-routing LLM context budgets (JSON user turn vs system supplement).
 * Keeps {@link IntentLayerService} caps aligned with digest builders and config knobs.
 */
export const AUDIENCE_ROUTING_USER_JSON_TRANSCRIPT_MAX_CHARS = 2800;
export const AUDIENCE_ROUTING_SYSTEM_MEMORY_SNIPPETS_MAX_CHARS = 4000;

/** Caps for `buildAudienceRoutingMemoryDigest` (pipeline); full-mode total should not exceed system snippet budget. */
export const AUDIENCE_ROUTING_MEMORY_DIGEST_BUILDER_CAP_DIGEST = 2400;
export const AUDIENCE_ROUTING_MEMORY_DIGEST_BUILDER_CAP_FULL = AUDIENCE_ROUTING_SYSTEM_MEMORY_SNIPPETS_MAX_CHARS;
