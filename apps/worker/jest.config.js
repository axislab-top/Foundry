export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.spec.json',
        diagnostics: {
          ignoreCodes: [151002, 1343],
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
    /** `@contracts/events` 包 `main` 指向 dist ESM；单测走源码 */
    '^@contracts/events$': '<rootDir>/../../../contracts/events/index.ts',
    '^@contracts/types$': '<rootDir>/../../../contracts/types/index.ts',
    '^@contracts/types/dept-report(\\.js)?$': '<rootDir>/../../../contracts/types/dept-report.ts',
    '^@contracts/types/dept-task-pipeline(\\.js)?$': '<rootDir>/../../../contracts/types/dept-task-pipeline.ts',
    /** Relative `export * from './foo.js'` inside contracts/types must not load emitted ESM `.js` in Jest. */
    '^.*[\\\\/]contracts[\\\\/]types[\\\\/](.+?)\\.js$': '<rootDir>/../../../contracts/types/$1.ts',
    '^@contracts/(.*)$': '<rootDir>/../../../contracts/$1',
    '^@foundry/approval-core$': '<rootDir>/../../../packages/core/approval/src/index.ts',
    '^@foundry/collaboration-core$': '<rootDir>/../../../packages/core/collaboration/src/index.ts',
    '^@foundry/multi-agent-core$': '<rootDir>/../../../packages/core/multi-agent/src/index.ts',
    /** Jest 不转译 workspace `packages/contracts/dist` 的 ESM；单测改走 `types` 源码由 ts-jest 编译 */
    '^@foundry/contracts/types/([^/]+)$': '<rootDir>/../../../packages/contracts/types/$1.ts',
    '^@foundry/contracts/types/collaboration$': '<rootDir>/../../../packages/contracts/types/collaboration.ts',
    '^@foundry/contracts/types/collaboration-2026$': '<rootDir>/../../../packages/contracts/types/collaboration-2026.ts',
    '^@foundry/contracts/types/departments$': '<rootDir>/../../../packages/contracts/types/departments.ts',
    '^@foundry/contracts/types/mcp\\.protocol$': '<rootDir>/../../../packages/contracts/types/mcp.protocol.ts',
    '^@foundry/contracts/types/ceo-hierarchical\\.types$':
      '<rootDir>/../../../packages/contracts/types/ceo-hierarchical.types.ts',
    '^@foundry/contracts/types/billing-units$': '<rootDir>/../../../packages/contracts/types/billing-units.ts',
    '^.*[\\\\/]pipeline-v2[\\\\/]pipeline-v2\\.forward-ref$':
      '<rootDir>/modules/collaboration/pipeline-v2/__mocks__/pipeline-v2.forward-ref.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/../../../test/setup/jest-setup.js'],
};

