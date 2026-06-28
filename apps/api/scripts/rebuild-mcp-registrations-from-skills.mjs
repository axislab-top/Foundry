/**
 * Rebuild MCP runtime bindings from Skill snapshots (Phase F4 finalization).
 *
 * This script no longer touches `mcp_tool_registrations` (table removed).
 * It replays Skill-based MCP extraction for each agent/layer through:
 *   AgentSkillService.registerMcpToolsFromSkills(...)
 * so ToolRegistry cache + runtime events are fully aligned.
 */

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AgentSkillService } from '../dist/modules/agents/services/agent-skill.service.js';

const CEO_LAYERS = ['classifier', 'light', 'heavy'];

function asBool(v, fallback = true) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return fallback;
}

function normalizeSkillIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? '').trim()).filter(Boolean);
}

async function main() {
  const dryRun = asBool(process.env.DRY_RUN, true);
  const batchSize = Math.max(1, Math.min(1000, Number.parseInt(process.env.BATCH_SIZE ?? '50', 10) || 50));
  const companyIdFilter = String(process.env.COMPANY_ID ?? '').trim() || null;

  let app;
  try {
    const { AppModule } = await import('../dist/app.module.js');
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error', 'log'] });
  } catch (e) {
    throw new Error(
      `Failed to bootstrap Nest application context. Build API first: pnpm --filter @service/api build\n` +
      `Original error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const dataSource = app.get(DataSource);
  const agentSkillService = app.get(AgentSkillService);

  let processedAgents = 0;
  let processedLayers = 0;
  const errors = [];

  try {
    let offset = 0;
    for (;;) {
      const rows = await dataSource.query(
        `
        select a.id as "agentId", a.company_id as "companyId", a.role as "role"
        from agents a
        where ($1::uuid is null or a.company_id = $1::uuid)
        order by a.company_id asc, a.id asc
        limit $2 offset $3
        `,
        [companyIdFilter, batchSize, offset],
      );
      if (!rows?.length) break;

      for (const row of rows) {
        const companyId = String(row.companyId ?? '').trim();
        const agentId = String(row.agentId ?? '').trim();
        const role = String(row.role ?? '').trim().toLowerCase();
        if (!companyId || !agentId) continue;

        try {
          const boundRows = await dataSource.query(
            `
            select skill_id as "skillId"
            from agent_skills
            where company_id = $1 and agent_id = $2
            `,
            [companyId, agentId],
          );
          const nullLayerSkillIds = normalizeSkillIds((boundRows ?? []).map((r) => r.skillId));

          if (!dryRun) {
            await agentSkillService.registerMcpToolsFromSkills(companyId, agentId, nullLayerSkillIds, null);
          }
          processedLayers += 1; // null layer

          if (role === 'ceo') {
            const cfgRows = await dataSource.query(
              `
              select ceo_layer_config as "cfg"
              from company_ceo_layer_configs
              where company_id = $1
              limit 1
              `,
              [companyId],
            );
            const cfg = (cfgRows?.[0]?.cfg ?? {}) || {};
            for (const layer of CEO_LAYERS) {
              const layerSkillIds = normalizeSkillIds(cfg?.[layer]?.skillIds);
              if (!dryRun) {
                await agentSkillService.registerMcpToolsFromSkills(
                  companyId,
                  agentId,
                  layerSkillIds,
                  layer,
                );
              }
              processedLayers += 1;
            }
          }

          processedAgents += 1;
        } catch (e) {
          errors.push({
            companyId,
            agentId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      offset += rows.length;
      if (rows.length < batchSize) break;
    }

    console.log(
      JSON.stringify(
        {
          ok: errors.length === 0,
          dryRun,
          companyIdFilter,
          batchSize,
          processedAgents,
          processedLayers, // null layer + CEO classifier/light/heavy
          errorCount: errors.length,
          errors: errors.slice(0, 20),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

