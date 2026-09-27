Here’s a concise implementation spec you can hand directly to Codex.

Jira Cloud Description Autosave — Browser Extension Spec

Goal

Build a small Manifest V3 browser extension for Chrome and Edge that improves Jira Cloud’s Description editing UX by automatically clicking Jira’s existing Save button after the user stops typing.

The extension must not use the Jira REST API, must not implement its own persistence layer, and must not transform Description content. Jira remains responsible for saving, validation, formatting, permissions, and error handling.

Supported browsers

* Google Chrome
* Microsoft Edge
* Chromium-based browsers should likely work, but only Chrome and Edge need to be considered supported.

Firefox support is explicitly out of scope.

Supported application

Jira Cloud only.

Expected host pattern:

https://*.atlassian.net/*

Do not target Jira Server/Data Center.

Core behaviour

When the Jira Description field enters edit mode:

1. Detect that the editor is open.
2. Detect meaningful user edits to the Description.
3. Mark the editor as having unsaved changes.
4. Display a small autosave status indicator.
5. After approximately 1.5 seconds of inactivity, trigger Jira’s existing Description Save button.
6. Display Saving….
7. Detect when Jira finishes leaving edit mode or otherwise confirms that the save completed.
8. Display Saved briefly, then hide or reduce the prominence of the indicator.

The extension should also attempt to save immediately when the user:

* clicks outside the Description editor;
* navigates elsewhere within Jira while the Description editor is dirty;
* switches to another issue through Jira’s SPA navigation.

Autosave must never repeatedly click Save when no changes have been made.

Status UI

Add a small unobtrusive status indicator associated with the Description editor.

States:

Unsaved changes…
Saving…
Saved
Save failed

Suggested behaviour:

* Unsaved changes… appears as soon as the Description changes.
* Saving… appears immediately before clicking Jira’s Save button.
* Saved appears after save completion and remains visible for around 1–2 seconds.
* Save failed remains visible until another save succeeds or the editor is closed.

Keep the visual design subtle and consistent with Jira.

The indicator must not obscure the editor, toolbar, Save button, Cancel button, or Jira notifications.

Save strategy

The extension must use Jira’s native Description Save control.

Do not:

* call Jira’s REST API;
* generate Atlassian Document Format;
* submit forms independently;
* modify Jira application state directly;
* attempt to save using undocumented internal APIs.

The extension should locate the correct Save button associated specifically with the currently active Description editor and programmatically trigger a normal click.

Do not accidentally click another Save button elsewhere on the page.

Change detection

Jira’s Description editor is a rich-text editor, so do not rely solely on ordinary <textarea> events.

Use a combination of whichever mechanisms prove reliable against Jira Cloud’s current DOM, for example:

* input
* beforeinput
* keyboard events where appropriate
* DOM MutationObserver
* contenteditable changes

Do not trigger autosave simply because Jira itself modifies editor DOM for selection changes, toolbar state, decorations, or other non-content changes.

Prefer detecting genuine content modification rather than arbitrary DOM mutation.

Debouncing

Default idle delay:

1500 ms

Every meaningful edit resets the timer.

Example:

User types
→ dirty
→ 1.5 second timer starts
User types again after 900 ms
→ timer resets
No input for 1.5 seconds
→ save

Only one save may be in progress at a time.

If the user edits again while a save is occurring:

1. allow the current save to complete;
2. keep the editor marked dirty for the newer changes if necessary;
3. schedule another save after the normal debounce period.

Avoid save loops.

Editor lifecycle

Jira Cloud behaves as a single-page application, so the extension must work across client-side navigation without requiring a full page reload.

Monitor for:

* issue changes;
* Description editor mounting/unmounting;
* opening Description edit mode;
* closing Description edit mode;
* Jira re-rendering/replacing relevant DOM elements.

Use a lightweight MutationObserver or equivalent.

Avoid repeatedly attaching duplicate event listeners.

Cleanup observers/listeners associated with editors that no longer exist.

Save completion detection

Do not assume that clicking Save means the save succeeded.

Prefer detecting completion based on Jira UI state, such as:

* the Description editor leaving edit mode;
* the native Save control disappearing;
* Jira rendering the saved Description view;
* another reliable DOM signal.

If Jira visibly reports an error or the editor remains open beyond a sensible period, change status to:

Save failed

Do not repeatedly hammer the Save button after failure.

A subsequent edit may allow the normal debounce/save process to try again.

Navigation and blur behaviour

When the editor contains unsaved changes and the user interacts outside it, attempt to save immediately rather than waiting for the debounce delay.

However:

* clicking Jira’s own Cancel button must not trigger autosave;
* clicking within the Description editor or its toolbar must not trigger blur-save;
* interactions needed by the rich-text editor, such as link dialogs or formatting popovers, must not accidentally save midway through the interaction.

Distinguish a genuine departure from the editor from interacting with editor-related UI.

Cancel behaviour

If the user explicitly clicks Jira’s native Cancel control:

* do not autosave;
* cancel pending debounce timers;
* clear extension dirty state for that editor;
* allow Jira’s native cancellation behaviour to proceed normally.

Never override explicit Cancel intent.

Keyboard behaviour

Do not interfere with Jira’s existing keyboard shortcuts.

In particular, native Jira save shortcuts such as Ctrl/Cmd+Enter should continue to function normally.

If the user manually saves before the debounce fires:

* detect it;
* cancel the pending timer;
* update status accordingly.

Multiple tabs

Each browser tab operates independently.

Do not introduce cross-tab coordination or synchronization in v1.

Jira’s existing local draft behaviour remains Jira’s responsibility.

Conflict detection

Server-side concurrency/conflict detection is explicitly out of scope for v1.

Rationale: the extension saves shortly after editing, substantially reducing the period in which an unsaved stale draft exists.

Do not implement Jira API reads or Description comparisons.

This could be added later if real-world usage shows it is necessary.

Settings

For v1, avoid building an options page unless implementation is trivial.

Hard-coded defaults are acceptable:

Autosave enabled: true
Idle delay: 1500 ms
Save on genuine editor departure: true

Structure the code so the delay can easily become configurable later.

An extension toolbar toggle for globally enabling/disabling autosave is optional, not required.

Permissions

Request the minimum permissions possible.

Expected permissions should be approximately:

{
  "host_permissions": [
    "https://*.atlassian.net/*"
  ]
}

Avoid broad permissions such as:

<all_urls>
tabs
webRequest
storage

unless they become genuinely necessary.

If no extension storage is needed, do not request the storage permission.

Privacy

The extension must:

* make no network requests of its own;
* send no telemetry;
* send no analytics;
* send no Jira content anywhere;
* store no Description content;
* have no backend service.

All functionality runs locally in the browser.

Jira itself performs its normal save request when its native Save button is clicked.

Architecture

Prefer a minimal structure such as:

jira-description-autosave/
├── manifest.json
├── content.js
├── content.css
├── icons/
│   ├── 16.png
│   ├── 32.png
│   ├── 48.png
│   └── 128.png
└── README.md

Avoid frameworks unless there is a compelling reason.

Plain JavaScript and CSS are preferred.

No build step should be required if reasonably possible.

Selector robustness

Jira Cloud’s DOM is implementation detail and can change.

Therefore:

* prefer semantic attributes such as aria-label, role, field labels, stable test IDs, or relationships between elements;
* avoid deeply nested CSS selectors;
* avoid selectors dependent on generated CSS class names;
* centralize Jira selectors in one clearly documented section of the source.

Example conceptual structure:

const selectors = {
  descriptionEditor: "...",
  saveButton: "...",
  cancelButton: "..."
};

If more than one Description-like editor exists, positively identify the issue Description field rather than operating on arbitrary rich-text editors.

Logging

Development builds may log useful diagnostic messages to the browser console.

Prefix messages clearly, e.g.:

[Jira Autosave]

Production behaviour should avoid excessive logging.

Never log Description contents.

Useful events to log during development include:

editor detected
editor dirty
autosave scheduled
autosave cancelled
save triggered
save completed
save failed
editor destroyed

Failure safety

The overriding rule is:

If uncertain whether a button is the correct Description Save button, do nothing.

A missed autosave is preferable to clicking the wrong Jira action.

Likewise, if the extension cannot confidently determine editor state, it should fall back to Jira’s normal behaviour.

The extension must never:

* delete content;
* press Cancel automatically;
* overwrite editor contents;
* synthesize replacement content;
* manipulate issue fields other than Description;
* submit unrelated Jira forms.

Acceptance criteria

The extension is considered usable when all of the following work reliably.

Normal typing

1. Open a Jira issue.
2. Edit Description.
3. Type some text.
4. Stop typing.
5. Unsaved changes… appears.
6. Approximately 1.5 seconds later, Jira’s native Save is triggered.
7. Status changes to Saving….
8. Jira completes the save.
9. Status changes to Saved.
10. Reloading the page shows the saved Description.

Continuous typing

Continuous typing must not cause repeated saves.

Saving occurs only once the user pauses for the debounce interval.

Edit after save

After an autosave completes, editing again should begin a new autosave cycle normally.

Manual save

If the user manually clicks Save before autosave occurs, the pending automatic save must be cancelled.

Cancel

If the user edits Description and then clicks Cancel, the extension must not save those edits.

Navigation

If the user edits Description and immediately navigates to another Jira issue, the extension should trigger a save before Jira destroys the editor where reasonably possible.

Formatting

Rich text including:

* headings;
* lists;
* links;
* bold/italic;
* code;
* mentions;
* Jira-specific rich content

must continue to work exactly as Jira normally handles it.

The extension must not inspect, transform, serialize, or recreate that content.

Failure

If Jira rejects or fails a save, the extension must show Save failed and must not enter a rapid retry loop.

SPA navigation

Moving between Jira issues without a full page refresh must continue to activate autosave on the newly opened issue.

Non-goals for v1

Do not implement:

* Jira REST API integration;
* OAuth/API tokens;
* ADF conversion;
* Description version history;
* merge/conflict resolution;
* multi-user collaboration;
* cross-tab synchronization;
* custom replacement editor;
* Firefox-specific support;
* Jira Server/Data Center support;
* configurable per-project settings;
* telemetry;
* cloud backend.

Suggested implementation order

1. Detect Jira Description edit mode reliably.
2. Identify the correct native Save and Cancel buttons.
3. Detect meaningful edits.
4. Implement dirty state and 1.5-second debounce.
5. Trigger native Save.
6. Detect successful completion.
7. Add the status indicator.
8. Handle manual Save and Cancel.
9. Handle Jira SPA navigation/editor recreation.
10. Add conservative outside-editor save behaviour.
11. Test edge cases and harden selectors.
12. Package for Chrome and Edge.

Product principle

The extension should feel as though Jira simply gained autosave.

There should be almost nothing for the user to learn or configure.

The ideal interaction is:

Edit Description
→ type normally
→ pause
→ Saved

The user should quickly stop thinking about the Save button at all.

For Codex, I’d give it this spec and tell it to prioritize selector robustness and conservative behaviour over cleverness. The riskiest part isn’t the autosave logic; it’s reliably identifying Jira’s current Description editor and its corresponding Save/Cancel controls.