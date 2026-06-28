/**
 * Backfill existing companies to marketplace-CEO single-pool mode and
 * initialize company ceoDecision metadata from current CEO assignment.
 *
 * Usage:
 *   pnpm --filter @service/api run backfill:ceo-marketplace-isolation
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  const tryPaths = [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
    join(__dirname, '../../.env'),
  ];
  for (const p of tryPaths) {
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) process.env[k] = v;
      }
      break;
    } catch {
      // ignore
    }
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
  const user = process.env.POSTGRES_USER || process.env.DB_USERNAME || 'postgres';
  const pass = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || 'postgres';
  const db = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const hbTable = await client.query(
      `select to_regclass('public.company_heartbeat_configs') as name`,
    );
    const hasCompanyHeartbeatConfigs = Boolean(hbTable.rows[0]?.name);
    const billingTable = await client.query(
      `select to_regclass('public.billing_settings') as name`,
    );
    const hasBillingSettings = Boolean(billingTable.rows[0]?.name);

    const ceoTemplate = await client.query(
      `select id from marketplace_agents where slug = 'ceo' order by is_published desc, updated_at desc limit 1`,
    );
    if (!ceoTemplate.rows[0]?.id) {
      throw new Error('Missing marketplace ceo template (slug=ceo)');
    }
    const ceoTemplateId = ceoTemplate.rows[0].id;

    const bindings = await client.query(
      `select llm_key_id from marketplace_agent_key_bindings where marketplace_agent_id = $1 order by sort_order asc`,
      [ceoTemplateId],
    );
    const templateKeyIds = bindings.rows.map((r) => r.llm_key_id).filter(Boolean);
    if (!templateKeyIds.length) {
      throw new Error('Marketplace ceo template has no key bindings');
    }

    const companies = await client.query(`select id from companies where status in ('active', 'draft')`);
    let assignmentsInserted = 0;
    let agentsUpdated = 0;
    let decisionMetadataUpdated = 0;
    let companiesProcessed = 0;

    for (const row of companies.rows) {
      const companyId = row.id;
      companiesProcessed += 1;

      let assignedKeyId = null;
      const existingAssign = await client.query(
        `select assigned_llm_key_id from company_marketplace_agent_key_assignments where company_id = $1 and marketplace_agent_id = $2 limit 1`,
        [companyId, ceoTemplateId],
      );
      if (existingAssign.rows[0]?.assigned_llm_key_id) {
        assignedKeyId = existingAssign.rows[0].assigned_llm_key_id;
      } else {
        for (const keyId of templateKeyIds) {
          const inserted = await client.query(
            `
            insert into company_marketplace_agent_key_assignments (company_id, marketplace_agent_id, assigned_llm_key_id, created_at, updated_at)
            values ($1, $2, $3, current_timestamp, current_timestamp)
            on conflict (assigned_llm_key_id) do nothing
            returning assigned_llm_key_id
          `,
            [companyId, ceoTemplateId, keyId],
          );
          if (inserted.rows[0]?.assigned_llm_key_id) {
            assignedKeyId = inserted.rows[0].assigned_llm_key_id;
            assignmentsInserted += 1;
            break;
          }
        }
      }

      const ceoAgent = await client.query(
        `select id, llm_key_id, llm_model, metadata from agents where company_id = $1 and role = 'ceo' order by created_at asc limit 1`,
        [companyId],
      );
      if (ceoAgent.rows[0]?.id && assignedKeyId) {
        const keyModel = await client.query(`select model_name from llm_keys where id = $1 limit 1`, [
          assignedKeyId,
        ]);
        const modelName = keyModel.rows[0]?.model_name ?? null;
        const oldMetadata = ceoAgent.rows[0].metadata && typeof ceoAgent.rows[0].metadata === 'object'
          ? ceoAgent.rows[0].metadata
          : {};
        const nextMetadata = {
          ...oldMetadata,
          marketplaceAgentId: ceoTemplateId,
          keyAssignedFrom: 'marketplace_bindings',
        };
        await client.query(
          `
          update agents
          set
            llm_key_id = coalesce(llm_key_id, $2),
            llm_model = coalesce(llm_model, $3),
            metadata = $4::jsonb,
            updated_at = current_timestamp
          where id = $1
        `,
          [ceoAgent.rows[0].id, assignedKeyId, modelName, JSON.stringify(nextMetadata)],
        );
        agentsUpdated += 1;
      }

      if (assignedKeyId) {
        const keyModel = await client.query(`select model_name from llm_keys where id = $1 limit 1`, [
          assignedKeyId,
        ]);
        const modelName = keyModel.rows[0]?.model_name ?? null;
        if (hasCompanyHeartbeatConfigs) {
          await client.query(
            `
            insert into company_heartbeat_configs (company_id, enabled, frequency, last_executed_at, metadata, created_at, updated_at)
            values ($1, true, 'daily', null, jsonb_build_object('ceoDecisionModel', $2, 'ceoDecisionLlmKeyId', $3), current_timestamp, current_timestamp)
            on conflict (company_id) do update
            set
              metadata = coalesce(company_heartbeat_configs.metadata, '{}'::jsonb)
                || jsonb_build_object(
                  'ceoDecisionModel', coalesce(company_heartbeat_configs.metadata->>'ceoDecisionModel', $2),
                  'ceoDecisionLlmKeyId', coalesce(company_heartbeat_configs.metadata->>'ceoDecisionLlmKeyId', $3)
                ),
              updated_at = current_timestamp
          `,
            [companyId, modelName, assignedKeyId],
          );
          decisionMetadataUpdated += 1;
        } else if (hasBillingSettings) {
          await client.query(
            `
            insert into billing_settings (company_id, ceo_decision_model, ceo_decision_llm_key_id, created_at, updated_at)
            values ($1, $2, $3, current_timestamp, current_timestamp)
            on conflict (company_id) do update
            set
              ceo_decision_model = coalesce(billing_settings.ceo_decision_model, $2),
              ceo_decision_llm_key_id = coalesce(billing_settings.ceo_decision_llm_key_id, $3),
              updated_at = current_timestamp
          `,
            [companyId, modelName, assignedKeyId],
          );
          decisionMetadataUpdated += 1;
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          companiesProcessed,
          assignmentsInserted,
          agentsUpdated,
          decisionMetadataUpdated,
          configWriteTarget: hasCompanyHeartbeatConfigs
            ? 'company_heartbeat_configs'
            : hasBillingSettings
              ? 'billing_settings'
              : 'none',
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
