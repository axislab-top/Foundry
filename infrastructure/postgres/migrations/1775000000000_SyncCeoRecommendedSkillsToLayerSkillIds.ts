import type { MigrationInterface, QueryRunner } from 'typeorm';

const CEO_LAYERS = ['classifier', 'light', 'heavy'] as const;

/**
 * 将 `marketplace_agents.recommended_skills`（Skill **name**）安全解析为平台全局 UUID，
 * 并对 **skillIds 为空** 的 CEO 三层写入同一列表（与 SkillRuntimeResolver 自动合并策略一致）。
 * 若任一 recommended name 在 `skills`（company_id IS NULL）中不存在，则跳过该商品行，避免写坏数据。
 */
export class SyncCeoRecommendedSkillsToLayerSkillIds1775000000000 implements MigrationInterface {
  name = 'SyncCeoRecommendedSkillsToLayerSkillIds1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const agents: Array<{ id: string; recommended_skills: unknown; ceo_layer_config: unknown }> =
      await queryRunner.query(
        `SELECT id, recommended_skills, ceo_layer_config FROM marketplace_agents WHERE slug = 'ceo'`,
      );

    for (const agent of agents) {
      const rawNames = agent.recommended_skills;
      const names: string[] = Array.isArray(rawNames)
        ? rawNames.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
      const deduped = [...new Set(names)];
      if (!deduped.length) continue;

      const placeholders = deduped.map((_, i) => `$${i + 1}`).join(', ');
      const found = (await queryRunner.query(
        `SELECT id::text AS id, name FROM skills WHERE company_id IS NULL AND name IN (${placeholders})`,
        deduped,
      )) as Array<{ id: string; name: string }>;

      const byName = new Map(found.map((r) => [r.name, r.id]));
      if (deduped.some((n) => !byName.has(n))) {
        continue;
      }
      const skillIds = deduped.map((n) => byName.get(n)!);

      const rawCfg = agent.ceo_layer_config;
      const cfg =
        rawCfg && typeof rawCfg === 'object' && !Array.isArray(rawCfg)
          ? { ...(rawCfg as Record<string, unknown>) }
          : {};

      let changed = false;
      for (const layer of CEO_LAYERS) {
        const layerCfg = cfg[layer];
        const prev =
          layerCfg && typeof layerCfg === 'object' && !Array.isArray(layerCfg)
            ? { ...(layerCfg as Record<string, unknown>) }
            : {};
        const existing = Array.isArray(prev.skillIds)
          ? (prev.skillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
          : [];
        if (existing.length > 0) {
          continue;
        }
        cfg[layer] = { ...prev, skillIds: [...skillIds] };
        changed = true;
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
    // 不可逆：无法区分哪些 skillIds 为本迁移写入
  }
}
