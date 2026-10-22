/**
 * Jest configuration for Unit tests.
 *
 */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    // Pure wiring (bootstrapping, module declarations, migrations) is
    // exercised by the end-to-end suite instead.
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/migrations/*.ts',
  ],
  coverageDirectory: './coverage/unit',
  coverageReporters: ['text-summary', 'text', 'lcov', 'json-summary'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports', outputName: 'unit.xml' }],
  ],
  testEnvironment: 'node',
  // Watchman is a file-watching daemon; it is not needed for one-off runs
  // and is unavailable in many CI/sandboxed environments.
  watchman: false,
};
