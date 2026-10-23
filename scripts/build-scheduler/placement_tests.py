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
                              portable=portable, artifacts=[], timeout=600, queue_timeout=600, signature='s',
                              measured=None, cache=None, exit=None, reason=None, finished=None))


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

    def test_similar_local_history_keeps_a_warm_zotac(self):
        self.instance.workers['macbook'] = mac()
        item = job()
        item.command = ['./gradlew', 'clean', 'assembleDebug', '--build-cache']
        item.estimate['wall'] = None
        self.instance.history['local-variant'].append(dict(wall=11, project=item.project, worker='local',
                                                           command='./gradlew clean assembleDebug --no-daemon'))
        self.instance.history['mac-variant'].append(dict(wall=13, project=item.project, worker='macbook',
                                                         command='./gradlew clean assembleDebug', sync_seconds=1))
        choice, _, view = self.place(item)
        self.assertEqual(choice['worker'], 'local')
        self.assertEqual(next(c for c in view if c['worker'] == 'local')['wall'], 11)

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
        self.assertTrue(reason.startswith('wartet auf Mac-Worker (iOS): macbook: nicht erreichbar'))
        self.instance.workers['macbook'] = mac()
        choice, _, _ = self.place(job(needs=['xcode'], darwin=True))
        self.assertEqual(choice['worker'], 'macbook')

    def test_ios_job_outside_a_project_is_rejected_instead_of_waiting(self):
        self.instance.workers['macbook'] = mac()
        choice, reason, _ = self.place(job(needs=['xcode'], darwin=True, portable=False))
        self.assertIsNone(choice)
        self.assertTrue(reason.startswith('PERMANENT: macbook: Projekt nicht als Snapshot'))

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

    def admit(self, command, directory):
        req = dict(command=command, env={}, cwd=directory, timeout=60, queue_timeout=60)
        with patch.object(scheduler, 'JOBS', scheduler.Path(directory)), patch.object(scheduler.os, 'chown'), \
                patch.object(scheduler.os, 'fchown'):
            self.instance.save = lambda: None
            return self.instance.admit(req, 1001)

    def test_ios_commands_wait_for_mac_only_when_a_worker_is_configured(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            self.instance.config['workers'] = {}
            with self.assertRaisesRegex(ValueError, 'macOS-Worker'):
                self.admit(['xcodebuild', '-version'], directory)
            self.instance.config['workers'] = dict(macbook=dict(SPEC))
            self.assertEqual(self.admit(['xcodebuild', '-version'], directory).worker, 'auto')
            self.assertEqual(self.admit(['bash', '-c', 'ssh macbook xcodebuild'], directory).worker, 'local')

    def test_automatic_placement_only_for_self_contained_builds(self):
        self.assertTrue(scheduler.self_contained(['android_sdk', 'java_home'], '/nonexistent', False))
        self.assertTrue(scheduler.self_contained(['flutter'], '/nonexistent', False))
        self.assertFalse(scheduler.self_contained(['node'], '/nonexistent', False))
        here = str(scheduler.Path(__file__).resolve().parents[2])
        self.assertFalse(scheduler.self_contained(['java_home'], here, False))
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            self.instance.config['auto_placement'] = True
            self.instance.config['workers'] = dict(macbook=dict(SPEC))
            self.assertEqual(self.admit(['npm', 'run', 'build'], here).worker, 'local')

    def test_pinned_remote_jobs_check_platform_and_tools(self):
        self.instance.workers['macbook'] = mac(platform='linux')
        self.assertEqual(self.instance.compatible(job(darwin=True, needs=['xcode']), 'macbook', pinned=True),
                         'kein macOS')
        self.instance.workers['macbook'] = mac(tools={})
        self.assertIn('Werkzeug fehlt', self.instance.compatible(job(), 'macbook', pinned=True))

    def test_auto_placement_needs_snapshot_root(self):
        self.instance.config['workers']['macbook'].pop('snapshot_root')
        self.instance.workers['macbook'] = mac()
        self.assertEqual(self.instance.compatible(job(), 'macbook'), 'kein snapshot_root konfiguriert')

    def test_auto_jobs_respect_the_remote_snapshot_lock(self):
        self.busy_local()
        self.instance.workers['macbook'] = mac()
        mapping = remote_worker.snapshot_mapping(SPEC, '/home/admin/projects/app')
        running = job('remote-running', state='running', lock=mapping['remote'])
        running.worker = 'macbook'
        self.instance.jobs[running.id] = running
        choice, reason, view = self.place(job('second'))
        self.assertIsNone(choice)
        self.assertIn('macbook: gleicher Build-Ordner wie', reason)

    def test_starving_auto_job_reserves_capacity_on_every_host(self):
        self.instance.workers['macbook'] = mac()
        starving = job('starving')
        newcomer = job('newcomer', lock='/home/admin/projects/other')
        choice, reason, _ = self.instance.place(newcomer, starving)
        self.assertIsNone(choice)
        self.assertIn('Vorrang für', reason)

    def test_waits_for_a_clearly_faster_busy_host(self):
        self.instance.workers['macbook'] = mac()
        item = job(wall=600)
        sig = scheduler.signature(item.project + ':macbook', item.command)
        self.instance.history[sig].append(dict(wall=60, worker='macbook', project=item.project))
        self.instance.history['other'].append(dict(worker='macbook', project=item.project, sync_seconds=5))
        for index in range(2):
            running = job('r%d' % index, state='running', lock='/remote/%d' % index, wall=40)
            running.worker = 'macbook'
            running.started = time.time() - 30
            self.instance.jobs[running.id] = running
        choice, reason, _ = self.place(item)
        self.assertIsNone(choice)
        self.assertIn('wartet auf schnelleren Host macbook', reason)

    def test_unconfirmed_start_is_requeued_and_confirmed_start_adopted(self):
        import asyncio
        import tempfile
        with tempfile.TemporaryDirectory() as directory, patch.object(scheduler, 'JOBS', scheduler.Path(directory)), \
                patch.object(scheduler.asyncio, 'sleep', return_value=None):
            lost, alive = job('lost', state='running'), job('alive', state='running')
            lost.state = alive.state = 'starting'
            self.instance.jobs.update(lost=lost, alive=alive)

            async def unit_state(item):
                return dict(LoadState='loaded' if item.id == 'alive' else 'not-found')

            async def control(*args):
                return 0, '', ''

            self.instance.unit_state = unit_state
            self.instance.control = control
            asyncio.run(self.instance.adopt())
            self.assertEqual((lost.state, lost.started), ('queued', None))
            self.assertEqual(alive.state, 'running')

    def test_waiting_ios_job_does_not_reserve_the_zotac(self):
        self.instance.workers['macbook'] = dict(error='offline')
        ios = job('ios', needs=['xcode'], darwin=True)
        self.assertFalse(self.instance.reserves(ios, 'local'))
        choice, reason, _ = self.instance.place(job('android', lock='/home/admin/projects/other'), ios)
        self.assertEqual(choice['worker'], 'local')

    def test_remote_candidate_uses_the_worker_measurements(self):
        self.instance.workers['macbook'] = mac()
        item = job()
        sig = scheduler.signature(item.project + ':macbook', item.command)
        self.instance.history[sig].append(dict(wall=100, cpu_seconds=200, peak_memory=10 * GIB))
        estimate = self.instance.remote_estimate(item, 'macbook')
        self.assertGreater(estimate['memory_gib'], 11)
        self.assertEqual(estimate['wall'], 100)

    def start_with(self, spawn, cancel_during=False):
        import asyncio
        import tempfile
        item = job()
        item.timeout = 60
        item.decision = dict(why='test', capacity={})
        self.instance.save = lambda: None
        self.instance.notify = lambda *a, **k: asyncio.sleep(0)
        controls = []

        async def control(*args):
            controls.append(args)
            return 0, '', ''

        self.instance.control = control
        with tempfile.TemporaryDirectory() as directory, patch.object(scheduler, 'JOBS', scheduler.Path(directory)), \
                patch.object(scheduler.asyncio, 'create_subprocess_exec', spawn):
            item.directory.mkdir()
            asyncio.run(self.instance.start(item))
        return item, controls

    def test_spawn_failure_finishes_the_job(self):
        async def spawn(*args, **kwargs):
            raise OSError(24, 'Too many open files')

        item, _ = self.start_with(spawn)
        self.assertEqual((item.state, item.exit, item.reason), ('finished', 125, 'queue execution failed: spawn'))

    def test_cancel_during_start_is_not_overwritten(self):
        instance = self.instance

        class Process:
            returncode = 0

            async def communicate(self):
                item.state = 'finished'
                item.exit = 130
                return b'', b''

        async def spawn(*args, **kwargs):
            return Process()

        item = None
        original = instance.assign_sccache_port

        def capture(job_):
            nonlocal item
            item = job_
            original(job_)

        instance.assign_sccache_port = capture
        result, controls = self.start_with(spawn)
        self.assertEqual((result.state, result.exit), ('finished', 130))
        self.assertIn(('stop', result.unit), controls)

    def test_sccache_ports_are_unique_among_running_jobs(self):
        first, second = job('a', state='running'), job('b', state='running')
        self.instance.jobs.update(a=first, b=second)
        import tempfile
        with tempfile.TemporaryDirectory() as directory, patch.object(scheduler, 'JOBS', scheduler.Path(directory)):
            self.instance.assign_sccache_port(first)
            self.instance.assign_sccache_port(second)
        self.assertNotEqual(first.sccache_port, second.sccache_port)

    def test_bind_moves_history_to_the_chosen_worker(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as directory, patch.object(scheduler, 'JOBS', scheduler.Path(directory)), \
                patch.object(scheduler, 'atomic_write'):
            self.instance.workers['macbook'] = mac()
            item = job()
            item.directory.mkdir()
            (item.directory / 'request.json').write_text(json.dumps(dict(command=item.command, env={}, cwd=item.cwd)))
            import asyncio
            asyncio.run(self.instance.bind(item, dict(worker='macbook', eta=100), []))
            self.assertEqual(item.worker, 'macbook')
            self.assertEqual(item.signature, scheduler.signature(item.project + ':macbook', item.command))
            self.assertTrue(item.lock.startswith('/Users/mau/.pandaos-worker/snapshots/app-'))

    def test_running_state_is_saved_before_the_unit_starts(self):
        import asyncio
        import tempfile
        saved = []
        item = job()
        item.timeout = 60
        self.instance.save = lambda: saved.append(item.state)

        class Process:
            returncode = 0

            async def communicate(self):
                return b'', b''

        async def spawn(*args, **kwargs):
            self.assertEqual(saved, ['starting'])
            return Process()

        with tempfile.TemporaryDirectory() as directory, patch.object(scheduler, 'JOBS', scheduler.Path(directory)), \
                patch.object(scheduler.asyncio, 'create_subprocess_exec', spawn):
            item.decision = dict(why='test', capacity={})
            asyncio.run(self.instance.start(item))
        self.assertEqual(item.state, 'running')

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
        for pattern in ('.env', '*.keystore', '*.jks', 'key.properties', 'node_modules/', 'build/', 'Pods/', '/.git',
                        '.npmrc', '*.pem', '*.p8', '.netrc', '*service-account*.json', 'keystore.properties'):
            self.assertIn(pattern, remote_worker.SNAPSHOT_EXCLUDES)


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PlacementTests)
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
