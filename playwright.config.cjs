const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.browser.cjs', workers: 1,
  reporter: 'list', timeout: 20000, outputDir: 'test-results',
});
