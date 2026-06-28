import type { MigrationInterface, QueryRunner } from 'typeorm';

const CEO_LAYERS = ['classifier', 'light', 'heavy'] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * CEO 商品 `ceo_layer_config` 中常残留历史 skill UUID（重跑种子 / 换库后 skills.id 已变）。
 * 校验逻辑要求 skillIds 必须指向 `skills.company_id IS NULL` 的现存行；孤儿 ID 会导致管理端无法保存。
 * 本迁移：按层剔除不存在的平台全局 Skill ID，保留仍有效的引用。
 */
export class PruneStaleCeoLayerSkillIds1774900000000 implements MigrationInterface {
  name = 'PruneStaleCeoLayerSkillIds1774900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const agents: Array<{ id: string; ceo_layer_config: unknown }> = await queryRunner.query(
      `SELECT id, ceo_layer_config FROM marketplace_agents WHERE slug = 'ceo'`,
    );

    for (const agent of agents) {
      const raw = agent.ceo_layer_config;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;

      const cfg = { ...(raw as Record<string, unknown>) };
      let changed = false;

      for (const layer of CEO_LAYERS) {
        const layerCfg = cfg[layer];
        if (!layerCfg || typeof layerCfg !== 'object' || Array.isArray(layerCfg)) continue;

        const lc = { ...(layerCfg as Record<string, unknown>) };
        const skillIdsRaw = lc.skillIds;
        if (!Array.isArray(skillIdsRaw)) continue;

        const ids = skillIdsRaw
          .map((x) => String(x ?? '').trim())
          .filter((id) => UUID_RE.test(id));
        if (!ids.length) continue;

        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `SELECT id::text AS id FROM skills WHERE company_id IS NULL AND id IN (${placeholders})`;
        const validRows = (await queryRunner.query(sql, ids)) as Array<{ id: string }>;

        const ok = new Set(validRows.map((r) => r.id));
        const filtered = ids.filter((id) => ok.has(id));
        if (filtered.length !== ids.length) {
          lc.skillIds = filtered;
          cfg[layer] = lc;
          changed = true;
        }
      }

      if (changed) {
        await queryRunner.query(`UPDATE marketplace_agents SET ceo_layer_config = $1::jsonb WHERE id = $2`, [
          JSON.stringify(cfg),
          agent.id,
        ]);
      }
    }
  }

  public async down(): Promise<void> {
    // 不可逆：已剔除的孤儿 skillId 无法从本迁移恢复
  }
}
