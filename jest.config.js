module.exports = {
  testEnvironment: 'node',
  bail: false,
  verbose: true,
  testMatch: ['**/__tests__/**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  coverageDirectory: '<rootDir>/.coverage',
  collectCoverage: true,
  collectCoverageFrom: ['lib/**/*.js', '!**/node_modules/**'],
  watchman: false,
  setupFilesAfterEnv: ['jest-extended']
};
