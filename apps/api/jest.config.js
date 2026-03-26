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
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@service/config$': '<rootDir>/../../test/mocks/service-config.ts',
    '^@service/(.*)$': '<rootDir>/../../infrastructure/$1/src',
    '^@contracts/(.*)$': '<rootDir>/../../contracts/$1/src',
    '^(?:\\.\\./)+test/utils/(.*)\\.js$': '<rootDir>/../../test/utils/$1.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/../../test/setup/jest-setup.js'],
};

