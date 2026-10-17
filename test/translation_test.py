import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

spec = importlib.util.spec_from_file_location("offline_translate", Path(__file__).resolve().parents[1] / "scripts" / "translate.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TranslationTests(unittest.TestCase):
    def record(self):
        title, summary = "OpenAI launches GPT-6.1", "Costs USD 10 for API developers."
        return {"id": "a" * 24, "title": title, "summary": summary,
                "contentHash": hashlib.sha256((title + "\n" + summary).encode()).hexdigest()}

    def test_proper_names_versions_and_numbers_are_preserved(self):
        calls = []
        def infer(text):
            calls.append(text)
            return "中文翻译 " + text
        result = module.translate_text("OpenAI releases GPT-6.1 for 10 developers", infer)
        self.assertIn("OpenAI", result)
        self.assertIn("GPT-6.1", result)
        self.assertIn("10", result)
        self.assertEqual(len(calls), 1)
        self.assertIn("releases", calls[0])
        self.assertIn("for", calls[0])

    def test_exact_original_hash_attached_to_success(self):
        record = self.record()
        out = module.execute([record], lambda text: "中文翻译 " + text, "2026-10-17T00:00:00Z")
        entry = out["entries"][record["id"] + ":" + record["contentHash"]]
        self.assertEqual(entry["translation"]["sourceHash"], record["contentHash"])
        self.assertEqual(entry["translation"]["status"], "ok")
        self.assertIn("中文", entry["titleZh"])

    def test_failure_is_not_fabricated_chinese(self):
        record = self.record()
        out = module.execute([record], lambda text: (_ for _ in ()).throw(RuntimeError("offline")), "2026-10-17T00:00:00Z")
        self.assertEqual(out["entries"], {})
        self.assertEqual(len(out["errors"]), 1)

    def test_input_tampering_is_rejected_before_inference(self):
        record = self.record()
        record["summary"] = "tampered"
        with self.assertRaises(ValueError):
            module.validate_request(record)

    def test_unchanged_english_sentence_is_not_success(self):
        with self.assertRaises(ValueError):
            module.translate_text("A research study changes engineering", lambda text: text)

    def test_general_ai_terms_can_be_chinese_but_product_identity_and_numbers_must_survive(self):
        self.assertEqual(module.validate_output("AI agents improve latency", "智能体改善响应延迟"), "智能体改善响应延迟")
        self.assertIn("Amazon Bedrock AgentCore", module.validate_output("Use Amazon Bedrock AgentCore", "使用 Amazon 的 Bedrock AgentCore"))
        self.assertIn("Qwen2.5", module.product_names("Qwen2.5 improves coding"))
        with self.assertRaises(ValueError):
            module.validate_output("Use GPT-6.1 for 10 tasks", "使用 GPT-6.1 完成 100 项任务")

    def test_brand_aliases_are_source_conditioned_and_instruction_echo_or_added_training_is_rejected(self):
        self.assertEqual(module.validate_output("Use Amazon Bedrock AgentCore", "使用亚马逊Bedrock AgentCore"), "使用Amazon Bedrock AgentCore")
        self.assertEqual(module.validate_output("A Chinese company announcement", "亚马逊发布公告"), "亚马逊发布公告")
        with self.assertRaises(ValueError):
            module.validate_output("A news item", "必须原样保留这些名称：产品")
        with self.assertRaises(ValueError):
            module.validate_output("An open-weight model", "一个用于开放权重训练的模型")
        messages = module.make_messages("Introducing Reflection Beam: an open-weight model for agentic coding on AWS", "title")
        self.assertEqual(messages[1]["content"], "Reflection Beam is an open-weight model for agentic coding on AWS.")
        summary = "Reflection AI's Beam is an open-weight model for agentic coding and long-horizon tasks."
        self.assertEqual(module.make_messages(summary,"summary")[1]["content"], summary)

    def test_checkpoint_keeps_completed_records_and_budget_defers_remaining_records(self):
        first, second = self.record(), self.record()
        second["id"] = "b" * 24
        calls = [False, True]
        snapshots = []
        result = module.execute([first, second], lambda text: "中文翻译 " + text, "2026-10-17T00:00:00Z",
                                checkpoint=lambda state: snapshots.append(json.loads(json.dumps(state))),
                                should_stop=lambda: calls.pop(0))
        self.assertEqual(len(result["entries"]), 1)
        self.assertEqual(result["deferred"], 1)
        self.assertEqual(result["errors"], {})
        self.assertEqual(len(snapshots[-1]["entries"]), 1)


class BootstrapGuardTests(unittest.TestCase):
    def guard(self):
        workflow = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "update.yml"
        lines = workflow.read_text(encoding="utf-8").splitlines()
        start = next(i for i, line in enumerate(lines) if "# BEGIN BOOTSTRAP GUARD" in line)
        end = next(i for i, line in enumerate(lines) if "# END BOOTSTRAP GUARD" in line)
        return "\n".join(line[10:] for line in lines[start + 1:end]) + "\n"

    def run_guard(self, directory, members, expected=None):
        archive = Path(directory) / "bootstrap.zip"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(str(archive), "w", compression=zipfile.ZIP_DEFLATED) as handle:
                for name, body, mode in members:
                    entry = zipfile.ZipInfo(name)
                    entry.filename = name  # Keep raw backslash fixtures even when the host is Windows.
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    entry.create_system = 3
                    entry.external_attr = mode << 16
                    handle.writestr(entry, body)
        pinned = expected or hashlib.sha256(archive.read_bytes()).hexdigest()
        # The owner replaces the placeholder before publishing the workflow; fixtures also work after that freeze.
        code = re.sub(r"expected = '[^']+'", "expected = '%s'" % pinned, self.guard(), count=1)
        return subprocess.run([sys.executable, "-c", code], cwd=directory, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, universal_newlines=True)

    def test_valid_public_files_extract_and_bootstrap_remains_until_later_verification(self):
        with tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
            result = self.run_guard(directory, [("README.md", "public code", stat.S_IFREG | 0o644),
                                                 ("lib/core.cjs", "module.exports={};", stat.S_IFREG | 0o644),
                                                 ("data/current.json", "{}", stat.S_IFREG | 0o644)])
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((Path(directory) / "README.md").read_text(), "public code")
            self.assertTrue((Path(directory) / "bootstrap.zip").exists())

    def test_checksum_mismatch_does_not_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
            target = Path(directory) / "README.md"
            target.write_text("previous")
            result = self.run_guard(directory, [("README.md", "replacement", stat.S_IFREG | 0o644)], expected="0" * 64)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("SHA-256 mismatch", result.stderr)
            self.assertEqual(target.read_text(), "previous")

    def test_path_workflow_secret_and_non_ascii_members_are_rejected_before_any_write(self):
        for invalid in ("../README.md", "/data/current.json", "data/../README.md", "data\\current.json",
                        ".github/workflows/another.yml", "data/credentials.json", "node_modules/a.cjs",
                        ".work/input.json", "lib/.env.py", "data/中文.json"):
            with self.subTest(member=invalid), tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
                target = Path(directory) / "README.md"
                target.write_text("previous")
                result = self.run_guard(directory, [("README.md", "replacement", stat.S_IFREG | 0o644),
                                                     (invalid, "rejected", stat.S_IFREG | 0o644)])
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(target.read_text(), "previous")

    def test_symbolic_links_and_nonregular_entries_are_rejected(self):
        for mode in (stat.S_IFLNK | 0o777, stat.S_IFIFO | 0o644, stat.S_IFDIR | 0o755):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
                result = self.run_guard(directory, [("lib/link.cjs", "../../outside", mode)])
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((Path(directory) / "lib").exists())

    def test_duplicate_case_alias_and_file_directory_collision_are_rejected(self):
        combinations = (("lib/core.cjs", "lib/core.cjs"), ("lib/core.cjs", "lib/Core.cjs"),
                        ("lib/core.cjs", "lib/core.cjs/other.py"))
        for first, second in combinations:
            with self.subTest(second=second), tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
                result = self.run_guard(directory, [(first, "one", stat.S_IFREG | 0o644),
                                                     (second, "two", stat.S_IFREG | 0o644)])
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((Path(directory) / "lib").exists())

    def test_zip_bomb_member_and_member_count_limits_are_enforced(self):
        with tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
            result = self.run_guard(directory, [("data/current.json", b"0" * (8 * 1024 * 1024 + 1), stat.S_IFREG | 0o644)])
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("oversized", result.stderr)
        with tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
            result = self.run_guard(directory, [("lib/file%d.cjs" % n, "x", stat.S_IFREG | 0o644) for n in range(1001)])
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("member count", result.stderr)
        with tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
            result = self.run_guard(directory, [("data/archive/2026-%02d.json" % n,
                                                 b"0" * (8 * 1024 * 1024), stat.S_IFREG | 0o644) for n in range(1, 8)])
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("expanded size", result.stderr)

    def test_existing_destination_symlink_is_not_followed(self):
        with tempfile.TemporaryDirectory(prefix="skc-bootstrap-test-") as directory:
            outside = Path(directory) / "outside"
            outside.mkdir()
            try:
                os.symlink(str(outside), str(Path(directory) / "lib"), target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("Host does not allow creating a test symlink")
            result = self.run_guard(directory, [("lib/core.cjs", "rejected", stat.S_IFREG | 0o644)])
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((outside / "core.cjs").exists())


if __name__ == "__main__":
    unittest.main()
