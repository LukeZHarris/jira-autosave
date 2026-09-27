# Validation

## Automated coverage

`npm test` exercises content.js with a DOM fixture and controlled timers. It covers debouncing, clean editors, native save/cancel, keyboard shortcuts, outside interactions, formatting mutations and popovers, selection decorations, IME composition, failures and retry limits, edits during save, ambiguous controls, duplicate initialization and lifecycle cleanup.

`npm run test:browser` loads the actual Manifest V3 extension into an isolated Playwright Chromium profile. Requests to `fixture.atlassian.net` are intercepted and fulfilled with `tests/fixture.html`; there is no Jira service behind the page. It covers direct and board-style URLs, successful native UI completion, Cancel, a link dialog, failure and SPA replacement. `docs/demo.png` is generated from this fixture.

Passing fixture tests proves the event/state handling and content-script packaging. It does not prove compatibility with every current Jira rollout or persistence to a real Jira server.

## Live Jira validation — 27 September 2026

Tested on a user-authorised disposable Jira Cloud issue in existing Chrome and Microsoft Edge sessions. The exact v0.1.0 runtime source was injected temporarily into isolated browser worlds; extension loading and packaging were separately tested in isolated Playwright Chromium and Microsoft Edge profiles. No live account data is included in this repository.

Confirmed on live Jira:

- Direct issue URL (including query parameters): typing produced Unsaved → Saving → Saved, one native Save click, and text persisted after loading the board view.
- Board URL with `selectedIssue`: the same status sequence and saved text persisted after a complete reload.
- Cancel with a pending debounce: no native Save click; discarded text absent from the rendered Description.
- Link popup: pending changes remained unsaved while open; dismissing the popup allowed the save to complete.
- Formatting-only edit: applying bold triggered a single save and rendered bold content.
- Board SPA close/reopen: editor discovery continued without reloading or reinjecting the script.
- Manual Save and Cmd+Enter: saved correctly without an automatic retry, and displayed Saved.
- Immediate departure: clicking the issue heading triggered a native Save before the idle timer.
- The original Description was restored and confirmed after reload; all temporary injected code was removed.

Live inspection found two differences from the initial synthetic model: edit mode replaces the read-view Description test ID, and Jira keeps an empty popup portal mounted. Both have regression coverage. A manual-save teardown mutation initially caused a false failure status; ending the preceding mutation window when saving fixes it, with tests for both teardown and genuine newer edits. Hidden attachment inputs are allowed without broadening discovery to custom fields.

Other Jira rollouts/languages, every rich-content type, and live network-failure/slow-save conditions have **not** been exhaustively validated. Failure, concurrency and navigation boundaries are additionally covered by synthetic tests. Treat this as a preview.

### Microsoft Edge follow-up

Tested Microsoft Edge **154.0.4258.37 on macOS** on the same date. All nine browser tests passed with the extension loaded into an isolated Edge profile, including native errors, Cancel, formatting popups, SPA replacement and manual-save teardown. Run this suite on macOS/Linux with Edge installed:

```sh
JDA_BROWSER_CHANNEL=msedge npm run test:browser
```

For PowerShell, set `$env:JDA_BROWSER_CHANNEL = 'msedge'` before `npm run test:browser`.

Live Edge checks also passed for direct issue URLs, board `selectedIssue` URLs, persistence after reload, Cancel, bold-only edits, link popups, manual Save, Cmd+Enter and board close/reopen without reinjection. Typed edits triggered one native Save approximately 1.51 seconds after the final input. Clicking outside triggered Save in under 0.5 seconds. The original Description and formatting were restored, and full navigation removed the temporary test code. Jira Autosave was not permanently installed into the user's profile.

The tested runtime matches the existing v0.1.0 release; no extension code changes were needed for Edge.

## Full acceptance checklist

Use only an explicitly disposable Jira issue. Test the final packaged version, in the browser profile where it is installed. Do not commit live Jira screenshots, browser profiles or customer DOM dumps.

- [x] Chrome: open `/browse/KEY`, edit Description, pause, observe Unsaved → Saving → Saved, reload and confirm persistence.
- [x] Board: open a URL with `?selectedIssue=KEY`, repeat the save and reload check.
- [x] Continue typing beyond 1.5 seconds; save only after the final pause.
- [x] Reopen Description after saving; a second edit saves once.
- [x] Manual Save and Ctrl/Cmd+Enter do not cause a duplicate automatic save.
- [x] Cancel before the timer fires; reload and confirm the draft was not saved.
- [ ] Bold, headings, lists, links, code, mentions and Jira rich content still behave normally.
- [x] Keep a link or formatting dialog open for several seconds; no premature save.
- [x] Click away immediately after typing; native Save is attempted.
- [ ] Switch issues within the board without a full reload; new editors work.
- [ ] Network/save failure shows Save failed, leaves Jira's error visible and never retries in a loop.
- [ ] Edits during a slow save are never reported as confirmed without a reliable UI completion signal.
- [x] Repeat core save, Cancel and formatting checks in Microsoft Edge.

## Selector maintenance

Field discovery uses an exact allowlist of Description test IDs, not arbitrary rich-text boxes or headings. Control labels are resolved within the smallest field wrapper, with exactly one visible editor and one Save/Cancel pair. Unknown or ambiguous markup is a no-op.

Before changing selectors, inspect both direct-issue and board-modal markup. Record only relevant tag/attribute structure without issue text. Add a synthetic regression fixture reproducing that structure. Never broaden discovery to every `contenteditable` or use a page-wide Save selector.
