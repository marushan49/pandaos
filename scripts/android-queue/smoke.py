#!/usr/bin/python3
import json
import asyncio
import importlib.util
import os
from pathlib import Path
import pwd
import signal
import socket
import subprocess
import sys
import tempfile
import time


CLI = '/usr/local/bin/pandaos-android-queue'
checks = []
children = []


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)


def launch(command, *options, env=None):
    proc = subprocess.Popen([CLI, *options, '--', *command], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, env=env)
    children.append(proc)
    queued = proc.stderr.readline()
    check('job acknowledged', 'queued ' in queued)
    return proc, queued.split()[2]


def run(command, *options, env=None):
    return subprocess.run([CLI, *options, '--', *command], capture_output=True, text=True,
                          timeout=30, env=env)


def gone(pid):
    p = Path('/proc') / str(pid)
    if not p.exists():
        return True
    return p.joinpath('stat').read_text().split(') ', 1)[1].startswith('Z ')


def symlink_smoke(tmp):
    spec = importlib.util.spec_from_file_location('queue_installer', Path(__file__).with_name('install.py'))
    installer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(installer)
    installer.INSTALL = Path(tmp) / 'install'
    installer.BACKUP = Path(tmp) / 'backup'
    installer.INSTALL.mkdir()
    vendor = Path(tmp) / 'vendor'
    vendor.write_text('preserved vendor file')
    link = installer.INSTALL / 'java'
    link.symlink_to(Path(tmp) / 'missing-jdk')
    previous = link.readlink()
    installer.install_link(link, vendor)
    saved = installer.BACKUP / str(link).lstrip('/')
    check('installer repairs dangling owned symlink with symlink backup', link.readlink() == vendor and saved.is_symlink() and saved.readlink() == previous)
    installer.install_link(link, vendor)
    check('installer identical link is idempotent', link.readlink() == vendor and saved.readlink() == previous)
    replacement = Path(tmp) / 'other-jdk'
    replacement.write_text('replacement toolchain')
    installer.install_link(link, replacement)
    check('installer updates live owned link without modifying vendors', link.readlink() == replacement and vendor.read_text() == 'preserved vendor file')
    regular = installer.INSTALL / 'regular'
    regular.write_text('preserve regular entry')
    try:
        installer.install_link(regular, vendor)
    except FileExistsError:
        pass
    else:
        raise AssertionError('installer replaced a regular facade entry')
    check('installer refuses non-symlink entries', regular.read_text() == 'preserve regular entry')
    outside = Path(tmp) / 'outside-link'
    try:
        installer.install_link(outside, vendor)
    except ValueError:
        pass
    else:
        raise AssertionError('installer accepted a link outside its directory')
    check('installer refuses links outside owned directory', not outside.is_symlink())


async def failed_admission_smoke(tmp):
    from android_queue import Broker

    class FullOnPut(asyncio.Queue):
        def put_nowait(self, item):
            raise asyncio.QueueFull

    broker = Broker(pwd.getpwuid(os.getuid()))
    broker.queue = FullOnPut()
    closed = asyncio.Event()

    async def handle(reader, writer):
        try:
            await broker.handle(reader, writer)
        finally:
            closed.set()

    path = str(Path(tmp) / 'admission.sock')
    server = await asyncio.start_unix_server(handle, path=path)
    async with server:
        reader, writer = await asyncio.open_unix_connection(path)
        writer.write((json.dumps(dict(command=['/bin/true'], env={}, cwd=tmp, timeout=1, queue_timeout=1)) + '\n').encode())
        await writer.drain()
        event = json.loads(await asyncio.wait_for(reader.readline(), 2))
        await asyncio.wait_for(closed.wait(), 2)
        writer.close()
        await writer.wait_closed()
    check('unexpected QueueFull returns 125 without waiting on an unadmitted job', event == dict(event='error', error='queue is full', exit=125))
    check('unexpected QueueFull releases connection and leaves no job', broker.connections == 0 and not broker.jobs)


def capacity_smoke():
    pending = []
    active = None
    request = dict(command=['/bin/true'], env=dict(os.environ), cwd=os.getcwd(), timeout=20, queue_timeout=60)

    def connect(payload):
        sock = socket.socket(socket.AF_UNIX)
        sock.settimeout(4)
        try:
            sock.connect('/run/pandaos-android-queue/queue.sock')
            sock.sendall((json.dumps(payload) + '\n').encode())
            return sock, sock.makefile('rb')
        except Exception:
            sock.close()
            raise

    def exchange(payload):
        sock, stream = connect(payload)
        try:
            event = json.loads(stream.readline())
            check_eof = stream.read(1)
            if check_eof:
                raise AssertionError('control connection did not close')
            return event
        finally:
            stream.close()
            sock.close()

    def reject():
        event = exchange(request)
        return event == dict(event='error', error='queue is full', exit=125)

    try:
        active, _ = launch(['/bin/sleep', '60'])
        check('capacity blocker running', 'running ' in active.stderr.readline())
        for index in range(32):
            item = dict(request, queue_timeout=1 if index % 2 == 0 else 60)
            sock, stream = connect(item)
            pending.append((sock, stream, index))
            event = json.loads(stream.readline())
            if event.get('event') != 'queued':
                raise AssertionError('32 pending slots not admitted')
        check('all 32 physical pending slots admitted', len(pending) == 32)
        check('33rd pending job rejects immediately', reject())
        for sock, _, index in pending:
            if index % 2:
                sock.sendall(b'{"cancel":true}\n')
        exits = []
        for _, stream, index in pending:
            event = json.loads(stream.readline())
            if event.get('event') != 'result':
                raise AssertionError('pending cancellation or expiry did not complete')
            exits.append(event['exit'])
        check('16 canceled and 16 expired jobs finish while worker blocked', exits == [124 if index % 2 == 0 else 130 for index in range(32)])
        for sock, stream, _ in pending:
            stream.close()
            sock.close()
        pending.clear()
        check('32 finished tombstones still enforce physical queue capacity', reject())
        check('48 full-queue rejections close clients without connection leaks', all(reject() for _ in range(48)))
        status = exchange(dict(operation='status'))
        check('status remains responsive after capacity rejections', sum(v['state'] != 'finished' for v in status['jobs']) == 1)
        active.terminate()
        active.communicate(timeout=20)
        check('blocked job remains cancelable after rejections', active.returncode == 143)
        result = run(['/bin/true'])
        check('queue accepts and executes new work after tombstones drain', result.returncode == 0)
    finally:
        for sock, stream, _ in pending:
            stream.close()
            sock.close()
        if active and active.poll() is None:
            active.terminate()
            active.communicate(timeout=20)


try:
    initial = json.loads(subprocess.check_output([CLI, 'status'], text=True))
    check('no foreign queue jobs touched', all(v['state'] == 'finished' for v in initial['jobs']))
    result = run(['/bin/sh', '-c', 'printf out; printf err >&2; exit 7'])
    check('stdout stderr and exact exit 7', result.returncode == 7 and result.stdout == 'out' and result.stderr.endswith('err'))
    probe = '''import os,json,pathlib
p=pathlib.Path('/proc/self/cgroup').read_text().strip().split(':',2)[2]
c=pathlib.Path('/sys/fs/cgroup')/p.lstrip('/')
s=c.parent
print(json.dumps(dict(uid=os.getuid(),cg=p,owner=s.stat().st_uid,memory=c.joinpath('memory.max').read_text().strip(),swap=c.joinpath('memory.swap.max').read_text().strip(),cpu=c.joinpath('cpu.max').read_text().strip(),tasks=c.joinpath('pids.max').read_text().strip(),shared_memory=s.joinpath('memory.max').read_text().strip(),shared_swap=s.joinpath('memory.swap.max').read_text().strip(),shared_cpu=s.joinpath('cpu.max').read_text().strip(),shared_tasks=s.joinpath('pids.max').read_text().strip())))'''
    result = run(['/usr/bin/python3', '-c', probe])
    data = json.loads(result.stdout)
    check('system slice is outside PandaOS and root owned', data['cg'].startswith('/pandaos.slice/pandaos-android.slice/pandaos-android-job-') and data['owner'] == 0 and data['uid'] == os.getuid())
    check('hard shared and per-job limits in kernel', all(data[k] == v for k, v in dict(memory='8589934592', swap='0', cpu='200000 100000', tasks='512', shared_memory='8589934592', shared_swap='0', shared_cpu='200000 100000', shared_tasks='512').items()))
    with tempfile.TemporaryDirectory(prefix='.smoke-', dir=Path(__file__).resolve().parent) as tmp:
        symlink_smoke(tmp)
        asyncio.run(failed_admission_smoke(tmp))
        capacity_smoke()
        log = str(Path(tmp) / 'order')
        task = '''import pathlib,sys,time
p=pathlib.Path(sys.argv[1]);n=sys.argv[2]
with p.open('a') as f:f.write(n+' start\\n')
time.sleep(.4)
with p.open('a') as f:f.write(n+' end\\n')'''
        jobs = [launch(['/usr/bin/python3', '-c', task, log, name])[0] for name in ['a', 'b', 'c']]
        for p in jobs:
            p.communicate(timeout=15)
            check('FIFO job exit 0', p.returncode == 0)
        check('FIFO single concurrency', Path(log).read_text().splitlines() == ['a start', 'a end', 'b start', 'b end', 'c start', 'c end'])
        parent = '''import subprocess,time,os
p=subprocess.Popen(['/bin/sleep','60'],start_new_session=True)
print(p.pid,flush=True)
time.sleep(60)'''
        proc, job = launch(['/usr/bin/python3', '-c', parent])
        pid = int(proc.stdout.readline())
        cancel = subprocess.run([CLI, 'cancel', job], capture_output=True, text=True, timeout=20)
        proc.communicate(timeout=20)
        check('explicit cancellation returns 130 and cleans detached child', proc.returncode == 130 and gone(pid))
        proc, job = launch(['/usr/bin/python3', '-c', parent])
        pid = int(proc.stdout.readline())
        proc.send_signal(signal.SIGTERM)
        proc.communicate(timeout=20)
        check('client SIGTERM delivers 143 and cleans child', proc.returncode == 143 and gone(pid))
        proc, job = launch(['/usr/bin/python3', '-c', parent])
        pid = int(proc.stdout.readline())
        proc.kill()
        proc.communicate(timeout=20)
        run(['/bin/true'])
        status = next(v for v in json.loads(subprocess.check_output([CLI, 'status'], text=True))['jobs'] if v['id'] == job)
        check('lost client cleanup', status['exit'] == 130 and gone(pid))
        result = run(['/bin/sleep', '60'], '--timeout', '1')
        check('runtime bound', result.returncode in (124, 143))
        active, job = launch(['/bin/sleep', '3'])
        check('blocker running', 'running ' in active.stderr.readline())
        queued, pending = launch(['/bin/true'])
        before = time.monotonic()
        subprocess.run([CLI, 'cancel', pending], capture_output=True, timeout=20)
        queued.communicate(timeout=20)
        check('pending cancel completes before running job', queued.returncode == 130 and time.monotonic() - before < 2)
        result = run(['/bin/true'], '--queue-timeout', '1')
        check('pending queue wait bound', result.returncode == 124)
        active.communicate(timeout=10)
        result = run(['/bin/sh', '-c', CLI + ' -- /bin/echo nested'])
        check('nested queue guard avoids deadlock', result.returncode == 0 and result.stdout == 'nested\n' and result.stderr.count('queued ') == 1)
        env = dict(os.environ)
        env.update(json.loads(Path('/etc/pandaos-android-queue/agent-env.json').read_text()))
        env['PATH'] = env['PANDAOS_ANDROID_QUEUE_BIN'] + ':' + env['JAVA_HOME'] + '/bin:' + env['PATH']
        facade = subprocess.run([env['JAVA_HOME'] + '/bin/java', '-version'], env=env, capture_output=True, text=True, timeout=30)
        check('JAVA_HOME/bin/java guard executes real JDK21', facade.returncode == 0 and 'queued ' in facade.stderr and 'version "21' in facade.stderr)
        wrapper = Path(tmp) / 'gradlew-probe'
        wrapper.write_text('''#!/bin/sh
exec "$JAVA_HOME/bin/java" -version
''')
        wrapper.chmod(0o755)
        wrapped = subprocess.run([str(wrapper)], env=env, capture_output=True, text=True, timeout=30)
        check('direct Gradle launcher JAVA_HOME pattern queues', wrapped.returncode == 0 and 'queued ' in wrapped.stderr)
        emulator = subprocess.run([env['ANDROID_HOME'] + '/emulator/emulator', '-version'], env=env, capture_output=True, text=True, timeout=30)
        check('SDK-relative emulator guard without starting AVD', emulator.returncode == 0 and 'queued ' in emulator.stderr and 'Android emulator version' in emulator.stdout)
        result = subprocess.run([CLI, '--', '/not/an/executable'], capture_output=True, text=True, timeout=20)
        check('missing executable delivers exit 127', result.returncode == 127)
    print(json.dumps(dict(passed=True, checks=checks, kernel_limits=data), indent=2))
finally:
    for child in children:
        if child.poll() is None:
            child.terminate()
            try:
                child.communicate(timeout=20)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate(timeout=5)
