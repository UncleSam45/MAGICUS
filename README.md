# MAGICUS

MAGICUS is a private Electron creative studio. This update provides its cinematic
launch experience, secure access gate, and initial studio landing screen.

## Run

```bash
npm install
npm start
```

Enter a local display name and an access key authorized for the authenticated
account's private `MAGICUS_BRIDGE`. The key is passed through an isolated Electron
bridge for validation, cleared from the interface immediately, and is never stored.
