/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/src/libs/common/$1',
    '^@config/(.*)$': '<rootDir>/src/libs/config/$1',
    '^@db/(.*)$': '<rootDir>/src/libs/db-control/$1',
    '^@registry/(.*)$': '<rootDir>/src/libs/registry/$1',
    '^@health-checks/(.*)$': '<rootDir>/src/libs/health-checks/$1',
    '^@audit/(.*)$': '<rootDir>/src/libs/audit/$1',
    '^@alerts-lib/(.*)$': '<rootDir>/src/libs/alerts/$1',
    '^@auth-stub/(.*)$': '<rootDir>/src/libs/auth-stub/$1',
    '^@telemetry-normalize/(.*)$': '<rootDir>/src/libs/telemetry-normalize/$1',
    '^@collectors/(.*)$': '<rootDir>/src/libs/collectors/$1',
    '^@radius-server/(.*)$': '<rootDir>/src/libs/radius-server/$1',
    '^@netflow-collector/(.*)$': '<rootDir>/src/libs/netflow-collector/$1',
    '^@dns-resolution-cache/(.*)$': '<rootDir>/src/libs/dns-resolution-cache/$1',
    '^@dns-log-collector/(.*)$': '<rootDir>/src/libs/dns-log-collector/$1',
    '^@secrets/(.*)$': '<rootDir>/src/libs/secrets/$1',
    '^@inventory-cache/(.*)$': '<rootDir>/src/libs/inventory-cache/$1',
    '^@password-hash/(.*)$': '<rootDir>/src/libs/password-hash/$1',
    '^@radius-coa/(.*)$': '<rootDir>/src/libs/radius-coa/$1'
  },
  setupFiles: ['<rootDir>/test/jest.setup.ts'],
  testTimeout: 30000
};
