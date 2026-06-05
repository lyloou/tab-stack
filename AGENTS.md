# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

Tab Stack is a Chrome MV3 extension with no build step — all files are plain JS/HTML/CSS loaded directly by Chrome.

To test changes: go to `chrome://extensions`, enable Developer Mode, load the unpacked directory, and reload after edits.

## Architecture

Four files, no dependencies:

- **`manifest.json`** — MV3 config: permissions (`tabs`, `storage`, `activeTab`), keyboard commands (`push-domain`, `push-all`, `_execute_action`), and service worker declaration.
- **`background.js`** — Service worker. Owns all business logic and storage. Listens for keyboard commands (`chrome.commands.onCommand`) and popup messages (`chrome.runtime.onMessage`). Persists stacks to `chrome.storage.local` under key `tabStacks: { [hostname]: [{id, title, url, windowId}] }`.
- **`popup.html`** — Self-contained UI (inline CSS, Google Fonts). No external assets.
- **`popup.js`** — Popup logic. Communicates with background exclusively via `send(msg, data)` which wraps `chrome.runtime.sendMessage` with a 5-second timeout. Re-renders by calling `init()` or `renderAll()` after each mutation.

## Message Protocol

All messages from popup → background are objects `{ msg: string, ...data }`. Background checks `msg.msg === '...'`.

| `msg` | payload | effect |
|-------|---------|--------|
| `getDomains` | — | returns live tab groups by hostname |
| `getStacks` | — | returns saved stacks from storage |
| `pushCurrent` | — | stack current domain (smart: last tab also closes) |
| `pushDomain` | `{ domain }` | stack a specific domain |
| `pushAll` | — | stack all tabs except active |
| `restoreStack` | `{ domain }` | reopen all tabs for domain, remove from stack |
| `removeStackTab` | `{ domain, index }` | remove single entry from stack |
| `pushTabsToStack` | `{ domain, tabs }` | add explicit tab list to stack (used by undo) |
| `deleteStack` | `{ domain }` | delete entire saved stack |
| `renameStack` | `{ domain, newName }` | rename stack key (merges if newName exists) |

## Keyboard Shortcuts

Defined in `manifest.json` and handled in `background.js` `onCommand`:

| Shortcut | Command name | Handler |
|----------|-------------|---------|
| `⌥⇧W` | `push-domain` | `pushCurrentDomain()` |
| `⌥⇧A` | `push-all` | `pushAll()` |
| `⌥⇧T` | `_execute_action` | opens popup (Chrome built-in) |

Chrome only allows `Alt+Shift`, `Ctrl+Shift`, or `Command+Shift` modifier combos for extension shortcuts. `Command+Alt` is not supported.
