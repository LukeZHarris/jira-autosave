const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let context, profile;
test.beforeAll(async () => {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jda-test-'));
  const extension = path.resolve('.');
  context = await chromium.launchPersistentContext(profile, {
    channel: process.env.JDA_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  await context.route('https://fixture.atlassian.net/**', route => route.fulfill({
    contentType: 'text/html', body: fs.readFileSync('tests/fixture.html', 'utf8'),
  }));
});
test.afterAll(async () => { await context?.close(); if (profile) fs.rmSync(profile, { recursive: true, force: true }); });
async function pageAt(url) {
  const page = await context.newPage();
  await page.goto(`https://fixture.atlassian.net${url}`);
  await page.getByRole('button', { name: 'Edit description' }).click();
  return page;
}
for (const url of ['/browse/DEMO-1', '/jira/software/c/projects/DEMO/boards/1?selectedIssue=DEMO-1']) {
  test(`packaged extension activates and saves at ${url}`, async () => {
    const page = await pageAt(url);
    await page.getByRole('textbox', { name: 'Description' }).fill('Saved by the real extension');
    await expect(page.locator('.jda-status')).toHaveText('Unsaved changes…');
    await expect(page.locator('.jda-status')).toHaveText('Saved');
    await expect(page.locator('#view')).toContainText('Saved by the real extension');
    expect(await page.evaluate(() => window.saveCount)).toBe(1);
    await page.close();
  });
}
test('Cancel leaves synthetic saved content unchanged', async () => {
  const page = await pageAt('/browse/DEMO-1');
  await page.getByRole('textbox', { name: 'Description' }).fill('Discard this');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#view')).toContainText('A small improvement');
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => window.saveCount)).toBe(0);
  await page.close();
});
test('formatting dialog holds autosave, then resumes', async () => {
  const page = await pageAt('/browse/DEMO-1');
  await page.getByRole('textbox', { name: 'Description' }).fill('Keep editing');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Link URL' }).fill('https://example.org');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.saveCount)).toBe(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.jda-status')).toHaveText('Saved');
  await page.close();
});
test('native error is shown and does not retry', async () => {
  const page = await pageAt('/browse/DEMO-1');
  await page.evaluate(() => { window.failSave = true; });
  await page.getByRole('textbox', { name: 'Description' }).fill('Cannot save');
  await expect(page.locator('.jda-status')).toHaveText('Save failed');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.saveCount)).toBe(1);
  await page.close();
});
test('SPA replacement activates a fresh Description editor', async () => {
  const page = await pageAt('/browse/DEMO-1');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => {
    history.pushState({}, '', '/browse/DEMO-2');
    document.querySelector('h1').textContent = 'Another issue';
  });
  await page.getByRole('button', { name: 'Edit description' }).click();
  await page.getByRole('textbox', { name: 'Description' }).fill('New issue edit');
  await expect(page.locator('.jda-status')).toHaveText('Saved');
  await page.close();
});
test('capture a synthetic README demo', async () => {
  const page = await pageAt('/browse/DEMO-1');
  await page.setViewportSize({ width: 1050, height: 620 });
  await page.getByRole('textbox', { name: 'Description' }).fill('Type normally. Pause for a moment. Jira takes care of the save.');
  await expect(page.locator('.jda-status')).toHaveText('Unsaved changes…');
  await page.screenshot({ path: 'docs/demo.png' });
  await page.close();
});
for (const mode of ['button', 'shortcut']) {
  test(`manual ${mode} save survives editor teardown without a false failure`, async () => {
    const page = await pageAt('/browse/DEMO-1');
    const editor = page.getByRole('textbox', { name: 'Description' });
    await editor.fill('Manual save regression');
    if (mode === 'button') await page.getByRole('button', { name: 'Save', exact: true }).click();
    else await editor.press('ControlOrMeta+Enter');
    await expect(page.locator('.jda-status')).toHaveText('Saved');
    expect(await page.evaluate(() => window.saveCount)).toBe(1);
    await page.close();
  });
}
