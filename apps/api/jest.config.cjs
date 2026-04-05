module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: false,
      },
    ],
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.interface.ts',
    '!**/*.dto.ts',
    '!**/*.entity.ts',
    '!**/*.types.ts',
    '!**/index.ts',
    '!main.ts',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/test/pact/'],
  moduleNameMapper: {
    '^@foundry/task-core$': '<rootDir>/../../packages/core/task/src/index.ts',
    '^@foundry/supervisor-core$': '<rootDir>/../../packages/core/supervisor/src/index.ts',
    '^@foundry/observability-core$': '<rootDir>/../../packages/core/observability/src/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@service/config$': '<rootDir>/../../test/mocks/service-config.ts',
    '^@service/(.*)$': '<rootDir>/../../infrastructure/$1/src',
    '^@contracts/([^/]+)$': '<rootDir>/../../contracts/$1/index.ts',
    '^@contracts/([^/]+)/(.+)$': '<rootDir>/../../contracts/$1/$2.ts',
    '^(?:\\.\\./)+test/utils/(.*)\\.js$': '<rootDir>/../../test/utils/$1.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/../../test/setup/jest-setup.js'],
};

