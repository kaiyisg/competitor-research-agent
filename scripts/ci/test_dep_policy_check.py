import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dep_policy_check as d


def mk(files):
    t = tempfile.mkdtemp()
    for p, s in files.items():
        os.makedirs(os.path.dirname(os.path.join(t, p)), exist_ok=True)
        open(os.path.join(t, p), "w").write(s)
    return t


class T(unittest.TestCase):
    def test_specs(self):
        for s in ["1.2.3", "1.2.3-beta.1", "workspace:*", "npm:foo@1.0.0", "github:a/b#" + "a" * 40]:
            self.assertTrue(d.npm_spec_ok(s), s)
        for s in ["^1.2.3", "~1.2.3", "*", "latest", ">=1", "1.x", "github:a/b", "npm:foo@^1"]:
            self.assertFalse(d.npm_spec_ok(s), s)

    def test_py(self):
        self.assertTrue(d.py_req_ok("requests==2.32.3"))
        self.assertTrue(d.py_req_ok("# c"))
        self.assertFalse(d.py_req_ok("requests>=2"))
        self.assertFalse(d.py_req_ok("requests"))

    def test_npm_repo(self):
        pj = json.dumps({"dependencies": {"a": "1.0.0"}})
        self.assertEqual(d.static_checks(mk({"package.json": pj, "package-lock.json": "{}", ".npmrc": "min-release-age=7\n"}), 7), [])
        e = d.static_checks(mk({"package.json": pj}), 7)
        self.assertTrue(any("no lockfile" in x for x in e))
        e = d.static_checks(mk({"package.json": pj, "package-lock.json": "{}", ".npmrc": "min-release-age=3\n"}), 7)
        self.assertTrue(any("min-release-age" in x for x in e))

    def test_pnpm_and_uv(self):
        pj = json.dumps({"devDependencies": {"a": "1.0.0"}})
        ok = mk({"package.json": pj, "pnpm-lock.yaml": "", "pnpm-workspace.yaml": "minimumReleaseAge: 10080\n"})
        self.assertEqual(d.static_checks(ok, 7), [])
        bad = mk({"package.json": pj, "pnpm-lock.yaml": "", "pnpm-workspace.yaml": "packages: []\n"})
        self.assertTrue(any("minimumReleaseAge" in x for x in d.static_checks(bad, 7)))
        py = '[project]\nname="x"\ndependencies=["a==1.0"]\n[tool.uv]\nexclude-newer="7 days"\n'
        self.assertEqual(d.static_checks(mk({"pyproject.toml": py, "uv.lock": ""}), 7), [])

    def test_no_deps_passes(self):
        self.assertEqual(d.static_checks(mk({"package.json": json.dumps({"name": "x"})}), 7), [])

    def test_lock_entries(self):
        lock = json.dumps({"packages": {"": {}, "node_modules/a": {"version": "1.0.0"}, "node_modules/@s/b": {"version": "2.0.0"}}})
        self.assertEqual(d.lock_entries(lock, "package-lock.json"), {("a", "1.0.0", "npm"), ("@s/b", "2.0.0", "npm")})
        self.assertIn(("a", "1.2.3", "npm"), d.lock_entries("packages:\n\n  a@1.2.3:\n    resolution: {}\n", "pnpm-lock.yaml"))
        self.assertIn(("@s/b", "2.0.0", "npm"), d.lock_entries("packages:\n\n  '@s/b@2.0.0':\n", "pnpm-lock.yaml"))


if __name__ == "__main__":
    unittest.main()
