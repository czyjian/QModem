#!/usr/bin/env python3
"""Run the real reboot RPC branch with harmless reboot stubs only.

Uses local sh and jshn by default. QMODEM_TEST_SSH may name an OpenWrt SSH
target with jshn installed; no actual modem command is called.
"""
import json
import os
from pathlib import Path
import shlex
import subprocess
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "application/qmodem/files/usr/libexec/rpcd/qmodem"
TEXT = SOURCE.read_text(encoding="utf-8")
BRANCH = TEXT.split("            do_reboot)\n", 1)[1].split("            send_at)", 1)[0]
BRANCH = BRANCH.rsplit(";;", 1)[0]


class RebootRpc(unittest.TestCase):
    def run_branch(self, method, branch=BRANCH):
        # Stub both operations, including hard reboot's soft-reboot fallback.
        script = """. /usr/share/libubox/jshn.sh
soft_reboot() { printf 'AT+CFUN=1,1\\r\\nOK\\r\\n'; }
hard_reboot() { soft_reboot; printf 'GPIO diagnostic\\n'; }
"""
        script += "input=" + shlex.quote(json.dumps({"params": {"method": method}})) + "\n"
        script += branch
        target = os.getenv("QMODEM_TEST_SSH")
        command = ["ssh", "-o", "BatchMode=yes", target, "sh"] if target else ["sh"]
        result = subprocess.run(command, input=script.encode("utf-8"), capture_output=True)
        result.stdout = result.stdout.decode("utf-8")
        result.stderr = result.stderr.decode("utf-8")
        return result

    def test_soft_response_is_only_json(self):
        result = self.run_branch("soft")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"result": {"status": "1", "method": "soft"}})
        self.assertIn("AT+CFUN=1,1", result.stderr)

    def test_hard_fallback_response_is_only_json(self):
        result = self.run_branch("hard")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["result"]["method"], "hard")
        self.assertIn("GPIO diagnostic", result.stderr)

    def test_invalid_method_does_not_reboot(self):
        result = self.run_branch("invalid")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertNotIn("AT+CFUN", result.stderr)

    def test_old_branch_contaminated_json(self):
        result = self.run_branch("soft", BRANCH.replace("soft_reboot >&2", "soft_reboot"))
        self.assertIn("AT+CFUN=1,1", result.stdout)
        with self.assertRaises(json.JSONDecodeError):
            json.loads(result.stdout)


if __name__ == "__main__":
    unittest.main()
