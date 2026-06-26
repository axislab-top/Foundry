export class TenantContextMissingError extends Error {
  constructor(context: string) {
    super(`Tenant context missing in ${context}`);
    this.name = 'TenantContextMissingError';
  }
}

