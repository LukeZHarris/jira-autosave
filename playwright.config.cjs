const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.browser.cjs', workers: 1,
  reporter: 'list', timeout: 60000, expect: { timeout: 25000 }, outputDir: 'test-results',
});
