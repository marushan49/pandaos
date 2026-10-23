import time
import unittest
from unittest.mock import patch

import remote_worker
import scheduler


GIB = scheduler.GIB
TOOLS = dict(java_home='/jbr', android_sdk='/sdk', flutter='/flutter', node='/node', xcode='/xcode', pod='/pod')
SPEC = dict(enabled=True, ssh='macbook', node='/usr/local/bin/node',
            path_maps=[dict(local='/home/admin/projects', remote='/Users/mau/projects')], env={},
            memory_budget_gib=16, reserve_memory_gib=6, max_cores=8, max_running=2,
            snapshot_root='/Users/mau/.pandaos-worker/snapshots')


def mac(**change):
    probe = dict(platform='darwin', available_memory=30 * GIB, total_memory=48 * GIB, cores=18, load=1.0,
                 on_ac=True, battery=100, idle_seconds=900, tools=dict(TOOLS), sampled_at=time.time())
    probe.update(change)
    return probe


def job(name='j', klass='heavy', needs=('java_home', 'android_sdk'), darwin=False, portable=True,
        priority='normal', lock='/home/admin/projects/app', wall=300, state='queued'):
    return scheduler.Job(dict(id=name, sequence=1, state=state, worker='auto', klass=klass, priority=priority,
                              agent='agent-' + name, project='/home/admin/projects/app', cwd='/home/admin/projects/app',
                              lock=lock, command=['./gradlew', 'assembleDebug'], created=time.time(),
                              started=time.time() if state == 'running' else None,
                              estimate=dict(memory_gib=4, cores=4, wall=wall), needs=list(needs), darwin=darwin,
                              portable=portable, artifacts=[], timeout=600, queue_timeout=600, signature='s'))


class PlacementTests(unittest.TestCase):
    def setUp(self):
        self.patches = [patch.object(scheduler, 'meminfo', return_value={'MemAvailable': 40 * GIB}),
                        patch.object(scheduler, 'psi', return_value={})]
        for item in self.patches:
            item.start()
        self.instance = scheduler.Scheduler()
        self.instance.config['workers'] = dict(macbook=dict(SPEC))
        self.instance.log = lambda *args, **kwargs: None

    def tearDown(self):
        for item in self.patches:
            item.stop()

    def place(self, item):
        return self.instance.place(item, None)

    def busy_local(self):
        holder = job('holder', state='running')
        holder.worker = 'local'
        self.instance.jobs[holder.id] = holder

    def test_offline_mac_keeps_compatible_jobs_on_zotac(self):
        self.instance.workers['macbook'] = dict(error='worker probe unavailable')
        choice, reason, view = self.place(job())
        self.assertEqual(choice['worker'], 'local')
        self.assertEqual(next(c for c in view if c['worker'] == 'macbook')['blocked'], 'nicht erreichbar')

    def test_busy_zotac_and_free_mac_moves_android_build_to_mac(self):
        self.instance.workers['macbook'] = mac()
        self.busy_local()
        choice, reason, view = self.place(job())
        self.assertEqual(choice['worker'], 'macbook')

    def test_warm_zotac_keeps_build_when_both_are_free(self):
        self.instance.workers['macbook'] = mac()
        choice, _, _ = self.place(job())
        self.assertEqual(choice['worker'], 'local')

    def test_measured_faster_mac_wins_when_both_are_free(self):
        self.instance.workers['macbook'] = mac()
        item = job()
        sig = scheduler.signature(item.project + ':macbook', item.command)
        self.instance.history[sig].append(dict(wall=60, worker='macbook', project=item.project))
        self.instance.history['other'].append(dict(worker='macbook', project=item.project, sync_seconds=4))
        choice, _, view = self.place(item)
        self.assertEqual(choice['worker'], 'macbook')
        self.assertLess(choice['eta'], next(c for c in view if c['worker'] == 'local')['eta'])

    def test_ios_waits_for_mac_and_never_runs_on_zotac(self):
        self.instance.workers['macbook'] = dict(error='offline')
        choice, reason, _ = self.place(job(needs=['xcode'], darwin=True))
        self.assertIsNone(choice)
        self.assertEqual(reason, 'wartet auf Mac-Worker (iOS)')
        self.instance.workers['macbook'] = mac()
        choice, _, _ = self.place(job(needs=['xcode'], darwin=True))
        self.assertEqual(choice['worker'], 'macbook')

    def test_battery_protects_mac(self):
        self.busy_local()
        self.instance.workers['macbook'] = mac(on_ac=False, battery=80)
        choice, reason, _ = self.place(job())
        self.assertIsNone(choice)
        self.assertIn('local: gleicher Build-Ordner', reason)
        self.assertIn('macbook: Mac im Akkubetrieb', reason)
        self.assertEqual(self.instance.protect_worker(job(), 'macbook'), 'Mac im Akkubetrieb')
        self.assertIsNone(self.instance.protect_worker(job(darwin=True, needs=['xcode']), 'macbook'))
        self.instance.workers['macbook'] = mac(on_ac=False, battery=30)
        self.assertIn('Akku unter', self.instance.protect_worker(job(darwin=True, needs=['xcode']), 'macbook'))

    def test_active_mac_user_is_not_loaded_with_background_heavy_builds(self):
        self.instance.workers['macbook'] = mac(idle_seconds=5)
        self.assertEqual(self.instance.protect_worker(job(), 'macbook'), 'Mac wird gerade benutzt')
        self.assertIsNone(self.instance.protect_worker(job(priority='interactive'), 'macbook'))
        self.assertIsNone(self.instance.protect_worker(job(klass='medium'), 'macbook'))

    def test_missing_toolchain_and_light_jobs_stay_local(self):
        self.busy_local()
        self.instance.workers['macbook'] = mac(tools=dict(node='/node'))
        self.assertIn('Werkzeug fehlt', self.instance.compatible(job(), 'macbook'))
        self.instance.workers['macbook'] = mac()
        self.assertEqual(self.instance.compatible(job(klass='light', needs=['node']), 'macbook'),
                         'leichte Jobs bleiben lokal')
        self.assertIn('Snapshot', self.instance.compatible(job(portable=False), 'macbook'))

    def test_mac_capacity_limits_parallel_remote_jobs(self):
        self.busy_local()
        self.instance.workers['macbook'] = mac()
        for index in range(2):
            running = job('r%d' % index, state='running', lock='/remote/%d' % index)
            running.worker = 'macbook'
            self.instance.jobs[running.id] = running
        choice, reason, _ = self.place(job())
        self.assertIsNone(choice)

    def test_classification_of_ios_and_portable_commands(self):
        ios = scheduler.classify(['xcodebuild', '-scheme', 'App', 'build'], '/tmp', {})
        self.assertTrue(ios['darwin'])
        self.assertIn('xcode', ios['needs'])
        remote = scheduler.classify(['bash', '-c', 'ssh macbook xcodebuild -scheme App'], '/tmp', {})
        self.assertFalse(remote['darwin'])
        self.assertFalse(scheduler.classify(['./gradlew', 'assembleDebug'], '/tmp', {})['portable'])
        here = scheduler.classify(['python3', '-c', '1'], str(scheduler.Path(__file__).resolve().parents[2]), {})
        self.assertTrue(here['portable'])
        outside = scheduler.classify(['/home/admin/other/tool'], str(scheduler.Path(__file__).resolve().parents[2]), {})
        self.assertFalse(outside['portable'])

    def test_no_configured_worker_keeps_ios_commands_local(self):
        self.instance.config['workers'] = {}
        self.assertEqual(self.instance.worker_names(), [])

    def test_snapshot_mapping_isolated_per_project_and_maps_working_directory(self):
        first = remote_worker.snapshot_mapping(SPEC, '/home/admin/projects/app')
        second = remote_worker.snapshot_mapping(SPEC, '/home/admin/projects/.worktrees/app')
        self.assertNotEqual(first['remote'], second['remote'])
        self.assertTrue(first['remote'].startswith('/Users/mau/.pandaos-worker/snapshots/app-'))
        req = dict(command=['./gradlew', 'assembleDebug'], cwd='/home/admin/projects/app/android',
                   env=dict(SECRET='x', CI='1'))
        payload = remote_worker.prepare(req, remote_worker.with_mapping(SPEC, first), 'id', 60, 4)
        self.assertEqual(payload['cwd'], first['remote'] + '/android')
        self.assertNotIn('SECRET', payload['env'])
        with self.assertRaises(ValueError):
            remote_worker.snapshot_mapping(dict(SPEC, snapshot_root='relative'), '/home/admin/projects/app')

    def test_snapshot_excludes_secrets_and_platform_outputs(self):
        for pattern in ('.env', '*.keystore', '*.jks', 'key.properties', 'node_modules/', 'build/', 'Pods/', '/.git'):
            self.assertIn(pattern, remote_worker.SNAPSHOT_EXCLUDES)


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PlacementTests)
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
