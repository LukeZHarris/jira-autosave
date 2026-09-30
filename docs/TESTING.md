# Validation

## Automated coverage

`npm test` exercises content.js with a DOM fixture and controlled timers. It covers the 10-second idle delay and 10-second countdown, typing and cursor-key resets, cancellation at expiry, the 30-second idle delay after cancellation, countdown cleanup, clean editors, native save/cancel, keyboard shortcuts, outside interactions, formatting mutations and popovers, selection decorations, IME composition, failures and retry limits, edits during save, ambiguous controls, duplicate initialization and lifecycle cleanup.

`npm run test:browser` loads the actual Manifest V3 extension into an isolated Playwright Chromium profile. Requests to `fixture.atlassian.net` are intercepted and fulfilled with `tests/fixture.html`; there is no Jira service behind the page. It covers direct and board-style URLs, successful native UI completion, pointer and keyboard countdown cancellation, focus preservation, the extended idle delay, native Cancel, a link dialog, failure and SPA replacement. `docs/demo.png` is generated from this fixture.

Passing fixture tests proves the event/state handling and content-script packaging. It does not prove compatibility with every current Jira rollout or persistence to a real Jira server.

## Centred fallback — 1 October 2026

Version 0.3.2 places the countdown in the centre of the visible window when the caret is offscreen or its geometry is unavailable. A visible caret still anchors the card beside the text. The card remains within the viewport after resizing and does not take focus.

All 32 state tests and the manifest/runtime checks passed. All 13 Chromium browser scenarios were validated locally: 12 passed in the full run, and the resize scenario passed on rerun after correcting the test to wait for the browser's resize event before measuring. Release CI runs the complete suite again. The ZIP and extracted runtime files were verified against the source. Formal live Jira acceptance of this version remains outstanding.

## Jira theme styling — 30 September 2026

Version 0.3.1 replaces the amber card with Jira's neutral overlay surface, text, border and shadow tokens, plus its blue primary-button tokens. Fallback colours cover pages without these tokens, including dark-mode surfaces. Timing and positioning logic are unchanged.

Manifest/runtime checks and three targeted Chromium browser checks passed: long-description/scroll/resize positioning, clipped-container/above-caret positioning, and the refreshed preview screenshot. The screenshot was visually inspected. The ZIP and extracted OneDrive folder were verified against the runtime files. The full behaviour suite was last run for v0.3.0 as recorded below; live Jira retesting of the theme is pending.

## Floating countdown — 30 September 2026

Version 0.3.0 moves the countdown into a floating amber card near the caret, with a Keep editing button. It flips above a low caret, falls back to the visible bottom-right corner when the caret is offscreen, and repositions on scroll or viewport resize. A manual popover keeps it above clipped or transformed containers without taking focus. Timing is unchanged from v0.2.0.

All 32 state tests, all 13 Chromium browser tests, and manifest/runtime checks passed. Browser coverage includes long descriptions, offscreen carets, narrow viewports, clipped containers, above-caret positioning, and pointer/keyboard Keep editing. The generated v0.3.0 ZIP and the extracted OneDrive folder were verified against the runtime files. Live Jira retesting is pending.

## Countdown update — 30 September 2026

Version 0.2.0 adds the 10-second idle delay, 10-second countdown and 30-second idle delay after cancellation. All 32 state tests and all 11 Chromium browser fixture tests passed, along with the manifest/runtime checks. Browser checks used the real countdown durations and verified pointer and keyboard cancellation, focus retention, the 30-second idle delay and a single subsequent save. The v0.2.0 ZIP was checked against the runtime files. The README screenshot is generated from the current synthetic fixture. Live Jira validation of this version is still outstanding; the results below apply only to v0.1.0.

For live acceptance, check countdown visibility while editing a long Description, typing to dismiss, pointer and keyboard cancellation without losing position, a full 30-second idle delay after cancelling, and exactly one native save when the next countdown expires. Recheck manual Save, native Cancel, formatting popups and direct/board URLs.

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

## Historical v0.1.0 acceptance checklist

These checkmarks record the original release only. For fresh validation, use only an explicitly disposable Jira issue. Test the final packaged version, in the browser profile where it is installed. Do not commit live Jira screenshots, browser profiles or customer DOM dumps.

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
