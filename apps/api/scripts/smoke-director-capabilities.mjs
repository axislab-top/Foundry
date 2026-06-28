/**
 * Smoke test: director management + domain skills readiness and optional HTTP tool probe.
 *
 * Usage:
 *   pnpm -C apps/api run smoke:director-capabilities
 */
import pg from 'pg';
import { loadEnvFromFile, resolveDatabaseUrl } from './lib/seed-helpers.mjs';

loadEnvFromFile();

const MANAGEMENT_SKILLS = [
  'director-task-delegator',
  'director-progress-reporter',
  'director-subordinate-reviewer',
  'director-team-performance-coach',
  'department.knowledge.query',
];

const SAMPLE_DOMAIN_SKILLS = [
  'research-market-intelligence-synthesizer',
  'research-fundamental-analyst',
  'director-task-delegator',
];

async function probeHttpToolRoute(baseUrl, token, path, body) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return {
      ok: res.status !== 0,
      status: res.status,
      latencyMs: Date.now() - started,
      body: json,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  const issues = [];
  const checks = [];

  try {
    // 1) Skills exist + enabled
    const skillsRes = await client.query(
      `select name, is_enabled, is_public, prompt_template, metadata->>'protocol' as protocol
       from skills where company_id is null and name = any($1::text[])`,
      [[...MANAGEMENT_SKILLS, ...SAMPLE_DOMAIN_SKILLS]],
    );
    for (const name of [...MANAGEMENT_SKILLS, ...SAMPLE_DOMAIN_SKILLS]) {
      const row = skillsRes.rows.find((r) => r.name === name);
      if (!row) {
        issues.push({ check: 'skill_exists', name, code: 'MISSING' });
        checks.push({ name, skillExists: false });
        continue;
      }
      if (!row.is_enabled) issues.push({ check: 'skill_enabled', name, code: 'DISABLED' });
      if (!row.prompt_template && !name.includes('department.knowledge')) {
        issues.push({ check: 'prompt_template', name, code: 'EMPTY' });
      }
      checks.push({
        name,
        skillExists: true,
        isEnabled: row.is_enabled,
        protocol: row.protocol,
        promptLen: (row.prompt_template ?? '').length,
      });
    }

    // 2) Tool bindings + tool records healthy
    const bindRes = await client.query(
      `
      select s.name as skill_name, t.name as tool_name, t.is_enabled as tool_enabled,
             t.handler_config->>'kind' as tool_kind,
             t.handler_config->>'url' as tool_url
      from skill_tool_bindings stb
      join skills s on s.id = stb.skill_id
      join tools t on t.id = stb.tool_id
      where s.company_id is null and s.name = any($1::text[])
      order by s.name, stb.position
      `,
      [MANAGEMENT_SKILLS],
    );

    const toolsBySkill = new Map();
    for (const row of bindRes.rows) {
      const list = toolsBySkill.get(row.skill_name) ?? [];
      list.push(row);
      toolsBySkill.set(row.skill_name, list);
    }

    for (const skill of MANAGEMENT_SKILLS) {
      const bound = toolsBySkill.get(skill) ?? [];
      if (bound.length === 0) {
        issues.push({ check: 'tool_bindings', skill, code: 'NO_BINDINGS' });
        continue;
      }
      for (const t of bound) {
        if (!t.tool_enabled) issues.push({ check: 'tool_enabled', skill, tool: t.tool_name });
        const kind = t.tool_kind ?? 'builtin';
        if (kind !== 'http' && kind !== 'builtin') {
          issues.push({ check: 'tool_kind', skill, tool: t.tool_name, kind: t.tool_kind });
        }
        if (kind === 'http' && !t.tool_url) issues.push({ check: 'tool_url', skill, tool: t.tool_name });
      }
      checks.push({
        skill,
        boundTools: bound.map((t) => ({
          name: t.tool_name,
          enabled: t.tool_enabled,
          kind: t.tool_kind,
          urlHost: t.tool_url ? new URL(t.tool_url).host : null,
        })),
      });
    }

    // 3) Runtime snapshot simulation (Worker-visible tool.* names)
    const snapshotRes = await client.query(
      `
      select s.name,
             coalesce(json_agg('tool.' || t.name order by stb.position) filter (where t.id is not null), '[]') as openai_tools
      from skills s
      left join skill_tool_bindings stb on stb.skill_id = s.id
      left join tools t on t.id = stb.tool_id and t.is_enabled = true
      where s.company_id is null and s.name = any($1::text[])
      group by s.name
      order by s.name
      `,
      [MANAGEMENT_SKILLS],
    );
    checks.push({ runtimeSnapshots: snapshotRes.rows });

    // 4) Marketplace + platform department for research intelligence
    const deptRes = await client.query(
      `
      select pd.slug, pd.display_name, ma.slug as director_slug, ma.is_published,
             jsonb_array_length(ma.recommended_skills) as skill_count
      from platform_departments pd
      left join marketplace_agents ma on ma.id = pd.director_marketplace_agent_id
      where pd.slug = 'research-intelligence'
      `,
    );
    checks.push({ platformDepartment: deptRes.rows[0] ?? null });
    if (!deptRes.rows[0]?.director_slug) {
      issues.push({ check: 'platform_department', code: 'NO_DIRECTOR_BOUND' });
    }

    // 5) Optional HTTP probe (API must be running)
    const baseUrl = String(process.env.TOOL_INTERNAL_BASE_URL ?? '').trim();
    const token = String(process.env.API_INTERNAL_AUTH_SECRET ?? '').trim();
    const httpProbes = [];

    if (baseUrl && token) {
      // Invalid body → expect 400/422 (proves route + auth alive, not 401/connection error)
      const listProbe = await probeHttpToolRoute(baseUrl, token, '/internal/tools/tasks/list-by-department', {
        companyId: '00000000-0000-4000-8000-000000000001',
        departmentNodeId: '00000000-0000-4000-8000-000000000002',
      });
      httpProbes.push({ name: 'task_list_by_department', ...listProbe });
      if (listProbe.status === 401) {
        issues.push({ check: 'http_auth', route: 'list-by-department', code: 'UNAUTHORIZED' });
      } else if (listProbe.status === 0) {
        issues.push({ check: 'http_reachable', route: 'list-by-department', code: 'UNREACHABLE', error: listProbe.error });
      }

      const orgProbe = await probeHttpToolRoute(baseUrl, token, '/internal/tools/organization/node-agents', {
        nodeId: '00000000-0000-4000-8000-000000000002',
      });
      httpProbes.push({ name: 'organization_node_agents', ...orgProbe });
      if (orgProbe.status === 401) {
        issues.push({ check: 'http_auth', route: 'node-agents', code: 'UNAUTHORIZED' });
      } else if (orgProbe.status === 0) {
        issues.push({ check: 'http_reachable', route: 'node-agents', code: 'UNREACHABLE', error: orgProbe.error });
      }

      // Find tenant with research-intelligence org node for live probe
      const liveCtx = await client.query(
        `
        select c.id as company_id, on2.id as department_node_id
        from organization_nodes on2
        join companies c on c.id = on2.company_id
        where on2.type = 'department'
          and on2.metadata->>'platformDepartmentSlug' = 'research-intelligence'
        limit 1
        `,
      );
      if (liveCtx.rowCount > 0) {
        const { company_id, department_node_id } = liveCtx.rows[0];
        const liveList = await probeHttpToolRoute(baseUrl, token, '/internal/tools/tasks/list-by-department', {
          companyId: company_id,
          departmentNodeId: department_node_id,
          page: 1,
          pageSize: 5,
        });
        httpProbes.push({ name: 'live_task_list_by_department', companyId: company_id, departmentNodeId: department_node_id, ...liveList });
        const liveOrg = await probeHttpToolRoute(baseUrl, token, '/internal/tools/organization/node-agents', {
          nodeId: department_node_id,
        });
        httpProbes.push({ name: 'live_organization_node_agents', nodeId: department_node_id, ...liveOrg });

        for (const p of [liveList, liveOrg]) {
          if (p.status >= 200 && p.status < 300) {
            checks.push({ liveProbeSuccess: p.name, status: p.status });
          } else if (p.status >= 400 && p.status !== 404) {
            issues.push({ check: 'live_http', probe: p.name, status: p.status, body: p.body });
          }
        }
      } else {
        checks.push({ liveProbeSkipped: 'no tenant org node for research-intelligence yet' });
      }
    } else {
      checks.push({ httpProbeSkipped: 'TOOL_INTERNAL_BASE_URL or API_INTERNAL_AUTH_SECRET not set' });
    }

    const dbOk = issues.filter((i) => !String(i.check ?? '').startsWith('http')).length === 0;
    const httpOk = issues.filter((i) => String(i.check ?? '').startsWith('http')).length === 0;
    const httpSkipped = httpProbes.length === 0 && !baseUrl;

    console.log(
      JSON.stringify(
        {
          ok: dbOk && (httpOk || httpSkipped),
          dbReady: dbOk,
          httpReady: httpProbes.length ? httpOk : null,
          issueCount: issues.length,
          issues,
          checks,
          httpProbes,
          hint: httpProbes.some((p) => p.status === 0)
            ? 'Start API (port 3000) then re-run for full HTTP tool smoke.'
            : undefined,
        },
        null,
        2,
      ),
    );

    if (!dbOk || (httpProbes.length > 0 && !httpOk)) process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
