/** Pact 生成与 Provider 验证（含 pact-core 原生校验，与普通单测隔离） */
const base = { ...require('./jest.config.cjs') };
delete base.testPathIgnorePatterns;
delete base.testRegex;

module.exports = {
  ...base,
  testMatch: ['<rootDir>/test/pact/**/*.spec.ts'],
  testTimeout: 120_000,
  coverageThreshold: undefined,
  collectCoverageFrom: [],
};
