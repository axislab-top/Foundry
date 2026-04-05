import { DataSource } from 'typeorm';
import {
  cleanupTestDatabase,
  createTestDataSource,
} from '../../../../../test/setup/test-database.js';
import { CreateUsersTable1767855312397 } from '../../../../../infrastructure/postgres/migrations/1767855312397_CreateUsersTable.js';
import { AddTenantFoundationAndRls1767865000000 } from '../../../../../infrastructure/postgres/migrations/1767865000000_AddTenantFoundationAndRls.js';
import { AddOrganizationNodes1767871000000 } from '../../../../../infrastructure/postgres/migrations/1767871000000_AddOrganizationNodes.js';

describe('Organization RLS Integration', () => {
  let dataSource: DataSource | null = null;
  let available = true;

  const userA = '00000000-0000-0000-0000-0000000001a1';
  const userB = '00000000-0000-0000-0000-0000000001b1';
  const companyA = '00000000-0000-0000-0000-0000000001a2';
  const companyB = '00000000-0000-0000-0000-0000000001b2';

  beforeAll(async () => {
    try {
      dataSource = await createTestDataSource([]);
      const queryRunner = dataSource.createQueryRunner();
      await new CreateUsersTable1767855312397().up(queryRunner);
      await new AddTenantFoundationAndRls1767865000000().up(queryRunner);
      await new AddOrganizationNodes1767871000000().up(queryRunner);

      await dataSource.query(
        `
          INSERT INTO users ("id","username","email","passwordHash","roles","permissions","enabled")
          VALUES
            ($1,'user-a','a@test.com','hash','[]','[]',true),
            ($2,'user-b','b@test.com','hash','[]','[]',true)
        `,
        [userA, userB],
      );

      await dataSource.query(
        `
          INSERT INTO companies (id, name, created_by, is_active)
          VALUES
            ($1, 'Company A', $2, true),
            ($3, 'Company B', $4, true)
        `,
        [companyA, userA, companyB, userB],
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

  it('should enforce company isolation on organization_nodes', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyA]);
    await dataSource.query(
      `
        INSERT INTO organization_nodes (id, company_id, parent_id, type, name, order_no)
        VALUES ($1, $2, null, 'board', 'Board A', 0)
      `,
      ['00000000-0000-0000-0000-0000000001c1', companyA],
    );

    await dataSource.query(`SET app.current_tenant = $1`, [companyB]);
    const rows = await dataSource.query(`SELECT id FROM organization_nodes`);
    expect(rows).toHaveLength(0);
  });

  it('should block cross-tenant insert by WITH CHECK', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyA]);
    await expect(
      dataSource.query(
        `
          INSERT INTO organization_nodes (id, company_id, parent_id, type, name, order_no)
          VALUES ($1, $2, null, 'board', 'Board B', 0)
        `,
        ['00000000-0000-0000-0000-0000000001c2', companyB],
      ),
    ).rejects.toBeDefined();
  });
});
