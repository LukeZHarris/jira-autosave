# Sharing and store distribution

## GitHub preview

Release assets contain only `manifest.json`, the content script and stylesheet, four icons, the license and privacy policy. Users extract the ZIP and use **Load unpacked**. They keep the extracted folder and update it manually. Source downloads work too; no compilation is required.

Generate a release with `npm run package`. The adjacent `.sha256` file lets users verify their download, for example with `shasum -a 256 jira-description-autosave-0.3.2.zip` on macOS. The checksum is an integrity check, not a signature or security audit.

## Chrome Web Store later

A store listing makes installation and updates easier. It is not necessary for the GitHub preview. Before submitting:

- Complete the live acceptance checklist on current Chrome and Edge.
- Register a developer account and complete Google's account requirements.
- Upload the release ZIP with `manifest.json` at its root.
- Add the description, screenshots using non-sensitive demonstration data, icon and required promotional assets.
- Link the public privacy policy and accurately complete the single-purpose, permissions and privacy disclosures.
- Choose public or unlisted visibility, submit for review, and wait for approval.

Store submission, account registration and any fee payment are not part of this repository's automated release process. No Chrome Web Store or Edge Add-ons listing exists yet.

An Edge Add-ons listing can be prepared separately. Keep the extension ID, listing URLs and update behaviour documented when either store version is published. Do not advise ordinary users to install a self-hosted CRX as a substitute for a store listing; Chrome's supported distribution rules differ by platform and managed-device policy.

Primary references:

- [Chrome distribution options](https://developer.chrome.com/docs/extensions/how-to/distribute)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Chrome listing visibility](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Edge sideloading](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)
