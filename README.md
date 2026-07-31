# MAGICUS

MAGICUS is a private Electron creative studio. Its main workspace provides
animated folders, persistent website shortcuts, dedicated app windows, and a
managed local photo and video library. The static renderer stays isolated from
filesystem access; all privileged operations pass through the preload bridge.
The main workspace and dedicated website windows use Electron's floating
always-on-top level so MAGICUS remains visible above standard desktop windows.

## Run

```bash
npm install
npm start
```

Enter a local display name and an access key authorized for the authenticated
account's private `MAGICUS_BRIDGE`. The key is passed through an isolated Electron
bridge for validation and cleared from the interface immediately unless the user
explicitly enables local credential storage.
Users can explicitly opt into **Remember me on this device**. In Electron, the
access key is encrypted with the operating system-backed `safeStorage` API before
being written locally; leaving the option unchecked removes any previously saved
credential. Folder order can be changed by dragging collections in the left rail
and is saved with the rest of the workspace.

Imported assets are copied into MAGICUS' Electron `userData/workspace/assets`
directory. Workspace configuration and the local media index remain available
offline and are structured for future `MAGICUS_BRIDGE` synchronization. Opening
`index.html` in a browser provides a browser-safe fallback using localStorage,
IndexedDB, and popup windows.

## Production board

Update 4 turns Home into a visual production board. Projects keep their name,
creation date, optional description and cover, ordering, and ordered asset ID
associations in the versioned workspace record. Dragging media onto a timeline
only records the existing library asset ID, so files are never copied and one
asset can belong to several projects. Albums provide playback, fullscreen media
viewing, filters, ordering, removal, and live image/video/duration statistics.
The persisted workspace includes local synchronization metadata reserved for a
future `MAGICUS_BRIDGE` provider.
