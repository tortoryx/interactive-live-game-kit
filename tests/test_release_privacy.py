"""Release checks must also reject data outside the export manifest."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[1] / 'scripts/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleasePrivacyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'repo'
        self.root.mkdir()
        self.write('release-files.json', '{"files": ["README.md"]}')
        self.write('README.md', '# Example')
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.root_patch = patch.object(release, 'ROOT', self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.environment = patch.dict(os.environ, {'PRIVACY_DENYLIST_FILE': ''})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)

    def track(self, name):
        subprocess.run(['git', '-C', str(self.root), 'add', '--', name], check=True)

    def check(self):
        with contextlib.redirect_stdout(io.StringIO()):
            return release.check(['README.md'])

    def test_clean_release(self):
        self.assertEqual(self.check(), ['README.md'])

    def test_secret_in_tracked_file_outside_manifest(self):
        self.write('examples/new.mjs', 'sk-' + 'x' * 32)
        self.track('examples/new.mjs')
        with self.assertRaises(SystemExit):
            self.check()

    def test_tracked_database_is_rejected(self):
        self.write('examples/viewers.db', 'sample database')
        self.track('examples/viewers.db')
        with self.assertRaises(SystemExit):
            self.check()

    def test_private_identity_check_does_not_print_value(self):
        value = 'private-canary-identity'
        denylist = Path(self.tmp.name) / 'denylist.txt'
        denylist.write_text(value)
        os.environ['PRIVACY_DENYLIST_FILE'] = str(denylist)
        self.write('README.md', value)
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(SystemExit):
            release.check(['README.md'])
        self.assertNotIn(value, output.getvalue())
        self.assertIn('private identity match', output.getvalue())

    def test_private_denylist_cannot_be_inside_repository(self):
        self.write('private.txt', 'private-canary')
        os.environ['PRIVACY_DENYLIST_FILE'] = str(self.root / 'private.txt')
        with self.assertRaises(ValueError):
            self.check()

    def test_parent_symlink_is_rejected(self):
        target = Path(self.tmp.name) / 'outside'
        target.mkdir()
        (target / 'data.mjs').write_text('sample')
        (self.root / 'examples').symlink_to(target, target_is_directory=True)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            release.check(['examples/data.mjs'])


if __name__ == '__main__':
    unittest.main()
