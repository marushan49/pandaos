import argparse
import unittest
from unittest.mock import patch

import play_release


class FakePlay:
    def __init__(self, failures=()):
        self.failures = dict(failures)
        self.calls = []
        self.edits = 0

    def call(self, method, path, body=None, data=None, upload=False):
        self.calls.append((method, path))
        for key, error in self.failures.items():
            if key == (method, path.split('/')[-1]) or key == (method, path):
                raise error
        if path.endswith('/tracks') and method == 'GET':
            return dict(tracks=[dict(track='internal', releases=[dict(status='completed', versionCodes=['32'])])])
        if path.endswith('/bundles') and method == 'GET':
            return dict(bundles=[])
        if path.endswith('/bundles') and method == 'POST':
            return dict(versionCode=33)
        return {}

    def edit(self):
        self.edits += 1
        self.calls.append(('POST', '/edits'))
        return 'e%d' % self.edits

    def discard(self, edit):
        self.call('DELETE', '/edits/' + edit)


def args(**change):
    values = dict(aab='x.aab', package='app.example', track='internal', status='completed', notes=None,
                  language='de-DE', release_name=None, commit=False, allow_production=False)
    values.update(change)
    return argparse.Namespace(**values)


META = dict(package='app.example', version_code=33, version_name='1', certificates=[])


class PlayReleaseTests(unittest.TestCase):
    def run_upload(self, play, **change):
        with patch.object(play_release, 'inspect', return_value=META), \
                patch.object(play_release.Path, 'read_bytes', return_value=b'aab'):
            return play_release.upload(args(**change), play)

    def test_validation_discards_the_edit(self):
        play = FakePlay()
        result = self.run_upload(play)
        self.assertFalse(result['committed'])
        self.assertIn(('DELETE', '/edits/e1'), play.calls)
        self.assertNotIn(('POST', '/edits/e1:commit'), play.calls)

    def test_failed_validate_with_commit_discards_and_keeps_the_error(self):
        play = FakePlay({('POST', 'e1:validate'): RuntimeError('validate 400')})
        with self.assertRaisesRegex(RuntimeError, 'validate 400'):
            self.run_upload(play, commit=True)
        self.assertIn(('DELETE', '/edits/e1'), play.calls)
        self.assertNotIn(('POST', '/edits/e1:commit'), play.calls)

    def test_failed_discard_does_not_hide_the_original_error(self):
        play = FakePlay({('POST', 'e1:validate'): RuntimeError('validate 400'),
                         ('DELETE', 'e1'): RuntimeError('delete 503')})
        with self.assertRaisesRegex(RuntimeError, 'validate 400'):
            self.run_upload(play)

    def test_commit_success_survives_a_failed_readback(self):
        play = FakePlay({('GET', '/edits/e2/tracks'): RuntimeError('readback 503')})
        result = self.run_upload(play, commit=True)
        self.assertTrue(result['committed'])
        self.assertIn('readback 503', result['readback_error'])
        self.assertIn(('DELETE', '/edits/e2'), play.calls)
        self.assertNotIn(('DELETE', '/edits/e1'), play.calls)

    def test_used_version_code_is_refused_before_upload(self):
        play = FakePlay()
        with patch.object(play_release, 'inspect', return_value=dict(META, version_code=32)), \
                self.assertRaisesRegex(SystemExit, 'next is 33'):
            play_release.upload(args(), play)
        self.assertNotIn(('POST', '/edits/e1/bundles'), play.calls)
        self.assertIn(('DELETE', '/edits/e1'), play.calls)

    def test_production_needs_explicit_permission_and_stays_draft(self):
        with patch.object(play_release, 'inspect', return_value=META), self.assertRaises(SystemExit):
            play_release.upload(args(track='production'), FakePlay())
        result = self.run_upload(FakePlay(), track='production', allow_production=True)
        self.assertEqual(result['release']['status'], 'draft')


if __name__ == '__main__':
    unittest.main()
