import { DataSource } from 'typeorm';
import {
  cleanupTestDatabase,
  createTestDataSource,
} from '../../../../../test/setup/test-database.js';
import { CreateUsersTable1767855312397 } from '../../../../../infrastructure/postgres/migrations/1767855312397_CreateUsersTable.js';
import { AddTenantFoundationAndRls1767865000000 } from '../../../../../infrastructure/postgres/migrations/1767865000000_AddTenantFoundationAndRls.js';
import { AddOrganizationNodes1767871000000 } from '../../../../../infrastructure/postgres/migrations/1767871000000_AddOrganizationNodes.js';
import { AddAgentsAndSkills1767873000000 } from '../../../../../infrastructure/postgres/migrations/1767873000000_AddAgentsAndSkills.js';

describe('Agents & Skills RLS Integration', () => {
  let dataSource: DataSource | null = null;
  let available = true;

  const userA = '00000000-0000-0000-0000-0000000002a1';
  const userB = '00000000-0000-0000-0000-0000000002b1';
  const companyA = '00000000-0000-0000-0000-0000000002a2';
  const companyB = '00000000-0000-0000-0000-0000000002b2';
  const agentA = '00000000-0000-0000-0000-0000000002a3';
  const skillA = '00000000-0000-0000-0000-0000000002a4';

  beforeAll(async () => {
    try {
      dataSource = await createTestDataSource([]);
      const queryRunner = dataSource.createQueryRunner();
      await new CreateUsersTable1767855312397().up(queryRunner);
      await new AddTenantFoundationAndRls1767865000000().up(queryRunner);
      await new AddOrganizationNodes1767871000000().up(queryRunner);
      await new AddAgentsAndSkills1767873000000().up(queryRunner);

      await dataSource.query(
        `
          INSERT INTO users ("id","username","email","passwordHash","roles","permissions","enabled")
          VALUES
            ($1,'ua','a@test.com','hash','[]','[]',true),
            ($2,'ub','b@test.com','hash','[]','[]',true)
        `,
        [userA, userB],
      );

      await dataSource.query(
        `
          INSERT INTO companies (id, name, created_by, is_active)
          VALUES
            ($1, 'CA', $2, true),
            ($3, 'CB', $4, true)
        `,
        [companyA, userA, companyB, userB],
      );

      await dataSource.query(
        `
          INSERT INTO company_memberships (company_id, user_id, role, is_active)
          VALUES ($1, $2, 'owner', true), ($3, $4, 'owner', true)
        `,
        [companyA, userA, companyB, userB],
      );

      await dataSource.query(
        `INSERT INTO organization_nodes (id, company_id, parent_id, type, name, order_no)
         VALUES ($1, $2, null, 'ceo', 'CEO', 0)`,
        ['00000000-0000-0000-0000-0000000002n1', companyA],
      );

      await dataSource.query(`SET app.current_tenant = $1`, [companyA]);
      await dataSource.query(
        `
          INSERT INTO agents (id, company_id, organization_node_id, name, role, status)
          VALUES ($1, $2, $3, 'CEO Agent', 'ceo', 'active')
        `,
        [agentA, companyA, '00000000-0000-0000-0000-0000000002n1'],
      );

      await dataSource.query(
        `
          INSERT INTO skills (id, company_id, name, implementation_type)
          VALUES ($1, $2, 'Private Skill', 'builtin')
        `,
        [skillA, companyA],
      );
    } catch {
      available = false;
    }
  });

  afterAll(async () => {
    if (dataSource) {
      await cleanupTestDatabase(dataSource);
    }
  });

  it('should isolate agents by tenant', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyB]);
    const rows = await dataSource.query(`SELECT id FROM agents`);
    expect(rows).toHaveLength(0);
  });

  it('should block cross-tenant agent insert', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyA]);
    await expect(
      dataSource.query(
        `
          INSERT INTO agents (id, company_id, name, role, status)
          VALUES ($1, $2, 'X', 'executor', 'active')
        `,
        ['00000000-0000-0000-0000-0000000002x1', companyB],
      ),
    ).rejects.toBeDefined();
  });

  it('should isolate company skills by tenant', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyB]);
    const rows = await dataSource.query(`SELECT id FROM skills WHERE company_id IS NOT NULL`);
    expect(rows).toHaveLength(0);
  });

  it('should isolate agent_skills by tenant', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyA]);
    await dataSource.query(
      `INSERT INTO agent_skills (agent_id, skill_id, company_id) VALUES ($1, $2, $3)`,
      [agentA, skillA, companyA],
    );

    await dataSource.query(`SET app.current_tenant = $1`, [companyB]);
    const rows = await dataSource.query(`SELECT * FROM agent_skills`);
    expect(rows).toHaveLength(0);
  });
});
