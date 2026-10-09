#!/usr/bin/python3
import argparse
import asyncio
import base64
import collections
import contextlib
import json
import os
from pathlib import Path
import pwd
import shutil
import signal
import socket
import struct
import subprocess
import sys
import time
import uuid


ROOT = Path('/run/pandaos-android-queue')
SOCKET = ROOT / 'queue.sock'
INSTALL = Path('/usr/local/lib/pandaos-android-queue')
PREFIX = 'pandaos-android-job-'
MAX_REQUEST = 1024 * 1024
MAX_PENDING = 32
MAX_RUNTIME = 7200
MAX_WAIT = 3600


def isolated():
    return any(line.split(':', 2)[-1].strip().startswith('/pandaos.slice/pandaos-android.slice/' + PREFIX)
               for line in Path('/proc/self/cgroup').read_text().splitlines())


async def control(*args):
    proc = await asyncio.create_subprocess_exec('/usr/bin/systemctl', *args,
                                              stdout=asyncio.subprocess.PIPE,
                                              stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), 15)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError('systemctl did not complete within 15 seconds')
    return proc.returncode, out.decode(), err.decode()


async def cleanup():
    code, out, _ = await control('list-units', '--all', '--plain', '--no-legend', PREFIX + '*.service')
    if code:
        raise RuntimeError('cannot enumerate previous queue units')
    units = [line.split()[0] for line in out.splitlines() if line.split() and line.split()[0].startswith(PREFIX)]
    if units:
        code, _, _ = await control('stop', *units)
        if code:
            raise RuntimeError('cannot stop previous queue units')


class Job:
    def __init__(self, request, writer, sequence):
        self.id = uuid.uuid4().hex
        self.unit = PREFIX + self.id + '.service'
        self.request = request
        self.writer = writer
        self.sequence = sequence
        self.state = 'queued'
        self.cancel = asyncio.Event()
        self.done = asyncio.Event()
        self.started = asyncio.Event()
        self.created = time.monotonic()
        self.code = None
        self.reason = None

    def view(self):
        return dict(id=self.id, sequence=self.sequence, state=self.state,
                    unit=self.unit, exit=self.code, reason=self.reason)

    async def send(self, **event):
        try:
            self.writer.write((json.dumps(event) + '\n').encode())
            await asyncio.wait_for(self.writer.drain(), 10)
        except (ConnectionError, asyncio.TimeoutError):
            self.cancel.set()


class Broker:
    def __init__(self, account):
        self.account = account
        self.queue = asyncio.Queue(MAX_PENDING)
        self.jobs = collections.OrderedDict()
        self.sequence = 0
        self.connections = 0

    async def expire_pending(self, job):
        cancel = asyncio.create_task(job.cancel.wait())
        started = asyncio.create_task(job.started.wait())
        try:
            completed, _ = await asyncio.wait([cancel, started], timeout=job.request['queue_timeout'],
                                             return_when=asyncio.FIRST_COMPLETED)
            if job.state != 'queued':
                return
            job.code = 130 if cancel in completed else 124
            job.reason = job.reason or ('canceled' if job.code == 130 else 'queue wait limit')
            job.cancel.set()
            job.state = 'finished'
            await job.send(event='result', **job.view())
            job.done.set()
        finally:
            cancel.cancel()
            started.cancel()
            await asyncio.gather(cancel, started, return_exceptions=True)

    def validate(self, req):
        if not isinstance(req, dict):
            raise ValueError('invalid request')
        cmd, env, cwd = req.get('command'), req.get('env'), req.get('cwd')
        if not isinstance(cmd, list) or not cmd or len(cmd) > 4096 or any(not isinstance(v, str) or '\0' in v for v in cmd):
            raise ValueError('command must be a nonempty argv array')
        if not isinstance(env, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not k or '=' in k or '\0' in k + v for k, v in env.items()):
            raise ValueError('invalid environment')
        if not isinstance(cwd, str) or not os.path.isabs(cwd) or '\0' in cwd:
            raise ValueError('cwd must be absolute')
        for key, maximum in [('timeout', MAX_RUNTIME), ('queue_timeout', MAX_WAIT)]:
            if not isinstance(req.get(key), int) or not 1 <= req[key] <= maximum:
                raise ValueError(key + ' outside host bounds')

    async def handle(self, reader, writer):
        job = None
        admitted = False
        self.connections += 1
        try:
            peer = writer.get_extra_info('socket').getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
            _, uid, _ = struct.unpack('3i', peer)
            if uid not in (0, self.account.pw_uid) or self.connections > MAX_PENDING + 8:
                raise ValueError('unauthorized or too many clients')
            req = json.loads(await asyncio.wait_for(reader.readline(), 5))
            if req.get('operation') == 'status':
                writer.write((json.dumps(dict(jobs=[v.view() for v in self.jobs.values()])) + '\n').encode())
                await writer.drain()
                return
            if req.get('operation') == 'cancel':
                target = self.jobs.get(req.get('id'))
                if not target or target.done.is_set():
                    raise ValueError('job is absent or already finished')
                target.reason = 'canceled'
                target.cancel.set()
                await target.done.wait()
                writer.write((json.dumps(target.view()) + '\n').encode())
                await writer.drain()
                return
            self.validate(req)
            if self.queue.full() or sum(not v.done.is_set() for v in self.jobs.values()) >= MAX_PENDING + 1:
                raise ValueError('queue is full')
            self.sequence += 1
            job = Job(req, writer, self.sequence)
            self.queue.put_nowait(job)
            admitted = True
            self.jobs[job.id] = job
            await job.send(event='queued', **job.view())
            asyncio.create_task(self.expire_pending(job))
            while not job.done.is_set():
                read = asyncio.create_task(reader.readline())
                done = asyncio.create_task(job.done.wait())
                finished, _ = await asyncio.wait([read, done], return_when=asyncio.FIRST_COMPLETED)
                if done in finished:
                    read.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await read
                    break
                done.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await done
                message = read.result()
                if not message or json.loads(message).get('cancel'):
                    job.reason = 'client disconnected' if not message else 'canceled'
                    job.cancel.set()
                    await job.done.wait()
                    break
        except (ValueError, KeyError, asyncio.TimeoutError, ConnectionError, asyncio.QueueFull) as exc:
            if job and not job.done.is_set():
                if admitted:
                    job.cancel.set()
                    await job.done.wait()
                else:
                    job.request.clear()
                    job.code = 125
                    job.reason = 'queue admission failed'
                    job.state = 'finished'
                    job.done.set()
            with contextlib.suppress(ConnectionError):
                error = 'queue is full' if isinstance(exc, asyncio.QueueFull) else str(exc)
                writer.write((json.dumps(dict(event='error', error=error, exit=125)) + '\n').encode())
                await writer.drain()
        finally:
            self.connections -= 1
            writer.close()
            with contextlib.suppress(ConnectionError):
                await writer.wait_closed()

    async def stream(self, job, stream, name):
        while data := await stream.read(8192):
            await job.send(event=name, data=base64.b64encode(data).decode())

    async def run(self, job):
        directory = ROOT / job.id
        proc = None
        streams = []
        tasks = []
        try:
            directory.mkdir(mode=0o750)
            directory.chmod(0o750)
            os.chown(directory, 0, self.account.pw_gid)
            request = directory / 'request.json'
            with request.open('x') as f:
                os.chmod(request, 0o640)
                os.chown(request, 0, self.account.pw_gid)
                json.dump(job.request, f)
            args = ['/usr/bin/systemd-run', '--quiet', '--wait', '--pipe', '--collect',
                    '--service-type=exec', '--unit=' + job.unit,
                    '--uid=' + self.account.pw_name, '--gid=' + str(self.account.pw_gid),
                    '--slice=pandaos-android.slice',
                    '--property=MemoryHigh=6G', '--property=MemoryMax=8G',
                    '--property=MemorySwapMax=0', '--property=CPUQuota=200%',
                    '--property=CPUWeight=20', '--property=TasksMax=512',
                    '--property=OOMPolicy=kill', '--property=KillMode=control-group',
                    '--property=TimeoutStopSec=5s', '--property=SendSIGKILL=yes',
                    '--property=RuntimeMaxSec=' + str(job.request['timeout']),
                    '--property=PartOf=pandaos-android-queue.service',
                    '--property=NoNewPrivileges=yes', '--property=RestrictSUIDSGID=yes',
                    '--property=Nice=10', '--property=UMask=0077',
                    '/usr/bin/python3', str(INSTALL / 'android_queue.py'), 'worker', str(request)]
            proc = await asyncio.create_subprocess_exec(*args, stdin=asyncio.subprocess.DEVNULL,
                                                       stdout=asyncio.subprocess.PIPE,
                                                       stderr=asyncio.subprocess.PIPE)
            job.state = 'running'
            await job.send(event='running', **job.view())
            streams = [asyncio.create_task(self.stream(job, proc.stdout, 'stdout')),
                       asyncio.create_task(self.stream(job, proc.stderr, 'stderr'))]
            tasks = [asyncio.create_task(proc.wait()), asyncio.create_task(job.cancel.wait()),
                     asyncio.create_task(asyncio.sleep(job.request['timeout']))]
            completed, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            if tasks[1] in completed or tasks[2] in completed:
                job.code = 130 if tasks[1] in completed else 124
                job.reason = job.reason or ('canceled' if job.code == 130 else 'runtime limit')
                await control('stop', job.unit)
            await asyncio.wait_for(proc.wait(), 15)
            if job.code is None:
                job.code = proc.returncode if proc.returncode >= 0 else 128 - proc.returncode
            await asyncio.wait_for(asyncio.gather(*streams), 15)
        except Exception as exc:
            job.code = 125
            job.reason = 'queue execution failed: ' + type(exc).__name__
        finally:
            code, _, _ = await control('stop', job.unit)
            code, state, _ = await control('show', job.unit, '--property=ActiveState', '--value')
            if code == 0 and state.strip() not in ('inactive', 'failed', ''):
                raise RuntimeError('job cleanup failed; refusing to run another job')
            if proc and proc.returncode is None:
                proc.kill()
                await proc.wait()
            for task in tasks + streams:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, *streams, return_exceptions=True)
            shutil.rmtree(directory, ignore_errors=True)

    async def work(self):
        while True:
            job = await self.queue.get()
            if job.done.is_set():
                job.request.clear()
                self.queue.task_done()
                continue
            if not job.cancel.is_set() and time.monotonic() - job.created < job.request['queue_timeout']:
                job.state = 'starting'
                job.started.set()
                await self.run(job)
            elif job.cancel.is_set():
                job.code, job.reason = 130, job.reason or 'canceled'
            else:
                job.code, job.reason = 124, 'queue wait limit'
            job.request.clear()
            job.state = 'finished'
            await job.send(event='result', **job.view())
            job.done.set()
            self.queue.task_done()
            finished = [key for key, value in self.jobs.items() if value.done.is_set()]
            for key in finished[:-128]:
                del self.jobs[key]


async def serve():
    account = pwd.getpwnam(os.environ['QUEUE_USER'])
    ROOT.mkdir(exist_ok=True, mode=0o750)
    os.chown(ROOT, 0, account.pw_gid)
    await cleanup()
    for path in ROOT.iterdir():
        if path.is_dir() and len(path.name) == 32:
            shutil.rmtree(path)
    SOCKET.unlink(missing_ok=True)
    broker = Broker(account)
    server = await asyncio.start_unix_server(broker.handle, path=str(SOCKET), limit=MAX_REQUEST)
    os.chmod(SOCKET, 0o660)
    os.chown(SOCKET, 0, account.pw_gid)
    notify = os.environ.get('NOTIFY_SOCKET')
    if notify:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as ready:
            ready.connect('\0' + notify[1:] if notify.startswith('@') else notify)
            ready.sendall(b'READY=1')
    async with server:
        await broker.work()


def worker(request):
    if not isolated():
        raise SystemExit('queue worker requires the system Android slice')
    req = json.loads(Path(request).read_text())
    env = req['env']
    env['PANDAOS_ANDROID_QUEUE_ACTIVE'] = '1'
    os.chdir(req['cwd'])
    try:
        os.execvpe(req['command'][0], req['command'], env)
    except OSError as exc:
        print('queue: cannot launch command: ' + exc.strerror, file=sys.stderr)
        raise SystemExit(127 if exc.errno == 2 else 126)


def client(argv):
    parser = argparse.ArgumentParser(prog='pandaos-android-queue')
    parser.add_argument('--timeout', type=int, default=MAX_RUNTIME)
    parser.add_argument('--queue-timeout', type=int, default=MAX_WAIT)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    cmd = args.command
    if cmd[:1] == ['--']:
        cmd = cmd[1:]
    if cmd == ['status']:
        request = dict(operation='status')
    elif len(cmd) == 2 and cmd[0] == 'cancel':
        request = dict(operation='cancel', id=cmd[1])
    elif cmd:
        if isolated():
            os.execvpe(cmd[0], cmd, dict(os.environ))
        request = dict(command=cmd, env=dict(os.environ), cwd=os.getcwd(), timeout=args.timeout,
                       queue_timeout=args.queue_timeout)
    else:
        parser.error('use -- COMMAND, status, or cancel JOB_ID')
    if not 1 <= args.timeout <= MAX_RUNTIME or not 1 <= args.queue_timeout <= MAX_WAIT:
        parser.error('timeout exceeds host bounds')
    sock = socket.socket(socket.AF_UNIX)
    sock.settimeout(10)
    interrupted = []

    def cancel(signum, _frame):
        interrupted.append(signum)
        with contextlib.suppress(OSError):
            sock.sendall(b'{"cancel":true}\n')

    try:
        sock.connect(str(SOCKET))
        data = (json.dumps(request) + '\n').encode()
        if len(data) > MAX_REQUEST:
            raise ValueError('request exceeds 1 MiB')
        sock.sendall(data)
        sock.settimeout(MAX_RUNTIME + MAX_WAIT + 60)
        for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(signum, cancel)
        with sock.makefile('rb') as f:
            for line in f:
                event = json.loads(line)
                kind = event.get('event')
                if kind in ('stdout', 'stderr'):
                    out = sys.stdout.buffer if kind == 'stdout' else sys.stderr.buffer
                    out.write(base64.b64decode(event['data']))
                    out.flush()
                elif kind in ('queued', 'running'):
                    print('android-queue: ' + kind + ' ' + event['id'] + ' #' + str(event['sequence']), file=sys.stderr)
                elif kind == 'result':
                    return 128 + interrupted[0] if interrupted else event['exit']
                elif kind == 'error':
                    print('android-queue: ' + event['error'], file=sys.stderr)
                    return 125
                else:
                    print(json.dumps(event, indent=2))
                    return event.get('exit', 0) if request['operation'] == 'cancel' else 0
        print('android-queue: broker disconnected; job was not replayed', file=sys.stderr)
        return 125
    except (OSError, ValueError) as exc:
        print('android-queue: ' + str(exc), file=sys.stderr)
        return 125
    finally:
        sock.close()


if __name__ == '__main__':
    if sys.argv[1:2] == ['serve']:
        asyncio.run(serve())
    elif sys.argv[1:2] == ['cleanup']:
        asyncio.run(cleanup())
    elif sys.argv[1:2] == ['worker']:
        worker(sys.argv[2])
    else:
        raise SystemExit(client(sys.argv[1:]))
