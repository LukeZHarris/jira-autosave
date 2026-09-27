# Privacy

Jira Description Autosave runs locally on `https://*.atlassian.net/*`.

- No analytics, telemetry, advertising, accounts, backend, or network requests made by the extension.
- No Description content is read, serialized, transformed, logged, stored, or sent anywhere by the extension.
- It observes editor events and DOM structure, reads native button labels, and tracks unsaved state and timing in memory for the current tab.
- It clicks Jira's native Description Save button. Jira then performs its normal network request under your existing session and permissions. Atlassian's own privacy terms still apply to Jira.
- No browser storage, browsing-history, tabs, or webRequest permissions are requested. The static content-script match gives access only to Atlassian Cloud pages; matching pages outside the recognized Description field are left alone.
- Each tab acts independently. Closing the tab discards the extension's in-memory state.

Development tests use synthetic content. Live testing may use a separate local browser profile; profiles, credentials, Jira screenshots and live issue content are never part of the release package.

Questions or reports: https://github.com/lukezharris/jira-autosave/issues
