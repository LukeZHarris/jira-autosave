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
test('floating countdown follows visible caret and stays on screen after scrolling and resizing', async () => {
  const page = await pageAt('/browse/DEMO-1');
  await page.setViewportSize({ width: 1050, height: 700 });
  const editor = page.getByRole('textbox', { name: 'Description' });
  await editor.fill('A long description with room to think.\n'.repeat(100));
  await editor.evaluate(el => {
    const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    document.getSelection().collapse(text, 0);
    el.scrollIntoView({ block: 'start' });
  });
  const notice = page.locator('.jda-countdown');
  await expect(notice).toBeVisible();
  await expect(editor).toBeFocused();
  const placement = await page.evaluate(() => {
    const caret = document.getSelection().getRangeAt(0).getBoundingClientRect();
    const box = document.querySelector('.jda-countdown').getBoundingClientRect();
    return { gap: box.top - caret.bottom, bottom: box.bottom, height: innerHeight };
  });
  expect(placement.gap).toBeGreaterThanOrEqual(10);
  expect(placement.gap).toBeLessThanOrEqual(14);
  expect(placement.bottom).toBeLessThan(placement.height);
  // The caret is now offscreen; the card must be centred in the visible window.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => notice.evaluate(el => {
    const box = el.getBoundingClientRect();
    return [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
  })).toEqual([525, 350]);
  await page.setViewportSize({ width: 260, height: 400 });
  await expect.poll(async () => notice.evaluate(el => {
    const box = el.getBoundingClientRect();
    return [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
  })).toEqual([130, 200]);
  const box = await notice.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(11);
  expect(box.x + box.width).toBeLessThanOrEqual(249);
  expect(box.y + box.height).toBeLessThanOrEqual(389);
  expect(box.x + box.width / 2).toBeCloseTo(130, 0);
  expect(box.y + box.height / 2).toBeCloseTo(200, 0);
  await expect(editor).toBeFocused();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(notice).toBeHidden();
  expect(await page.evaluate(() => window.saveCount)).toBe(0);
  await page.close();
});
test('floating countdown escapes clipped containers and flips above a low caret', async () => {
  const page = await pageAt('/browse/DEMO-1');
  await page.setViewportSize({ width: 1050, height: 700 });
  const editor = page.getByRole('textbox', { name: 'Description' });
  await editor.fill('Keep this warning visible');
  await page.evaluate(() => {
    const main = document.querySelector('main');
    main.style.cssText = 'height:360px; overflow:auto; transform:translateZ(0)';
    main.scrollTop = 0;
  });
  const notice = page.locator('.jda-countdown');
  await expect(notice).toBeVisible();
  const escaped = await notice.evaluate(el => {
    const box = el.getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    return { outside: box.bottom > main.bottom, hit: el.contains(document.elementFromPoint(box.left + 20, box.bottom - 20)) };
  });
  expect(escaped).toEqual({ outside: true, hit: true });
  await page.setViewportSize({ width: 1050, height: 400 });
  await expect.poll(async () => page.evaluate(() => {
    const caret = document.getSelection().getRangeAt(0).getBoundingClientRect();
    const box = document.querySelector('.jda-countdown').getBoundingClientRect();
    return box.bottom < caret.top && box.top >= 12;
  })).toBe(true);
  // Continuing to type dismisses the floating card without taking focus.
  await editor.press('x');
  await expect(notice).toBeHidden();
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => window.saveCount)).toBe(0);
  await page.close();
});
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
  await page.waitForTimeout(21000);
  expect(await page.evaluate(() => window.saveCount)).toBe(0);
  await page.close();
});
test('countdown Cancel preserves focus and grants thirty seconds before warning again', async () => {
  const page = await pageAt('/browse/DEMO-1');
  const editor = page.getByRole('textbox', { name: 'Description' });
  const notice = page.locator('.jda-countdown');
  await editor.fill('Time to think');
  await expect(notice).toBeVisible();
  await expect(editor).toBeFocused();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(notice).toBeHidden();
  await expect(editor).toBeFocused();
  await page.waitForTimeout(11000);
  await expect(notice).toBeHidden();
  expect(await page.evaluate(() => window.saveCount)).toBe(0);
  await expect(notice).toBeVisible();
  await expect(page.locator('.jda-status')).toHaveText('Saved');
  await expect(page.locator('#view')).toContainText('Time to think');
  expect(await page.evaluate(() => window.saveCount)).toBe(1);
  await page.close();
});
test('keyboard can cancel the countdown and resume editing without saving', async () => {
  const page = await pageAt('/browse/DEMO-1');
  const editor = page.getByRole('textbox', { name: 'Description' });
  await editor.fill('Still editing');
  await expect(page.locator('.jda-countdown')).toBeVisible();
  // Native Save, native Cancel, then the extension countdown's Cancel.
  await editor.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(editor).toBeFocused();
  await expect(page.locator('.jda-countdown')).toBeHidden();
  expect(await page.evaluate(() => window.saveCount)).toBe(0);
  await editor.press('ControlOrMeta+Enter');
  await expect(page.locator('.jda-status')).toHaveText('Saved');
  await page.close();
});
test('formatting dialog holds autosave, then resumes', async () => {
  const page = await pageAt('/browse/DEMO-1');
  await page.getByRole('textbox', { name: 'Description' }).fill('Keep editing');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Link URL' }).fill('https://example.org');
  await page.waitForTimeout(11000);
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
  await page.waitForTimeout(11000);
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
  await expect(page.locator('.jda-countdown')).toBeVisible();
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
