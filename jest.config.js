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
    '^@contracts/types/collab-redis-keys$': '<rootDir>/contracts/types/collab-redis-keys.ts',
    '^@contracts/types$': '<rootDir>/contracts/types/index.ts',
    '^@contracts/types/(.*)$': '<rootDir>/contracts/types/$1.ts',
    '^@contracts/types/collaboration-2026$': '<rootDir>/packages/contracts/types/collaboration-2026.ts',
    '^@foundry/contracts/types/(.*)$': '<rootDir>/packages/contracts/types/$1.ts',
    '^@contracts/(.*)$': '<rootDir>/packages/contracts/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/test/tsconfig.json',
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest-setup.js'],
  testTimeout: 30000,
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
};







