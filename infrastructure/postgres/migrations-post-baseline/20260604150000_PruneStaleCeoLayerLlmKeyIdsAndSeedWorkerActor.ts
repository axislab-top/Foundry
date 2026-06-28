import type { MigrationInterface, QueryRunner } from 'typeorm';

const WORKER_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000001';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function filterKeyIds(raw: unknown, valid: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? '').trim())
    .filter((id) => UUID_RE.test(id) && valid.has(id));
}

function applyKeyFields(layer: Record<string, unknown>, valid: ReadonlySet<string>): Record<string, unknown> {
  const out = { ...layer };
  const filtered = filterKeyIds(out.keyIds, valid);
  const legacyKid = typeof out.llmKeyId === 'string' ? out.llmKeyId.trim() : '';
  const merged = [...filtered];
  if (legacyKid && UUID_RE.test(legacyKid) && valid.has(legacyKid) && !merged.includes(legacyKid)) {
    merged.unshift(legacyKid);
  }
  if (merged.length > 0) {
    out.keyIds = merged;
    out.llmKeyId = merged[0];
    return out;
  }
  delete out.keyIds;
  delete out.llmKeyId;
  if (out.keySource === 'dedicated') delete out.keySource;
  return out;
}

function sanitizeContextPolicySubLayer(
  layer: unknown,
  valid: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  const base = asRecord(layer);
  if (!base) return undefined;
  const out = applyKeyFields(base, valid);
  const gs = asRecord(out.globalSettings);
  if (gs && Object.prototype.hasOwnProperty.call(gs, 'modelKeyId')) {
    const nextGs = { ...gs };
    const mk = typeof nextGs.modelKeyId === 'string' ? nextGs.modelKeyId.trim() : '';
    if (mk && valid.has(mk)) nextGs.modelKeyId = mk;
    else delete nextGs.modelKeyId;
    out.globalSettings = nextGs;
  }
  return out;
}

function sanitizeCeoLayerConfig(raw: unknown, valid: ReadonlySet<string>): Record<string, unknown> {
  const input = asRecord(raw) ?? {};
  const out: Record<string, unknown> = { ...input };
  for (const layerName of ['strategy', 'orchestration', 'supervision'] as const) {
    const layer = asRecord(out[layerName]);
    if (layer) out[layerName] = applyKeyFields(layer, valid);
  }
  const strat = asRecord(out.strategy);
  if (strat) {
    const cp = asRecord(strat.contextPolicy);
    if (cp) {
      const nextCp = { ...cp };
      for (const sub of ['intentLayer', 'replay'] as const) {
        const sanitized = sanitizeContextPolicySubLayer(nextCp[sub], valid);
        if (sanitized) nextCp[sub] = sanitized;
      }
      out.strategy = { ...strat, contextPolicy: nextCp };
    }
  }
  return out;
}

/**
 * 1) 确保 Worker 系统 actor 存在于 users（skill_audit_logs FK / RPC actor）。
 * 2) 剔除 CEO 层 JSON 中指向已删除 LLM Key 的孤儿 keyIds（与 Admin 测试路径对齐）。
 */
export class PruneStaleCeoLayerLlmKeyIdsAndSeedWorkerActor20260604150000 implements MigrationInterface {
  name = 'PruneStaleCeoLayerLlmKeyIdsAndSeedWorkerActor20260604150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO users (id, username, email, "passwordHash", enabled)
      VALUES ($1, 'foundry-worker', 'worker@system.internal', 'DISABLED_SYSTEM_ACCOUNT', false)
      ON CONFLICT (id) DO NOTHING
      `,
      [WORKER_ACTOR_USER_ID],
    );

    const validRows = (await queryRunner.query(
      `
      SELECT id::text AS id
      FROM llm_keys
      WHERE is_active = true
        AND lower(model_name) NOT LIKE '%embedding%'
        AND lower(model_name) NOT LIKE '%text-embedding%'
        AND lower(model_name) NOT LIKE '%bge-%'
      `,
    )) as Array<{ id: string }>;
    const valid = new Set(validRows.map((r) => r.id));

    const companyRows = (await queryRunner.query(
      `SELECT company_id::text AS company_id, ceo_layer_config FROM company_ceo_layer_configs`,
    )) as Array<{ company_id: string; ceo_layer_config: unknown }>;

    for (const row of companyRows) {
      const before = row.ceo_layer_config;
      const after = sanitizeCeoLayerConfig(before, valid);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await queryRunner.query(
          `UPDATE company_ceo_layer_configs SET ceo_layer_config = $1::jsonb WHERE company_id = $2::uuid`,
          [JSON.stringify(after), row.company_id],
        );
      }
    }

    const marketplaceRows = (await queryRunner.query(
      `SELECT id::text AS id, ceo_layer_config FROM marketplace_agents WHERE ceo_layer_config IS NOT NULL`,
    )) as Array<{ id: string; ceo_layer_config: unknown }>;

    for (const row of marketplaceRows) {
      const before = row.ceo_layer_config;
      const after = sanitizeCeoLayerConfig(before, valid);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await queryRunner.query(`UPDATE marketplace_agents SET ceo_layer_config = $1::jsonb WHERE id = $2::uuid`, [
          JSON.stringify(after),
          row.id,
        ]);
      }
    }

    await queryRunner.query(
      `
      UPDATE billing_settings
      SET ceo_decision_llm_key_id = NULL
      WHERE ceo_decision_llm_key_id IS NOT NULL
        AND ceo_decision_llm_key_id NOT IN (SELECT id FROM llm_keys WHERE is_active = true)
      `,
    );
  }

  public async down(): Promise<void> {
    // 不可逆：已剔除的孤儿 keyId 与 worker 用户 seed 不做回滚
  }
}
