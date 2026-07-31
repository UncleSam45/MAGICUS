import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SPEC = importlib.util.spec_from_file_location("magicus_bootstrapper", Path(__file__).parents[1] / "main.py")
bootstrapper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bootstrapper)


class BootstrapperTests(unittest.TestCase):
    def test_windows_runtime_is_used_when_npm_shim_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "node_modules" / "electron" / "dist" / "electron.exe"
            runtime.parent.mkdir(parents=True)
            runtime.touch()
            with mock.patch.object(bootstrapper, "PROJECT_DIR", root), mock.patch.object(bootstrapper.os, "name", "nt"):
                self.assertEqual(bootstrapper.electron_executable(), runtime)

    def test_main_stops_electron_before_dependency_check(self):
        events = []
        with (
            mock.patch.object(bootstrapper, "confirm_python_environment"),
            mock.patch.object(bootstrapper, "require_command", side_effect=["node", "npm"]),
            mock.patch.object(bootstrapper, "ensure_package_configuration"),
            mock.patch.object(bootstrapper, "stop_previous_instance", side_effect=lambda: events.append("stop")),
            mock.patch.object(bootstrapper, "ensure_node_dependencies", side_effect=lambda _npm: events.append("install") or Path("electron")),
            mock.patch.object(bootstrapper, "launch", return_value=0),
        ):
            self.assertEqual(bootstrapper.main(), 0)
        self.assertEqual(events, ["stop", "install"])

    def test_windows_shutdown_kills_the_complete_electron_process_tree(self):
        with (
            mock.patch.object(bootstrapper.os, "name", "nt"),
            mock.patch.object(bootstrapper.subprocess, "run") as run,
        ):
            bootstrapper.stop_process_tree(4172)
        self.assertEqual(run.call_args.args[0], ["taskkill", "/PID", "4172", "/T", "/F"])

    def test_windows_orphan_cleanup_is_limited_to_the_project_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "node_modules" / "electron" / "dist" / "electron.exe"
            runtime.parent.mkdir(parents=True)
            runtime.touch()
            with (
                mock.patch.object(bootstrapper, "PROJECT_DIR", root),
                mock.patch.object(bootstrapper.os, "name", "nt"),
                mock.patch.object(bootstrapper.subprocess, "run") as run,
            ):
                run.return_value.returncode = 0
                bootstrapper.stop_orphaned_project_electron()
        command = run.call_args.args[0]
        self.assertEqual(command[:3], ["powershell", "-NoProfile", "-Command"])
        self.assertIn(str(runtime.resolve()), command[3])


if __name__ == "__main__":
    unittest.main()
