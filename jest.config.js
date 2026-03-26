module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'test/**/*.(t|j)s',
    '!test/**/*.spec.ts',
    '!test/**/*.e2e-spec.ts',
    '!test/setup/**',
    '!test/fixtures/**',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@service/config$': '<rootDir>/test/mocks/service-config.ts',
    '^@service/consul$': '<rootDir>/test/mocks/service-consul.ts',
    '^@service/(.*)$': '<rootDir>/infrastructure/$1/src',
    '^@contracts/(.*)$': '<rootDir>/contracts/$1/src',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest-setup.js'],
  testTimeout: 30000,
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
};







