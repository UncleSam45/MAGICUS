# MAGICUS

> **Development status: PRE-ALPHA PROTOTYPE**
>
> MAGICUS is an early, experimental prototype. Features, data formats, setup,
> and interface behavior may change or break without notice. It is not ready
> for production use, and important data should not be stored in it without an
> independent backup.

MAGICUS is a private desktop workspace for organizing creative projects, media,
and web tools. It combines an Electron desktop application with an optional
browser client and uses a private GitHub repository named `MAGICUS_BRIDGE` to
synchronize workspace metadata.

## Current capabilities

- Organize website shortcuts into named, draggable folders.
- Open shortcuts in dedicated always-on-top Electron windows.
- Create and reorder production projects.
- Add project descriptions, covers, and roadmap entries.
- Import images and videos into a local asset library.
- Assign the same local asset to multiple projects without duplicating it.
- Browse, filter, preview, and remove imported media.
- Synchronize folders, shortcuts, projects, and roadmap metadata through a
  private `MAGICUS_BRIDGE` GitHub repository.
- Optionally remember credentials using Electron's operating-system-backed
  `safeStorage` encryption.
- Keep the desktop process available through its system tray.

## Prototype limitations

- There are no stability, compatibility, migration, or data-retention
  guarantees.
- Automated tests cover selected behaviors, not the complete application.
- Workspace synchronization depends directly on GitHub availability and API
  behavior.
- Imported media does not synchronize between devices. Electron stores it under
  its local `userData/workspace/assets` directory; the browser uses IndexedDB.
- Opening `index.html` as a browser client requires network access to GitHub.
- The interface and workflows are still experimental and may be incomplete.

## Requirements

- Node.js with npm
- A desktop environment supported by Electron
- A GitHub access key that can access the authenticated account and its private
  repository named `MAGICUS_BRIDGE`

Python 3 is optional and is only needed when using the bootstrap launcher.

## Install and run

Install the Electron dependency and start the application:

```bash
npm install
npm start
```

Alternatively, the standard-library Python bootstrapper can check the local
runtime, install Electron when necessary, stop a previous MAGICUS instance, and
launch the application:

```bash
python main.py
```

At sign-in, enter a local display name and an access key authorized for the
account's private `MAGICUS_BRIDGE` repository. MAGICUS validates the key through
GitHub and clears it from the form unless **Remember me on this device** is
enabled.

## Data and synchronization

Workspace metadata is stored locally and synchronized after changes to:

```text
MAGICUS_BRIDGE/.magicus/workspace.json
```

The synchronized record includes folders, website shortcuts, projects, project
ordering, asset ID associations, roadmap entries, and synchronization metadata.
Media files remain local and are excluded from the bridge record.

On Electron, privileged filesystem, credential, window, and synchronization
operations run in the main process. The renderer uses the isolated preload
bridge and does not receive direct Node.js or filesystem access. The browser
client communicates with GitHub directly and stores local media in IndexedDB.

## Tests

Run the JavaScript and Python test suites:

```bash
npm test
python -m unittest discover -s test
```
