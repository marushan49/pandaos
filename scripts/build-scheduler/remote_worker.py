import asyncio
import base64
import contextlib
import json
import math
import os
from pathlib import Path
import re
import selectors
import shlex
import signal
import subprocess
import sys
import time


SOURCE = Path(__file__).resolve().parent
FORWARD_ENV = ('CI', 'NODE_ENV', 'TERM', 'LANG', 'LC_ALL', 'TZ', 'EXPO_NO_TELEMETRY')


def worker_config(config, name):
    workers = config.get('workers', {})
    if not isinstance(name, str) or name == 'local' or name not in workers:
        raise ValueError('unknown optional worker')
    spec = workers[name]
    if not isinstance(spec, dict) or spec.get('enabled') is not True:
        raise ValueError('worker is not enabled')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', spec.get('ssh', '')):
        raise ValueError('worker ssh must be a configured SSH alias')
    node = spec.get('node', '/usr/local/bin/node')
    if not isinstance(node, str) or not node.startswith('/') or '\0' in node:
        raise ValueError('worker node must be absolute')
    for key, maximum in [('memory_budget_gib', 128), ('reserve_memory_gib', 128),
                         ('max_cores', 128), ('max_running', 8)]:
        value = spec.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= maximum:
            raise ValueError('worker ' + key + ' outside bounds')
    mappings = spec.get('path_maps')
    if not isinstance(mappings, list) or not mappings:
        raise ValueError('worker needs explicit path_maps')
    for mapping in mappings:
        if not isinstance(mapping, dict) or any(not isinstance(mapping.get(k), str) or
                not mapping[k].startswith('/') or '\0' in mapping[k] or '..' in Path(mapping[k]).parts
                for k in ('local', 'remote')):
            raise ValueError('invalid worker path mapping')
    env = spec.get('env', {})
    if not isinstance(env, dict) or any(not isinstance(k, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', k)
                                     or not isinstance(v, str) or '\0' in v for k, v in env.items()):
        raise ValueError('invalid worker environment')
    return dict(spec, node=node, env=env)


def map_path(value, spec):
    path = Path(value)
    if '..' in path.parts:
        raise ValueError('worker paths must not contain ..')
    for mapping in sorted(spec['path_maps'], key=lambda m: len(m['local']), reverse=True):
        try:
            relative = path.relative_to(mapping['local'])
            return str(Path(mapping['remote']) / relative)
        except ValueError:
            pass
    raise ValueError('path has no worker mapping: ' + value)


def prepare(req, spec, job_id, timeout, memory_max_gib):
    command = []
    for arg in req['command']:
        if arg.startswith('/') and not arg.startswith(('/usr/bin/', '/bin/')):
            arg = map_path(arg, spec)
        elif arg.startswith('-') and '=/' in arg:
            key, value = arg.split('=', 1)
            arg = key + '=' + map_path(value, spec)
        command.append(arg)
    env = {key: req['env'][key] for key in FORWARD_ENV if key in req['env']}
    env.update(spec['env'])
    env.update(PANDAOS_BUILD_JOB_ID=job_id, PANDAOS_ANDROID_QUEUE_ACTIVE='1')
    return dict(command=command, cwd=map_path(req['cwd'], spec), env=env, timeout=timeout,
                memory_max=int(memory_max_gib * 1024 ** 3))


def ssh_command(spec, operation):
    script = (SOURCE / 'worker.mjs').read_text()
    remote = shlex.join([spec['node'], '--input-type=module', '-e', script, operation])
    return ['/usr/bin/ssh', '-T', '-oBatchMode=yes', '-oConnectTimeout=5', '-oServerAliveInterval=3',
            '-oServerAliveCountMax=2', spec['ssh'], remote]


async def probe(spec, account=None):
    identity = dict(user=account.pw_uid, group=account.pw_gid, extra_groups=[]) if account else {}
    proc = await asyncio.create_subprocess_exec(*ssh_command(spec, 'probe'), stdin=asyncio.subprocess.DEVNULL,
                                              stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                                              **identity)
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), 8)
        if proc.returncode:
            raise ValueError('worker probe failed')
        data = json.loads(out)
        for key in ('available_memory', 'total_memory', 'cores', 'load'):
            if not isinstance(data.get(key), (int, float)) or not math.isfinite(data[key]) or data[key] < 0:
                raise ValueError('invalid worker resource probe')
        return dict(data, sampled_at=time.time())
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()


def run(req, directory):
    directory = Path(directory)
    spec, payload = req['remote']['spec'], req['remote']['payload']
    proc = subprocess.Popen(ssh_command(spec, 'run'), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=None, bufsize=0)
    stopped = []

    def stop(signum, _frame):
        stopped.append(signum)
        with contextlib.suppress(OSError):
            proc.stdin.close()

    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, stop)
    result = None
    start = time.monotonic()
    last_message = start
    deadline = start + payload['timeout'] + 15
    stop_deadline = None
    buffer = b''
    try:
        proc.stdin.write((json.dumps(payload) + '\n').encode())
        selector = selectors.DefaultSelector()
        selector.register(proc.stdout, selectors.EVENT_READ)
        while time.monotonic() < deadline:
            if stopped:
                stop_deadline = stop_deadline or time.monotonic() + 5
                if time.monotonic() >= stop_deadline:
                    break
            if not stopped:
                proc.stdin.write(b'{}\n')
            events = selector.select(2)
            if not events:
                if time.monotonic() - last_message > 15:
                    break
                continue
            chunk = os.read(proc.stdout.fileno(), 65536)
            if not chunk:
                break
            buffer += chunk
            if len(buffer) > 1024 * 1024:
                raise ValueError('worker frame exceeds 1 MiB')
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                event = json.loads(line)
                last_message = time.monotonic()
                kind = event.get('event')
                if kind in ('stdout', 'stderr'):
                    stream = sys.stdout.buffer if kind == 'stdout' else sys.stderr.buffer
                    stream.write(base64.b64decode(event['data'], validate=True))
                    stream.flush()
                elif kind == 'usage':
                    target = directory / 'out' / 'remote.json'
                    temporary = target.with_suffix('.tmp')
                    temporary.write_text(json.dumps(event))
                    temporary.replace(target)
                elif kind == 'result':
                    result = event
            if result is not None:
                break
    except (OSError, ValueError) as exc:
        print('build-scheduler: remote transport failed: ' + type(exc).__name__, file=sys.stderr, flush=True)
    finally:
        if 'selector' in locals():
            selector.close()
        with contextlib.suppress(OSError):
            proc.stdin.close()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
    return result or dict(exit=130 if stopped else 125, reason='remote transport interrupted',
                          wall=round(time.monotonic() - start, 2))
