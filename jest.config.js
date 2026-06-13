module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts', '**/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/\.worktrees/'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  setupFilesAfterEnv: ['<rootDir>/test/vscode-mock-setup.js']
}
