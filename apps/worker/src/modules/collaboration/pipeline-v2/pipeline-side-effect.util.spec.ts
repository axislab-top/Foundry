import { Logger } from '@nestjs/common';
import { logSwallowedSideEffect } from './pipeline-side-effect.util.js';

describe('logSwallowedSideEffect', () => {
  it('logs warn with error message', () => {
    const logger = { warn: jest.fn() } as unknown as Logger;
    logSwallowedSideEffect(logger, 'test.event', { companyId: 'c1' }, new Error('boom'));
    expect(logger.warn).toHaveBeenCalledWith('test.event', {
      companyId: 'c1',
      err: 'boom',
    });
  });
});
