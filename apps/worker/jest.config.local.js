import base from './jest.config.js';

export default {
  ...base,
  // Local developer convenience: allow running a single spec with coverage
  // without being blocked by the repo-wide global coverage threshold.
  coverageThreshold: undefined,
};

