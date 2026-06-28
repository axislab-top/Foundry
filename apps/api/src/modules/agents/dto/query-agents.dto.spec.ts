import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryAgentsDto } from './query-agents.dto.js';

describe('QueryAgentsDto pageSize', () => {
  async function errs(pageSize: unknown) {
    const dto = plainToInstance(QueryAgentsDto, { pageSize }, { enableImplicitConversion: true });
    return validate(dto);
  }

  it('accepts pageSize at upper bound 500', async () => {
    expect(await errs(500)).toHaveLength(0);
  });

  it('accepts pageSize 100', async () => {
    expect(await errs(100)).toHaveLength(0);
  });

  it('rejects pageSize above 500', async () => {
    const v = await errs(501);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((e) => e.property === 'pageSize')).toBe(true);
  });

  it('rejects pageSize below 1', async () => {
    const v = await errs(0);
    expect(v.length).toBeGreaterThan(0);
  });
});
