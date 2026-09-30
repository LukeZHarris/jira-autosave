/* Jira Description Autosave — MIT. No content reads, storage, or network calls. */
(() => {
  'use strict';
  if (globalThis.__jiraDescriptionAutosave) return;
  globalThis.__jiraDescriptionAutosave = true;

  const CONFIG = Object.freeze({ idleMs: 10000, countdownMs: 10000, deferredIdleMs: 30000, timeoutMs: 10000, savedMs: 1800, settleMs: 250 });
  // Jira DOM is not a public contract. Keep exact field identifiers here. Never
  // broaden discovery to arbitrary textboxes, headings, or page-wide Save buttons.
  const SELECTORS = Object.freeze({
    field: '[data-testid="issue.views.field.rich-text.description"], [data-testid="issue.views.issue-base.foundation.description"]',
    descriptionLabel: '[data-testid="issue.views.issue-base.common.description.label"]',
    fieldLabel: '[data-testid^="issue.views.issue-base.common."][data-testid$=".label"]',
    editorContainer: '[data-testid="issue.views.field.rich-text.editor-container"]',
    editor: '[contenteditable="true"][role="textbox"], [contenteditable="true"].ProseMirror',
    button: 'button, [role="button"]',
    overlay: '[role="dialog"], [role="menu"], [role="listbox"], [data-editor-popup="true"]',
    error: '[role="alert"], [aria-invalid="true"]',
    toolbar: '[role="toolbar"]',
  });
  const controllers = new Map();
  const discarded = new WeakSet();
  const visible = el => el.isConnected && !el.closest('[hidden], [aria-hidden="true"]') &&
    getComputedStyle(el).visibility !== 'hidden' && [...el.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
  const buttons = root => [...root.querySelectorAll(SELECTORS.button)].filter(el => visible(el) && !el.closest(SELECTORS.editor));
  // Read control labels only; never read/serialize the Description editor.
  const label = el => (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase();
  function controls(root) {
    const editors = [...root.querySelectorAll(SELECTORS.editor)].filter(visible);
    const all = buttons(root);
    const save = all.filter(el => label(el) === 'save');
    const cancel = all.filter(el => label(el) === 'cancel');
    if (editors.length !== 1 || save.length !== 1 || cancel.length !== 1) return null;
    // Refuse a container that also includes another editable field/form.
    if ([...root.querySelectorAll('textarea, input:not([type="hidden"]):not([type="file"]), select')].some(visible)) return null;
    return { editor: editors[0], save: save[0], cancel: cancel[0] };
  }
  const enabled = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  function overlayOpen(root) {
    return [...document.querySelectorAll(SELECTORS.overlay)].some(el => visible(el) && !el.contains(root));
  }
  function contentMutation(record) {
    // Attribute changes for selection, focus, decorations, classes and ARIA do
    // not count. Inspect node types/tag names, never content values.
    if (record.type === 'characterData') return true;
    if (record.type === 'attributes') return ['href', 'src', 'colspan', 'rowspan'].includes(record.attributeName);
    const meaningful = node => node.nodeType === Node.TEXT_NODE ||
      (node.nodeType === Node.ELEMENT_NODE && /^(P|BR|STRONG|EM|B|I|S|U|A|UL|OL|LI|H[1-6]|BLOCKQUOTE|PRE|CODE|TABLE|TR|TD|TH|HR|IMG)$/.test(node.tagName));
    return [...record.addedNodes, ...record.removedNodes].some(meaningful);
  }

  class Editor {
    constructor(root, pair) {
      this.root = root;
      this.editor = pair.editor;
      this.url = location.href;
      this.version = 0;
      this.dirty = false;
      this.saving = false;
      this.failed = false;
      this.composing = false;
      this.intentUntil = 0;
      this.idleMs = CONFIG.idleMs;
      this.abort = new AbortController();
      this.status = document.createElement('span');
      this.status.className = 'jda-status';
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.status.hidden = true;
      // Sibling of the field: survives Jira replacing the editor's children.
      root.after(this.status);
      this.notice = document.createElement('div');
      this.notice.className = 'jda-countdown';
      this.notice.setAttribute('role', 'group');
      this.notice.setAttribute('aria-label', 'Description autosave');
      // Manual popovers escape Jira's scrolling containers and dialog layers.
      // Unlike a modal dialog, opening this never takes keyboard focus.
      this.notice.setAttribute('popover', 'manual');
      this.notice.hidden = true;
      this.countdownLabel = document.createElement('span');
      this.countdownLabel.setAttribute('role', 'status');
      this.deferButton = document.createElement('button');
      this.deferButton.type = 'button';
      this.deferButton.textContent = 'Keep editing';
      this.deferButton.title = 'Keep editing; wait 30 seconds before the next countdown';
      const hint = document.createElement('small');
      hint.textContent = 'Remind me after 30 seconds';
      this.notice.append(this.countdownLabel, this.deferButton, hint);
      this.status.after(this.notice);
      const listen = (target, name, fn, capture = false) => target.addEventListener(name, fn, { capture, signal: this.abort.signal });
      listen(document, 'selectionchange', () => this.rememberCaret());
      listen(document, 'scroll', () => this.positionNotice(), true);
      listen(window, 'resize', () => this.positionNotice());
      if (window.visualViewport) {
        listen(window.visualViewport, 'resize', () => this.positionNotice());
        listen(window.visualViewport, 'scroll', () => this.positionNotice());
      }
      // Act on pointerdown too, so a press just before zero cannot lose to Save.
      listen(this.deferButton, 'pointerdown', event => {
        if (event.button === 0) { event.preventDefault(); this.defer(); }
      });
      listen(this.deferButton, 'click', () => this.defer());
      listen(this.editor, 'input', () => this.changed());
      listen(this.editor, 'beforeinput', () => { this.intentUntil = Date.now() + 750; });
      listen(this.editor, 'compositionstart', () => { this.composing = true; this.clearSchedule(); });
      listen(this.editor, 'compositionend', () => { this.composing = false; this.schedule(); });
      listen(root, 'keydown', event => {
        const shortcut = event.ctrlKey || event.metaKey;
        if ((!shortcut && !event.altKey && event.key.length === 1) ||
            ['Backspace', 'Delete', 'Enter'].includes(event.key) ||
            (shortcut && ['b', 'i', 'u', 'z', 'y', 'x', 'v'].includes(event.key.toLowerCase()))) this.intentUntil = Date.now() + 750;
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) this.beginSave();
        // Leave Tab navigation intact so the countdown's Cancel stays reachable.
        else if (this.editor.contains(event.target) && !['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) this.schedule();
      }, true);
      listen(document, 'pointerdown', event => this.pointer(event), true);
      listen(document, 'click', event => this.click(event), true);
      listen(document, 'focusin', event => {
        if (!root.contains(event.target) && !this.notice.contains(event.target) && !overlayOpen(root)) this.save();
      }, true);
      listen(window, 'pagehide', () => this.save());
      // Navigation API gives an early chance without intercepting Jira's router.
      if (window.navigation) listen(window.navigation, 'navigate', () => this.save());
      this.observer = new MutationObserver(records => {
        if (Date.now() < this.intentUntil && records.some(contentMutation)) this.changed();
      });
      this.observer.observe(this.editor, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    show(text, state) {
      clearTimeout(this.hideTimer);
      if (this.status.textContent !== text) this.status.textContent = text;
      this.status.dataset.state = state;
      this.status.hidden = false;
    }
    changed() {
      this.version++;
      this.dirty = true;
      this.failed = false;
      if (!this.saving) this.show('Unsaved changes…', 'dirty');
      this.schedule();
    }
    schedule() {
      this.clearSchedule();
      if (this.dirty && !this.saving && !this.failed && !this.composing) {
        this.timer = setTimeout(() => this.startCountdown(), this.idleMs);
      }
    }
    clearSchedule() {
      clearTimeout(this.timer);
      clearTimeout(this.countdownTimer);
      this.notice.hidePopover?.();
      this.notice.hidden = true;
    }
    startCountdown() {
      if (!this.root.isConnected || location.href !== this.url || !visible(this.editor)) return;
      if (overlayOpen(this.root)) { this.schedule(); return; }
      this.countdownEnds = Date.now() + CONFIG.countdownMs;
      this.rememberCaret();
      this.notice.hidden = false;
      this.notice.showPopover?.();
      this.updateCountdown();
    }
    updateCountdown() {
      if (!this.root.isConnected || location.href !== this.url || !visible(this.editor)) { this.clearSchedule(); return; }
      if (overlayOpen(this.root)) { this.schedule(); return; }
      const remaining = Math.ceil((this.countdownEnds - Date.now()) / 1000);
      if (remaining <= 0) { this.clearSchedule(); this.save(); return; }
      this.countdownLabel.textContent = `Autosave in ${remaining}s`;
      this.positionNotice();
      this.countdownTimer = setTimeout(() => this.updateCountdown(), 1000);
    }
    rememberCaret() {
      const selection = document.getSelection();
      if (!selection?.focusNode || !this.editor.contains(selection.focusNode)) return;
      // Geometry only: never inspect text or insert a marker into Jira's editor.
      this.caret = document.createRange();
      this.caret.setStart(selection.focusNode, selection.focusOffset);
      this.caret.collapse(true);
      this.positionNotice();
    }
    positionNotice() {
      if (this.notice.hidden) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0;
      const top = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      const margin = 12;
      this.notice.style.maxWidth = `${Math.max(0, width - margin * 2)}px`;
      this.notice.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
      const box = this.notice.getBoundingClientRect();
      const right = left + width - margin - box.width;
      const bottom = top + height - margin - box.height;
      let x = left + (width - box.width) / 2;
      let y = top + (height - box.height) / 2;
      const caret = this.caret && this.editor.contains(this.caret.startContainer) && this.caret.getBoundingClientRect?.();
      // The newly opened card may initially cover the caret. Exclude our own
      // surface from hit testing, while still detecting Jira's clipped content.
      this.notice.style.pointerEvents = 'none';
      const caretVisible = caret?.height > 0 && this.editor.contains(document.elementFromPoint(caret.left, caret.top + caret.height / 2));
      this.notice.style.pointerEvents = '';
      if (caret?.height > 0 && caret.left >= left && caret.right < left + width &&
          caret.top >= top && caret.bottom <= top + height && caretVisible) {
        x = caret.left;
        y = caret.bottom + margin;
        if (y > bottom) y = caret.top - margin - box.height;
      }
      this.notice.style.left = `${Math.max(left + margin, Math.min(x, right))}px`;
      this.notice.style.top = `${Math.max(top + margin, Math.min(y, bottom))}px`;
    }
    defer() {
      const restoreFocus = this.notice.contains(document.activeElement);
      this.idleMs = CONFIG.deferredIdleMs;
      this.schedule();
      if (restoreFocus && this.editor.isConnected) this.editor.focus({ preventScroll: true });
    }
    pointer(event) {
      this.noticePointer = this.notice.contains(event.target);
      if (this.noticePointer) return;
      const pair = controls(this.root);
      if (!pair) return;
      if (pair.cancel.contains(event.target)) { this.cancel(); return; }
      if (this.root.contains(event.target)) {
        // Pause while selecting formatting controls (including portalled UI).
        if (!this.editor.contains(event.target)) {
          this.intentUntil = Date.now() + 750;
          this.clearSchedule();
        }
        return;
      }
      if (!event.target.closest(SELECTORS.overlay) && !overlayOpen(this.root)) this.save();
    }
    click(event) {
      // Hiding Cancel on pointerdown can retarget the eventual click to the
      // page underneath. It still belongs to the countdown, not a departure.
      if (this.noticePointer) { this.noticePointer = false; return; }
      if (this.notice.contains(event.target)) return;
      const pair = controls(this.root);
      if (!pair) return;
      if (pair.cancel.contains(event.target)) { this.cancel(); return; }
      if (pair.save.contains(event.target) && enabled(pair.save)) { this.beginSave(); return; }
      if (this.root.contains(event.target) || event.target.closest(SELECTORS.overlay)) {
        if (!this.editor.contains(event.target)) this.intentUntil = Date.now() + 750;
        this.schedule();
      } else if (!overlayOpen(this.root)) this.save();
    }
    cancel() {
      discarded.add(this.editor);
      this.destroy();
      controllers.delete(this.root);
    }
    beginSave() {
      if (this.saving || !this.dirty) return;
      this.clearSchedule();
      // Jira dismantles editor content during Save. End the preceding edit's
      // mutation window so teardown is not mistaken for newer user input.
      this.observer.takeRecords();
      this.intentUntil = 0;
      this.saving = true;
      this.failed = false;
      this.sentVersion = this.version;
      this.errorsBefore = new Set(document.querySelectorAll(SELECTORS.error));
      this.show('Saving…', 'saving');
      this.deadline = setTimeout(() => this.fail(), CONFIG.timeoutMs);
    }
    save() {
      if (!this.dirty || this.saving || this.failed || this.composing) return;
      if (!this.root.isConnected || location.href !== this.url) return;
      if (overlayOpen(this.root)) { this.schedule(); return; }
      const pair = controls(this.root);
      if (!pair || pair.editor !== this.editor || !enabled(pair.save)) {
        // Bounded wait: do not poll or click a disabled/ambiguous control.
        this.fail();
        return;
      }
      this.beginSave();
      pair.save.click();
    }
    fail() {
      this.clearSchedule();
      clearTimeout(this.deadline);
      clearTimeout(this.completion);
      this.completion = null;
      this.saving = false;
      this.failed = true;
      this.show('Save failed', 'failed');
    }
    check() {
      if (location.href !== this.url || !this.root.isConnected) {
        // Unmount/navigation is not evidence that a save succeeded.
        this.destroy();
        controllers.delete(this.root);
        return;
      }
      if (this.saving) {
        const error = [...document.querySelectorAll(SELECTORS.error)].some(el =>
          visible(el) && (!this.errorsBefore.has(el) || this.root.contains(el)));
        if (error) { this.fail(); return; }
        const editing = [...this.root.querySelectorAll(SELECTORS.editor)].some(visible);
        const hasSave = buttons(this.root).some(el => label(el) === 'save');
        if (!editing && !hasSave) {
          if (!this.completion) this.completion = setTimeout(() => {
            this.completion = null;
            if (!this.root.isConnected || location.href !== this.url) return;
            if ([...this.root.querySelectorAll(SELECTORS.editor)].some(visible) || buttons(this.root).some(el => label(el) === 'save')) return;
            if (this.version !== this.sentVersion) { this.fail(); return; }
            clearTimeout(this.deadline);
            this.dirty = false;
            this.saving = false;
            this.show('Saved', 'saved');
            this.hideTimer = setTimeout(() => { this.destroy(); controllers.delete(this.root); }, CONFIG.savedMs);
          }, CONFIG.settleMs);
        } else {
          clearTimeout(this.completion);
          this.completion = null;
        }
      } else if (!this.editor.isConnected || !visible(this.editor)) {
        // Keep the short Saved acknowledgement unless a new editor opens.
        if (this.status.dataset.state === 'saved' && !controls(this.root)) return;
        this.destroy();
        controllers.delete(this.root);
      }
    }
    destroy() {
      this.clearSchedule();
      for (const timer of [this.timer, this.deadline, this.hideTimer, this.completion]) clearTimeout(timer);
      this.abort.abort();
      this.observer.disconnect();
      this.status.remove();
      this.notice.remove();
    }
  }

  function fieldRoots() {
    const roots = [...document.querySelectorAll(SELECTORS.field)].filter(visible);
    // Current Jira swaps the read-view test ID out in edit mode. Start from
    // the exact Description label, then find its nearest single-field wrapper.
    // Do not climb past another field label or a form containing multiple editors.
    for (const heading of document.querySelectorAll(SELECTORS.descriptionLabel)) {
      let root = heading.parentElement;
      for (let depth = 0; root && depth < 8; depth++, root = root.parentElement) {
        if (root.querySelectorAll(SELECTORS.fieldLabel).length !== 1) break;
        if (root.querySelector(SELECTORS.editorContainer)) {
          if (visible(root) && root.querySelectorAll(SELECTORS.editorContainer).length === 1) roots.push(root);
          break;
        }
      }
    }
    return roots.filter(el => !roots.some(other => other !== el && el.contains(other)));
  }

  function reconcile() {
    for (const controller of controllers.values()) controller.check();
    // Nested Description wrappers represent one field: use the smallest one.
    for (const root of fieldRoots()) {
      if (controllers.has(root)) continue;
      const pair = controls(root);
      if (pair && !discarded.has(pair.editor)) controllers.set(root, new Editor(root, pair));
    }
  }
  let queued = false;
  const lifecycle = new MutationObserver(records => {
    // Do not observe our own status changes as Jira lifecycle events.
    if (records.every(record => record.target.nodeType === Node.ELEMENT_NODE && record.target.closest('.jda-status, .jda-countdown'))) return;
    if (!queued) {
      queued = true;
      queueMicrotask(() => { queued = false; reconcile(); });
    }
  });
  lifecycle.observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['contenteditable', 'hidden', 'aria-hidden', 'aria-invalid', 'disabled', 'aria-disabled'] });
  window.addEventListener('popstate', reconcile);
  window.addEventListener('hashchange', reconcile);
  reconcile();
})();
