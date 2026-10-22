module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.(e2e|int)-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageDirectory: './coverage/e2e',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports', outputName: 'e2e.xml' }],
  ],
  testEnvironment: 'node',
  testTimeout: 30_000,
  watchman: false,
};
