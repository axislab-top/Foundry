export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.spec.json',
        diagnostics: {
          ignoreCodes: [151002],
        },
      },
    ],
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.interface.ts',
    '!**/*.dto.ts',
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
    '^@/(.*)$': '<rootDir>/$1',
    '^@service/(.*)$': '<rootDir>/../../../infrastructure/$1/src',
    '^@contracts/(.*)$': '<rootDir>/../../../contracts/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/../../../test/setup/jest-setup.js'],
};

