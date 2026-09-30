/** @type {import('jest').Config} */
const config = {
  projects: [
    // Pure TypeScript tests (no React Native dependencies)
    // Used for: optimizer, inventory utils, and any other pure logic
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', {
          tsconfig: {
            // Inherit strict from the root tsconfig, but add jest types
            strict: true,
            types: ['jest'],
            esModuleInterop: true,
          },
        }],
      },
      testEnvironment: 'node',
    },
  ],
};

module.exports = config;
