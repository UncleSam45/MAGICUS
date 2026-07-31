"""MAGICUS bootstrapper.

This file deliberately uses only the Python standard library so a fresh checkout
can prepare and launch the desktop application with ``python main.py``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import uuid


APP_NAME = "MAGICUS"
APP_MARKER = "--magicus-instance"
PROJECT_DIR = Path(__file__).resolve().parent
PID_FILE = PROJECT_DIR / ".magicus.pid"
PACKAGE_FILE = PROJECT_DIR / "package.json"


def log(message: str) -> None:
    print(f"[{APP_NAME}] {message}", flush=True)


def in_virtual_environment() -> bool:
    return sys.prefix != getattr(sys, "base_prefix", sys.prefix) or bool(
        os.environ.get("VIRTUAL_ENV")
    )


def confirm_python_environment() -> None:
    """Report the interpreter in use.

    The bootstrapper has no third-party Python dependencies. Requiring or
    silently replacing the caller's environment would therefore add risk with
    no benefit; an active virtual environment is detected and clearly reported.
    """
    environment = "virtual environment" if in_virtual_environment() else "system environment"
    log(f"Python {sys.version_info.major}.{sys.version_info.minor} ({environment}): {sys.executable}")
    log("Python dependencies are satisfied (standard library only).")


def require_command(command: str, friendly_name: str) -> str:
    executable = shutil.which(command)
    if not executable:
        raise RuntimeError(
            f"{friendly_name} was not found on PATH. Install Node.js (including npm) "
            "and run this command again."
        )
    version = subprocess.run(
        [executable, "--version"], capture_output=True, text=True, check=True
    ).stdout.strip()
    log(f"Found {friendly_name} {version}.")
    return executable


def ensure_package_configuration() -> None:
    if PACKAGE_FILE.exists():
        log("Using existing package.json.")
        return

    package = {
        "name": "magicus",
        "version": "0.1.0",
        "private": True,
        "description": "MAGICUS private creative studio",
        "main": "main.js",
        "scripts": {"start": "electron ."},
        "devDependencies": {"electron": "^37.2.4"},
    }
    PACKAGE_FILE.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
    log("Created package.json.")


def electron_executable() -> Path:
    shim_name = "electron.cmd" if os.name == "nt" else "electron"
    shim = PROJECT_DIR / "node_modules" / ".bin" / shim_name
    runtime_name = "electron.exe" if os.name == "nt" else "electron"
    runtime = PROJECT_DIR / "node_modules" / "electron" / "dist" / runtime_name
    return shim if shim.exists() else runtime


def ensure_node_dependencies(npm: str) -> Path:
    executable = electron_executable()
    installed_manifest = PROJECT_DIR / "node_modules" / "electron" / "package.json"
    if executable.exists() and installed_manifest.exists():
        log("Electron is already installed; skipping npm install.")
        return executable

    log("Installing Electron dependencies (this may take a moment on first launch)...")
    command = [npm, "ci" if (PROJECT_DIR / "package-lock.json").exists() else "install"]
    subprocess.run(command, cwd=PROJECT_DIR, check=True)
    if not executable.exists():
        raise RuntimeError("npm completed, but the Electron executable was not created.")
    log("Electron dependencies installed successfully.")
    return executable


def process_command(pid: int) -> str:
    if sys.platform.startswith("linux"):
        try:
            return Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode(
                errors="replace"
            )
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            return ""
    try:
        if os.name == "nt":
            result = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    f"(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine",
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
        else:
            result = subprocess.run(
                ["ps", "-p", str(pid), "-o", "command="],
                capture_output=True,
                text=True,
                timeout=5,
            )
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def stop_previous_instance() -> None:
    if not PID_FILE.exists():
        log("No previous MAGICUS instance found.")
        return
    try:
        record = json.loads(PID_FILE.read_text(encoding="utf-8"))
        pid = int(record["pid"])
        marker = str(record["marker"])
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        log("Discarding an invalid stale instance file.")
        PID_FILE.unlink(missing_ok=True)
        return

    command = process_command(pid)
    expected_argument = f"{APP_MARKER}={marker}"
    if not command or expected_argument not in command:
        log("Discarding a stale instance file; its process is no longer active.")
        PID_FILE.unlink(missing_ok=True)
        return

    log(f"Stopping the previous MAGICUS instance (PID {pid})...")
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and process_command(pid):
                time.sleep(0.1)
            if process_command(pid):
                os.killpg(os.getpgid(pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    PID_FILE.unlink(missing_ok=True)
    log("Previous instance stopped.")


def launch(electron: Path) -> int:
    marker = uuid.uuid4().hex
    argument = f"{APP_MARKER}={marker}"
    log("Launching the desktop application...")
    process = subprocess.Popen(
        [str(electron), ".", argument],
        cwd=PROJECT_DIR,
        start_new_session=(os.name != "nt"),
    )
    PID_FILE.write_text(
        json.dumps({"pid": process.pid, "marker": marker}), encoding="utf-8"
    )
    try:
        return process.wait()
    except KeyboardInterrupt:
        log("Shutdown requested.")
        if os.name == "nt":
            process.terminate()
        else:
            os.killpg(process.pid, signal.SIGTERM)
        return process.wait()
    finally:
        try:
            current = json.loads(PID_FILE.read_text(encoding="utf-8"))
            if current.get("marker") == marker:
                PID_FILE.unlink(missing_ok=True)
        except (OSError, json.JSONDecodeError):
            pass


def main() -> int:
    log(f"Project directory: {PROJECT_DIR}")
    try:
        confirm_python_environment()
        require_command("node", "Node.js")
        npm = require_command("npm", "npm")
        ensure_package_configuration()
        stop_previous_instance()
        # Stop our running Electron process before npm is allowed to inspect or
        # repair node_modules. Windows locks Electron's icudtl.dat while in use.
        electron = ensure_node_dependencies(npm)
        exit_code = launch(electron)
        log("Application closed cleanly.")
        return exit_code
    except (RuntimeError, subprocess.CalledProcessError) as error:
        log(f"ERROR: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
