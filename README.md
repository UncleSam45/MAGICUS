# MAGICUS

MAGICUS is a private Electron creative studio. Its main workspace provides
animated folders, persistent website shortcuts, dedicated app windows, and a
managed local photo and video library. The static renderer stays isolated from
filesystem access; all privileged operations pass through the preload bridge.
Every Electron browser window uses the floating always-on-top level so the main
workspace, dedicated website windows, and any future windows remain visible
above standard desktop windows.

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

Workspace configuration is synchronized to `.magicus/workspace.json` in the
authenticated account's private `MAGICUS_BRIDGE` repository after every change
and downloaded at sign-in, so projects, folders, and shortcuts follow the user
between desktop and browser clients. Imported assets are intentionally excluded:
they remain in Electron's `userData/workspace/assets` directory or the browser's
IndexedDB. Opening `index.html` directly therefore requires network access to the
GitHub API for bridge authentication and workspace synchronization.

## Production board

Update 4 turns Home into a visual production board. Projects keep their name,
creation date, optional description and cover, ordering, and ordered asset ID
associations in the versioned workspace record. Dragging media onto a timeline
only records the existing library asset ID, so files are never copied and one
asset can belong to several projects. Albums provide playback, fullscreen media
viewing, filters, ordering, removal, and live image/video/duration statistics.
The persisted workspace includes local synchronization metadata reserved for a
future `MAGICUS_BRIDGE` provider.

The production board also retains the original folder and website-shortcut
workspace. Existing folders and apps are shown in **Creative Workspaces**, where
they can still be opened, created, edited, removed, and reordered.

Closing the main desktop window hides MAGICUS instead of ending the process.
Use the MAGICUS system-tray menu to reopen the command center or explicitly
quit the application.
