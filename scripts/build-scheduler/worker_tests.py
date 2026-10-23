import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import remote_worker
import scheduler


SOURCE = Path(__file__).resolve().parent
SPEC = dict(enabled=True, ssh='macbook', node='/usr/local/bin/node', path_maps=[
    dict(local='/home/admin/projects', remote='/Users/mau/projects')], env=dict(PATH='/usr/local/bin:/usr/bin:/bin'),
    memory_budget_gib=4, reserve_memory_gib=4, max_cores=2, max_running=1)


class WorkerTests(unittest.TestCase):
    def test_optional_worker_requires_explicit_enabled_configuration(self):
        for config, name in [({}, 'macbook'), ({'workers': {'macbook': dict(SPEC, enabled=False)}}, 'macbook'),
                             ({'workers': {'macbook': SPEC}}, []), ({}, 'local')]:
            with self.assertRaises(ValueError):
                remote_worker.worker_config(config, name)

    def test_worker_configuration_rejects_shell_targets_and_invalid_budgets(self):
        for change in [dict(ssh='-oProxyCommand=bad'), dict(max_cores=float('nan')), dict(max_running=0),
                       dict(path_maps=[dict(local='/home/admin/../root', remote='/tmp')])]:
            with self.assertRaises(ValueError):
                remote_worker.worker_config({'workers': {'macbook': dict(SPEC, **change)}}, 'macbook')

    def test_mappings_cover_different_projects_and_nested_roots(self):
        self.assertEqual(remote_worker.map_path('/home/admin/projects/a/src', SPEC), '/Users/mau/projects/a/src')
        self.assertEqual(remote_worker.map_path('/home/admin/projects/b', SPEC), '/Users/mau/projects/b')
        spec = dict(SPEC, path_maps=SPEC['path_maps'] + [dict(local='/home/admin/projects/a', remote='/tmp/a')])
        self.assertEqual(remote_worker.map_path('/home/admin/projects/a/src', spec), '/tmp/a/src')
        for path in ['/home/admin/projects-other', '/home/admin/projects/a/../b', '/etc/passwd']:
            with self.assertRaises(ValueError):
                remote_worker.map_path(path, SPEC)

    def test_remote_environment_does_not_forward_credentials_or_linux_sdk(self):
        req = dict(command=['node', '/home/admin/projects/a/a.js', '--config=/home/admin/projects/a/config'],
                   cwd='/home/admin/projects/a', env=dict(CI='1', HOME='/root', PATH='/linux/bin',
                   JAVA_HOME='/linux/java', ANDROID_HOME='/linux/sdk', SECRET='do-not-forward'))
        payload = remote_worker.prepare(req, SPEC, 'abc', 30, 2)
        self.assertEqual(payload['command'], ['node', '/Users/mau/projects/a/a.js', '--config=/Users/mau/projects/a/config'])
        self.assertEqual(payload['env']['PATH'], SPEC['env']['PATH'])
        self.assertEqual(payload['env']['CI'], '1')
        for key in ('HOME', 'JAVA_HOME', 'ANDROID_HOME', 'SECRET'):
            self.assertNotIn(key, payload['env'])

    def test_existing_jobs_default_to_local(self):
        self.assertEqual(scheduler.Job(dict(id='a')).worker, 'local')
        self.assertEqual(scheduler.DEFAULTS.get('workers', {}), {})

    def test_remote_reservation_and_offline_admission(self):
        instance = scheduler.Scheduler()
        instance.config['workers'] = dict(macbook=SPEC)
        instance.workers['macbook'] = dict(available_memory=12 * scheduler.GIB, cores=8, load=0, sampled_at=time.time())
        job = scheduler.Job(dict(id='remote', worker='macbook', state='queued', started=None, created=time.time(),
                                klass='light', estimate=dict(memory_gib=1, cores=1), lock='p', agent='a', priority='normal'))
        snap = instance.snapshot('macbook')
        self.assertIsNone(instance.blocker(job, snap, None))
        instance.workers['macbook']['sampled_at'] = 0
        self.assertIn('nicht erreichbar', instance.blocker(job, instance.snapshot('macbook'), None))
        instance.workers['macbook']['sampled_at'] = time.time()
        job.state = 'running'
        instance.jobs['remote'] = job
        second = scheduler.Job(dict(job.__dict__, id='second', state='queued'))
        self.assertIn('Parallel-Limit', instance.blocker(second, instance.snapshot('macbook'), None))
        self.assertEqual(instance.snapshot()['running'], [])
        instance.config['workers'] = {}
        self.assertIn('nicht erreichbar', instance.blocker(second, instance.snapshot('macbook'), None))

    def test_new_remote_jobs_reserve_memory_against_cached_probe(self):
        instance = scheduler.Scheduler()
        instance.config['workers'] = dict(macbook=SPEC)
        instance.workers['macbook'] = dict(available_memory=12 * scheduler.GIB, cores=8, load=0,
                                          sampled_at=time.time() - 5)
        job = scheduler.Job(dict(id='remote', worker='macbook', state='running', started=time.time() - 1,
                                estimate=dict(memory_gib=3, cores=1)))
        job.memory = scheduler.GIB
        instance.jobs[job.id] = job
        self.assertEqual(instance.snapshot('macbook')['free'], 5 * scheduler.GIB)

    def test_unreachable_worker_does_not_block_local_admission_reaping_or_queue_timeout(self):
        async def scenario(directory):
            instance = scheduler.Scheduler()
            instance.config['workers'] = dict(macbook=SPEC)
            instance.log = lambda *args, **kwargs: None
            instance.save = lambda: None
            release = asyncio.Event()
            probe_started = asyncio.Event()
            launched = []

            async def unreachable(*args):
                probe_started.set()
                await release.wait()
                raise OSError('unreachable worker')

            def job(name, worker, sequence, created=None):
                return scheduler.Job(dict(id=name, worker=worker, sequence=sequence, state='queued',
                    started=None, finished=None, exit=None, reason=None, created=created or time.time(),
                    klass='light', estimate=dict(memory_gib=.01, cores=.01), lock=name, agent='a',
                    priority='interactive', project=directory, cwd=directory, command=['node'],
                    timeout=60, queue_timeout=60, detach=True, cargo=False, gradle=False, cache=None, measured=None))

            async def launch(local):
                launched.append(local.id)
                local.state = 'running'
                local.started = time.time()
                out = local.directory / 'out'
                out.mkdir(parents=True)
                (out / 'result.json').write_text(json.dumps(dict(exit=0, wall=.01, time=time.time())))

            local = job('local', 'local', 1)
            expired = job('expired', 'local', 2, time.time() - 120)
            remote = job('remote', 'macbook', 3)
            instance.jobs.update((j.id, j) for j in (local, expired, remote))
            instance.start = launch
            with patch.object(remote_worker, 'probe', unreachable):
                try:
                    await asyncio.wait_for(instance.schedule(), 1)
                    await asyncio.wait_for(probe_started.wait(), 1)
                    self.assertEqual(launched, ['local'])
                    self.assertEqual(expired.exit, 124)
                    self.assertFalse(instance.worker_probe_tasks['macbook'].done())
                    await asyncio.wait_for(instance.reap(), 1)
                    self.assertEqual(local.state, 'finished')
                    self.assertEqual(local.exit, 0)
                    self.assertEqual(remote.state, 'queued')
                finally:
                    release.set()
                    await asyncio.gather(*instance.worker_probe_tasks.values())
            self.assertIn('error', instance.workers['macbook'])

        with tempfile.TemporaryDirectory() as directory, patch.object(scheduler, 'JOBS', Path(directory)), \
                patch.object(scheduler, 'meminfo', return_value={'MemAvailable': 64 * scheduler.GIB}), \
                patch.object(scheduler, 'psi', return_value={}):
            asyncio.run(scenario(directory))

    def test_concurrent_probe_requests_share_and_wait_for_one_bounded_task(self):
        async def scenario():
            instance = scheduler.Scheduler()
            instance.config['workers'] = dict(macbook=SPEC)
            release = asyncio.Event()
            entered = asyncio.Event()
            calls = []
            result = dict(available_memory=12 * scheduler.GIB, total_memory=48 * scheduler.GIB,
                          cores=8, load=0, sampled_at=time.time())

            async def probe(*args):
                calls.append(1)
                entered.set()
                await release.wait()
                return result

            with tempfile.TemporaryDirectory() as directory, patch.object(remote_worker, 'probe', probe):
                path = str(Path(directory) / 'probe.sock')

                async def request():
                    reader, writer = await asyncio.open_unix_connection(path)
                    try:
                        writer.write(b'{"operation":"worker-probe","worker":"macbook"}\n')
                        await writer.drain()
                        return json.loads(await reader.readline())['probe']
                    finally:
                        writer.close()
                        await writer.wait_closed()

                async with await asyncio.start_unix_server(instance.handle, path=path):
                    first = asyncio.create_task(request())
                    await entered.wait()
                    second = asyncio.create_task(request())

                    async def connected():
                        while instance.connections < 2:
                            await asyncio.sleep(.001)

                    await asyncio.wait_for(connected(), 1)
                    self.assertFalse(first.done())
                    self.assertFalse(second.done())
                    self.assertIsNone(instance.workers.get('macbook'))
                    release.set()
                    self.assertEqual(await asyncio.gather(first, second), [result, result])
                    self.assertEqual(calls, [1])
                    self.assertEqual(instance.refresh_workers({'macbook'}), [])
                    self.assertEqual(len(instance.worker_probe_tasks), 1)

        asyncio.run(scenario())

    def test_worker_probe_cli_returns_failure_for_missing_null_empty_or_failed_result(self):
        responses = [({}, 125), ({'probe': None}, 125), ({'probe': {}}, 125),
                     ({'probe': {'error': 'unreachable'}}, 125),
                     ({'probe': {'cores': 8, 'sampled_at': time.time()}}, 0)]
        for response, expected in responses:
            with self.subTest(response=response), patch.object(scheduler, 'request', return_value=response), \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(scheduler.client(['--worker', 'macbook', 'worker-probe'], False), expected)

    def helper(self, command, timeout=10, memory_max=128 * 1024 ** 2):
        proc = subprocess.Popen(['node', '--input-type=module', '-e', (SOURCE / 'worker.mjs').read_text(), 'run'],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        proc.stdin.write(json.dumps(dict(command=command, cwd=os.getcwd(), env={}, timeout=timeout,
                                        memory_max=memory_max)) + '\n')
        proc.stdin.flush()
        self.addCleanup(self.cleanup, proc)
        return proc

    def cleanup(self, proc):
        if proc.poll() is None:
            proc.stdin.close()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            if not stream.closed:
                stream.close()

    def events(self, proc):
        events = []
        deadline = time.monotonic() + 12
        selector = selectors.DefaultSelector()
        selector.register(proc.stdout, selectors.EVENT_READ)
        buffer = b''
        try:
            while time.monotonic() < deadline:
                if not selector.select(1):
                    continue
                chunk = os.read(proc.stdout.fileno(), 65536)
                if not chunk:
                    break
                buffer += chunk
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    event = json.loads(line)
                    events.append(event)
                    if event['event'] == 'result':
                        proc.wait(timeout=5)
                        return events
        finally:
            selector.close()
        self.fail('helper did not report a result: ' + repr(events))

    def test_streams_and_exit_status(self):
        events = self.events(self.helper(['sh', '-c', 'printf out; printf err >&2; exit 7']))
        self.assertEqual(events[-1]['exit'], 7)
        self.assertEqual({event['event'] for event in events}, {'stdout', 'stderr', 'result'})

    def test_missing_executable(self):
        self.assertEqual(self.events(self.helper(['/does-not-exist']))[-1]['exit'], 127)

    def test_runtime_limit(self):
        self.assertEqual(self.events(self.helper(['sleep', '30'], timeout=1))[-1]['exit'], 124)

    def test_disconnect_removes_term_ignoring_process_group(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = Path(directory) / 'pid'
            proc = self.helper(['sh', '-c', 'echo $$ > "$1"; trap "" TERM; sleep 30 & wait', 'sh', str(pidfile)])
            deadline = time.monotonic() + 3
            while not pidfile.exists() and time.monotonic() < deadline:
                time.sleep(.05)
            group = int(pidfile.read_text())
            proc.stdin.close()
            result = self.events(proc)[-1]
            self.assertEqual(result['exit'], 130)
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                try:
                    os.killpg(group, 0)
                except ProcessLookupError:
                    break
                time.sleep(.05)
            else:
                self.fail('remote process group survived disconnect')

    def test_sampled_memory_limit(self):
        events = self.events(self.helper(['node', '-e', 'const a=Buffer.alloc(64*1024*1024,1);setInterval(()=>a[0],1000)'],
                                        memory_max=16 * 1024 ** 2))
        self.assertEqual(events[-1]['exit'], 137)
        self.assertGreater(events[-1]['peak_memory'], 16 * 1024 ** 2)


def main():
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(WorkerTests))
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
import asyncio
import contextlib
import io
