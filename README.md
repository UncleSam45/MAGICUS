# MAGICUS

MAGICUS is a private Electron creative studio. Its main workspace provides
animated folders, persistent website shortcuts, dedicated app windows, and a
managed local photo and video library. The static renderer stays isolated from
filesystem access; all privileged operations pass through the preload bridge.

## Run

```bash
npm install
npm start
```

Enter a local display name and an access key authorized for the authenticated
account's private `MAGICUS_BRIDGE`. The key is passed through an isolated Electron
bridge for validation, cleared from the interface immediately, and is never stored.

Imported assets are copied into MAGICUS' Electron `userData/workspace/assets`
directory. Workspace configuration and the local media index remain available
offline and are structured for future `MAGICUS_BRIDGE` synchronization. Opening
`index.html` in a browser provides a browser-safe fallback using localStorage,
IndexedDB, and popup windows.
