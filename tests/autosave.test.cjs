const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const FakeTimers = require('@sinonjs/fake-timers');
const source = fs.readFileSync('content.js', 'utf8');
const markup = `<section data-testid="issue.views.field.rich-text.description"><h2>Description</h2><div role="toolbar"><button id="bold">Bold</button></div><div role="textbox" contenteditable="true"><p>Example</p></div><button id="save">Save</button><button id="cancel">Cancel</button></section>`;
function setup(t, html = markup) {
  const dom = new JSDOM(`<body>${html}<a id="away" href="/browse/TEST-2">Next issue</a></body>`, { url: 'https://example.atlassian.net/browse/TEST-1', runScripts: 'outside-only' });
  const w = dom.window;
  w.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 30 }]; };
  const clock = FakeTimers.withGlobal(w).install({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  w.eval(source);
  const q = selector => w.document.querySelector(selector);
  let saves = 0;
  q('#save')?.addEventListener('click', () => saves++);
  const event = (el, type, options = {}) => el.dispatchEvent(new w.Event(type, { bubbles: true, ...options }));
  const edit = () => event(q('[contenteditable]'), 'input');
  const tick = async ms => { await Promise.resolve(); await clock.tickAsync(ms); await Promise.resolve(); };
  t.after(() => { clock.uninstall(); dom.window.close(); });
  return { w, q, clock, event, edit, tick, saves: () => saves, status: () => q('.jda-status')?.textContent };
}
test('debounces actual input; opening and unrelated DOM changes do not save', async t => {
  const s = setup(t);
  await s.tick(5000); assert.equal(s.saves(), 0);
  s.q('[contenteditable]').className = 'focused';
  s.q('[contenteditable]').setAttribute('aria-label', 'Description');
  await s.tick(2000); assert.equal(s.saves(), 0);
  s.edit(); assert.equal(s.status(), 'Unsaved changes…');
  await s.tick(1000); s.edit(); await s.tick(1499); assert.equal(s.saves(), 0);
  await s.tick(1); assert.equal(s.saves(), 1); assert.equal(s.status(), 'Saving…');
  await s.tick(3000); assert.equal(s.saves(), 1);
});
test('only announces Saved after editor closes in the same field and route', async t => {
  const s = setup(t); s.edit(); await s.tick(1500);
  s.q('section').innerHTML = '<h2>Description</h2><div>Rendered by Jira</div>';
  await s.tick(249); assert.equal(s.status(), 'Saving…');
  await s.tick(1); assert.equal(s.status(), 'Saved');
  await s.tick(1800); assert.equal(s.q('.jda-status'), null);
  s.q('section').outerHTML = markup; await s.tick(0); s.edit(); await s.tick(1500);
  assert.equal(s.status(), 'Saving…');
});
test('Cancel on pointerdown cancels even when debounce would fire before click', async t => {
  const s = setup(t); s.edit(); await s.tick(1490);
  s.event(s.q('#cancel'), 'pointerdown'); await s.tick(1000);
  s.q('#cancel').click(); await s.tick(5000); assert.equal(s.saves(), 0);
  assert.equal(s.q('.jda-status'), null);
});
test('keyboard generated Cancel click is respected', async t => {
  const s = setup(t); s.edit(); s.q('#cancel').click(); await s.tick(5000); assert.equal(s.saves(), 0);
});
test('manual Save clears debounce and does not get duplicated', async t => {
  const s = setup(t); s.edit(); await s.tick(500); s.q('#save').click();
  await s.tick(6000); assert.equal(s.saves(), 1); assert.equal(s.status(), 'Saving…');
});
test('native keyboard save shortcut remains untouched', async t => {
  const s = setup(t); s.edit();
  const key = new s.w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 'Enter' });
  s.q('[contenteditable]').dispatchEvent(key);
  assert.equal(key.defaultPrevented, false);
  s.q('#save').click(); await s.tick(5000); assert.equal(s.saves(), 1);
});
test('genuine outside pointerdown saves before navigation', async t => {
  const s = setup(t); s.edit(); s.event(s.q('#away'), 'pointerdown'); assert.equal(s.saves(), 1);
});
test('toolbar and portalled formatting dialog suspend idle saves', async t => {
  const s = setup(t); s.edit(); await s.tick(1400);
  s.event(s.q('#bold'), 'pointerdown');
  const dialog = s.w.document.createElement('div'); dialog.setAttribute('role', 'dialog');
  dialog.innerHTML = '<input aria-label="Link URL">'; s.w.document.body.append(dialog);
  s.q('#bold').click(); s.event(dialog.querySelector('input'), 'focusin');
  await s.tick(5000); assert.equal(s.saves(), 0);
  dialog.remove(); await s.tick(1500); assert.equal(s.saves(), 1);
});
test('format-only user mutations save without serializing contents', async t => {
  const s = setup(t); s.event(s.q('#bold'), 'pointerdown'); s.q('#bold').click();
  const p = s.q('[contenteditable] p'); const strong = s.w.document.createElement('strong');
  p.replaceWith(strong); await s.tick(1500); assert.equal(s.saves(), 1);
});
test('selection and decoration attributes after keyboard activity are ignored', async t => {
  const s = setup(t);
  s.q('[contenteditable]').dispatchEvent(new s.w.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
  s.q('[contenteditable] p').setAttribute('class', 'selected');
  await s.tick(3000); assert.equal(s.saves(), 0);
});
test('IME composition cannot be interrupted by autosave', async t => {
  const s = setup(t); s.event(s.q('[contenteditable]'), 'compositionstart'); s.edit();
  await s.tick(3000); assert.equal(s.saves(), 0);
  s.event(s.q('[contenteditable]'), 'compositionend'); await s.tick(1500); assert.equal(s.saves(), 1);
});
test('timeout fails once; only subsequent edit retries', async t => {
  const s = setup(t); s.edit(); await s.tick(11500);
  assert.equal(s.status(), 'Save failed'); await s.tick(30000); assert.equal(s.saves(), 1);
  s.event(s.q('#away'), 'pointerdown'); assert.equal(s.saves(), 1);
  s.edit(); await s.tick(1500); assert.equal(s.saves(), 2);
});
test('new Jira error fails the save without retry', async t => {
  const s = setup(t); s.edit(); await s.tick(1500);
  const error = s.w.document.createElement('div'); error.setAttribute('role', 'alert'); error.textContent = 'Cannot save';
  s.w.document.body.append(error); await s.tick(100);
  assert.equal(s.status(), 'Save failed'); await s.tick(30000); assert.equal(s.saves(), 1);
});
test('edits during flight never launch a concurrent save or get called saved', async t => {
  const s = setup(t); s.edit(); await s.tick(1500); s.edit(); await s.tick(2000);
  assert.equal(s.saves(), 1);
  s.q('section').innerHTML = '<h2>Description</h2><div>Rendered</div>';
  await s.tick(250); assert.equal(s.status(), 'Save failed');
});
test('route changes and root removal are not save completion', async t => {
  const s = setup(t); s.edit(); await s.tick(1500);
  s.w.history.pushState({}, '', '/browse/TEST-2'); s.q('section').remove(); await s.tick(500);
  assert.equal(s.q('.jda-status'), null); assert.equal(s.saves(), 1);
  s.w.document.body.insertAdjacentHTML('afterbegin', markup); await s.tick(0);
  s.edit(); await s.tick(1500); assert.equal(s.status(), 'Saving…');
});
test('ambiguous editors and unrelated Save buttons are never clicked', async t => {
  const s = setup(t, `<div><div role="textbox" contenteditable="true"></div><button id="other">Save</button></div>${markup.replace('<button id="save">', '<button>Save</button><button id="save">')}`);
  await s.tick(0); assert.equal(s.q('.jda-status'), null);
  s.edit(); await s.tick(3000); assert.equal(s.saves(), 0);
});
test('comment editors and generic Description headings are not candidates', async t => {
  const s = setup(t, markup.replace('data-testid="issue.views.field.rich-text.description"', 'data-testid="comment"'));
  s.edit(); await s.tick(3000); assert.equal(s.saves(), 0); assert.equal(s.q('.jda-status'), null);
});
test('disabled Save fails safely and does not poll or retry', async t => {
  const s = setup(t); s.edit(); s.q('#save').disabled = true; await s.tick(1500);
  assert.equal(s.status(), 'Save failed'); s.q('#save').disabled = false;
  await s.tick(30000); assert.equal(s.saves(), 0);
});
test('re-executing the content script does not duplicate listeners', async t => {
  const s = setup(t); s.w.eval(source); s.edit(); await s.tick(1500);
  assert.equal(s.saves(), 1); assert.equal(s.w.document.querySelectorAll('.jda-status').length, 1);
});
test('live Jira heading identifies edit-mode wrapper and permits hidden attachment input', async t => {
  const live = `<div><div><h2 data-testid="issue.views.issue-base.common.description.label">Description</h2></div><div data-testid="issue.views.field.rich-text.editor-container"><div data-testid="issue.component.editor.default-editor"><input type="file" hidden><div role="textbox" contenteditable="true" aria-label="Description area, start typing to enter text."></div><button id="save" data-testid="comment-save-button">Save</button><button id="cancel" data-testid="comment-cancel-button">Cancel</button></div></div></div>`;
  const s = setup(t, live); s.edit(); await s.tick(1500); assert.equal(s.saves(), 1);
  s.q('[data-testid="issue.views.field.rich-text.editor-container"]').outerHTML = '<div data-testid="issue.views.field.rich-text.description">Rendered view</div>';
  await s.tick(250); assert.equal(s.status(), 'Saved');
});
test('Description heading cannot match an adjacent custom field editor', async t => {
  const s = setup(t, `<div><div><h2 data-testid="issue.views.issue-base.common.description.label">Description</h2></div><div><h2 data-testid="issue.views.issue-base.common.customfield_1.label">Other field</h2><div data-testid="issue.views.field.rich-text.editor-container"><div role="textbox" contenteditable="true"></div><button id="save">Save</button><button id="cancel">Cancel</button></div></div></div>`);
  s.edit(); await s.tick(3000); assert.equal(s.saves(), 0); assert.equal(s.q('.jda-status'), null);
});
test('empty Jira popup portal does not suspend autosave', async t => {
  const s = setup(t); const portal = s.w.document.createElement('div'); portal.dataset.editorPopup = 'true';
  portal.getClientRects = () => [{ width: 0, height: 0 }]; s.w.document.body.append(portal);
  s.edit(); await s.tick(1500); assert.equal(s.saves(), 1);
});
test('selection-only cursor and pointer activity cannot arm mutation saves', async t => {
  const s = setup(t);
  s.q('[contenteditable]').dispatchEvent(new s.w.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
  s.event(s.q('[contenteditable]'), 'pointerdown'); s.q('[contenteditable]').click();
  const decoration = s.w.document.createTextNode('decoration');
  s.q('[contenteditable]').append(decoration);
  await s.tick(3000); assert.equal(s.saves(), 0);
});
test('buttons embedded in Description content are not read or mistaken for controls', async t => {
  const s = setup(t);
  const embedded = s.w.document.createElement('span'); embedded.setAttribute('role', 'button');
  Object.defineProperty(embedded, 'textContent', { get() { throw new Error('Description content must not be read'); } });
  s.q('[contenteditable]').append(embedded); s.edit(); await s.tick(1500); assert.equal(s.saves(), 1);
});
test('manual save teardown is not mistaken for edits made during the save', async t => {
  const s = setup(t);
  s.event(s.q('[contenteditable]'), 'beforeinput'); s.edit();
  s.event(s.q('#save'), 'pointerdown'); s.q('#save').click();
  s.q('[contenteditable]').replaceChildren();
  s.q('section').innerHTML = '<h2>Description</h2><div>Rendered</div>';
  await s.tick(250); assert.equal(s.status(), 'Saved'); assert.equal(s.saves(), 1);
});
test('new input during a manual save is still treated as unconfirmed', async t => {
  const s = setup(t); s.edit(); s.q('#save').click();
  s.event(s.q('[contenteditable]'), 'beforeinput'); s.edit();
  s.q('section').innerHTML = '<h2>Description</h2><div>Rendered</div>';
  await s.tick(250); assert.equal(s.status(), 'Save failed'); assert.equal(s.saves(), 1);
});
