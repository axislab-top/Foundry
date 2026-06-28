import { UnprocessableEntityException } from '@nestjs/common';
import { CompanyCreationQuotaService } from './company-creation-quota.service.js';

describe('CompanyCreationQuotaService', () => {
  const buildService = (options?: { maxOwned?: number; ownedCount?: number }) => {
    const maxOwned = options?.maxOwned ?? 3;
    const ownedCount = options?.ownedCount ?? 0;

    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return [{ count: String(ownedCount) }];
        }
        return undefined;
      }),
    };

    const dataSource = {
      transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager)),
    };

    const config = {
      getMaxOwnedCompaniesPerUser: jest.fn(() => maxOwned),
    };

    const service = new CompanyCreationQuotaService(dataSource as never, config as never);
    return { service, manager, config };
  };

  it('returns quota with remaining slots', async () => {
    const { service } = buildService({ ownedCount: 2 });
    await expect(service.getQuota({ id: 'user-1' })).resolves.toEqual({
      ownedCount: 2,
      maxOwned: 3,
      remaining: 1,
      canCreate: true,
    });
  });

  it('blocks creation when quota is full', async () => {
    const { service } = buildService({ ownedCount: 3 });
    await expect(service.assertCanCreateCompany({ id: 'user-1' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('allows platform admin to bypass quota', async () => {
    const { service } = buildService({ ownedCount: 3 });
    await expect(
      service.assertCanCreateCompany({ id: 'admin-1', roles: ['admin'] }),
    ).resolves.toBeUndefined();
    await expect(service.getQuota({ id: 'admin-1', roles: ['admin'] })).resolves.toMatchObject({
      canCreate: true,
    });
  });

  it('enforces quota inside transaction scope', async () => {
    const { service } = buildService({ ownedCount: 3 });
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return [{ count: '3' }];
        }
        return undefined;
      }),
    };

    await expect(
      service.assertCanCreateCompanyInTransaction(queryRunner as never, { id: 'user-1' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
