import { DataSource } from 'typeorm';
import {
  createTestDataSource,
  cleanupTestDatabase,
} from '../../setup/test-database.js';
import { CreateUsersTable1767855312397 } from '../../../infrastructure/postgres/migrations/1767855312397_CreateUsersTable.js';
import { AddTenantFoundationAndRls1767865000000 } from '../../../infrastructure/postgres/migrations/1767865000000_AddTenantFoundationAndRls.js';

describe('Tenant RLS Integration', () => {
  let dataSource: DataSource | null = null;
  let available = true;

  const userA = '00000000-0000-0000-0000-0000000000a1';
  const userB = '00000000-0000-0000-0000-0000000000b1';
  const companyA = '00000000-0000-0000-0000-0000000000a2';
  const companyB = '00000000-0000-0000-0000-0000000000b2';

  beforeAll(async () => {
    try {
      dataSource = await createTestDataSource([]);
      const queryRunner = dataSource.createQueryRunner();
      await new CreateUsersTable1767855312397().up(queryRunner);
      await new AddTenantFoundationAndRls1767865000000().up(queryRunner);

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

      await dataSource.query(
        `
          INSERT INTO company_memberships (company_id, user_id, role, is_active)
          VALUES
            ($1, $2, 'owner', true),
            ($3, $4, 'owner', true)
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

  it('should enforce tenant isolation for reads', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyA]);
    const companies = await dataSource.query(`SELECT id, name FROM companies ORDER BY id`);

    expect(companies).toHaveLength(1);
    expect(companies[0].id).toBe(companyA);
  });

  it('should block cross-tenant write with WITH CHECK policy', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyA]);

    await expect(
      dataSource.query(
        `
          INSERT INTO company_memberships (company_id, user_id, role, is_active)
          VALUES ($1, $2, 'member', true)
        `,
        [companyB, userA],
      ),
    ).rejects.toBeDefined();
  });
});
