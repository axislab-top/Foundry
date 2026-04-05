import { TenantResolutionStrategy } from '@service/tenant';

describe('TenantResolutionStrategy', () => {
  let strategy: TenantResolutionStrategy;

  beforeEach(() => {
    strategy = new TenantResolutionStrategy();
  });

  it('should resolve companyId from header first', () => {
    const request = {
      headers: { 'x-company-id': 'company-header' },
      user: { companyId: 'company-user' },
      query: { companyId: 'company-query' },
    };
    expect(strategy.resolve(request)).toBe('company-header');
  });

  it('should resolve companyId from user claim', () => {
    const request = {
      headers: {},
      user: { companyId: 'company-user' },
      query: { companyId: 'company-query' },
    };
    expect(strategy.resolve(request)).toBe('company-user');
  });

  it('should resolve companyId from query', () => {
    const request = {
      headers: {},
      user: {},
      query: { companyId: 'company-query' },
    };
    expect(strategy.resolve(request)).toBe('company-query');
  });

  it('should return undefined when no companyId is provided', () => {
    expect(strategy.resolve({ headers: {}, user: {}, query: {} })).toBeUndefined();
  });

  it('should resolve companyId from subdomain host', () => {
    const request = {
      headers: { host: 'company-sub.example.com' },
      user: {},
      query: {},
    };
    expect(strategy.resolve(request)).toBe('company-sub');
  });
});
