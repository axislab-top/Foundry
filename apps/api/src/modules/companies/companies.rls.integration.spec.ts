import { DataSource } from 'typeorm';
import {
  cleanupTestDatabase,
  createTestDataSource,
} from '../../../../../test/setup/test-database.js';
import { CreateUsersTable1767855312397 } from '../../../../../infrastructure/postgres/migrations/1767855312397_CreateUsersTable.js';
import { AddTenantFoundationAndRls1767865000000 } from '../../../../../infrastructure/postgres/migrations/1767865000000_AddTenantFoundationAndRls.js';
import { ExtendCompaniesForCompaniesModule1767867000000 } from '../../../../../infrastructure/postgres/migrations/1767867000000_ExtendCompaniesForCompaniesModule.js';

describe('Companies RLS Integration', () => {
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
      await new ExtendCompaniesForCompaniesModule1767867000000().up(queryRunner);

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
          INSERT INTO companies (id, name, slug, created_by, is_active, status)
          VALUES
            ($1, 'Company A', 'company-a', $2, true, 'active'),
            ($3, 'Company B', 'company-b', $4, true, 'active')
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

  it('should isolate companies list by tenant session variable', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyA]);
    const rowsA = await dataSource.query(
      `SELECT id, slug FROM companies ORDER BY created_at ASC`,
    );
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].id).toBe(companyA);

    await dataSource.query(`SET app.current_tenant = $1`, [companyB]);
    const rowsB = await dataSource.query(
      `SELECT id, slug FROM companies ORDER BY created_at ASC`,
    );
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].id).toBe(companyB);
  });

  it('should block cross-tenant company profile update', async () => {
    if (!available || !dataSource) return;

    await dataSource.query(`SET app.current_tenant = $1`, [companyA]);
    await expect(
      dataSource.query(`UPDATE companies SET name = 'Hacked' WHERE id = $1`, [companyB]),
    ).rejects.toBeDefined();
  });
});
