/** @type {import('jest').Config} */
const config = {
  displayName: 'db',
  testMatch: ['<rootDir>/tests/db/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          types: ['jest', 'node'],
          esModuleInterop: true,
        },
      },
    ],
  },
  testEnvironment: 'node',
  testTimeout: 30000,
};

module.exports = config;
